"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <Card className="mx-auto max-w-xl" role="alert">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="mt-1 text-muted-foreground">We couldn&apos;t load the data. Please check your connection and try again.</p>
        </div>
        <Button
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
