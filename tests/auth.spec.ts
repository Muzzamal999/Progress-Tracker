import { expect, test, type Page } from "@playwright/test";

const AUTH = "**/auth/v1/**";

// Next.js adds its own role="alert" route announcer to every page.
const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Wait until React has hydrated; before that a submit would be a native form post (the original bug). */
async function submitHydrated(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).click();
}

test("register validates in-page without reloading", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Test Student");
  await page.getByLabel("Email").fill("student@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("different123");
  await submitHydrated(page, "Create account");
  await expect(alert(page)).toHaveText("Passwords do not match");
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel("Full name")).toHaveValue("Test Student");
});

test("unconfirmed login offers to resend the confirmation email", async ({ page }) => {
  let resendBody: Record<string, unknown> | undefined;
  await page.route(AUTH, async (route) => {
    const url = route.request().url();
    if (url.includes("/token")) {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" }) });
    }
    if (url.includes("/resend")) {
      resendBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fallback();
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("new@example.com");
  await page.getByLabel("Password").fill("password123");
  await submitHydrated(page, "Sign in");
  await expect(alert(page)).toContainText("not confirmed");

  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  await expect(page.getByRole("status")).toContainText("new@example.com");
  expect(resendBody).toMatchObject({ type: "signup", email: "new@example.com" });
});

test("wrong credentials show a generic error", async ({ page }) => {
  await page.route(AUTH, (route) =>
    route.request().url().includes("/token")
      ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }) })
      : route.fallback(),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("a@example.com");
  await page.getByLabel("Password").fill("whatever1");
  await submitHydrated(page, "Sign in");
  await expect(alert(page)).toHaveText("Invalid email or password");
  await expect(page.getByRole("button", { name: "Resend confirmation email" })).toHaveCount(0);
});

test("forgot password sends a reset link pointing at /reset-password", async ({ page }) => {
  let recoverUrl = "";
  await page.route(AUTH, (route) => {
    if (!route.request().url().includes("/recover")) return route.fallback();
    recoverUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill("student@example.com");
  await submitHydrated(page, "Send reset link");
  await expect(page.getByRole("status")).toContainText("reset link");
  expect(decodeURIComponent(recoverUrl)).toContain("/reset-password");
});

test("reset page without a valid link shows an expired message", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(alert(page)).toContainText("invalid or has expired", { timeout: 8000 });
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});
