import Link from "next/link";
import { Compass } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center justify-center bg-background px-4 py-20">
        <div className="max-w-md text-center">
          <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-gradient text-white shadow-lg shadow-primary/30">
            <Compass className="h-8 w-8" aria-hidden="true" />
          </span>
          <h1 className="mb-2 text-6xl font-extrabold">404</h1>
          <p className="mb-8 text-lg text-muted-foreground">We couldn&apos;t find that page. It may have moved, or the link may be wrong.</p>
          <Button asChild size="lg">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
