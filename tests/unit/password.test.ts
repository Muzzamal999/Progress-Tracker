import test from "node:test";
import assert from "node:assert/strict";
import { passwordStrength, validatePassword } from "../../src/lib/password";

test("rejects short, letter-only, digit-only and common passwords", () => {
  assert.match(validatePassword("abc12") ?? "", /at least 8/);
  assert.match(validatePassword("abcdefgh") ?? "", /letter and one number/);
  assert.match(validatePassword("12345678") ?? "", /letter and one number/);
  assert.match(validatePassword("Password123") ?? "", /too common/);
  assert.match(validatePassword("x".repeat(80) + "1") ?? "", /at most/);
});
test("rejects a password containing the email name", () => {
  assert.match(validatePassword("muzzamal2030x", { email: "muzzamal@example.com" }) ?? "", /email name/);
});
test("accepts reasonable passwords", () => {
  assert.equal(validatePassword("river-Stone-42"), null);
  assert.equal(validatePassword("hunter2hunter2"), null);
});
test("strength meter is monotone for increasingly strong input", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("password123"), 0);
  assert.ok(passwordStrength("abcd1234") < passwordStrength("Abcd1234efgh!"));
});
