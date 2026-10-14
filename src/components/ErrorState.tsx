"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ message = "We couldn't load the data. Please check your connection and try again." }: { message?: string }) {
  const router = useRouter();
  return (
    <div role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center shadow-(--shadow-card)">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
      <Button onClick={() => router.refresh()}>Try again</Button>
    </div>
  );
}
