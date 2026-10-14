"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={logout} className="w-full justify-start border-navy-border bg-transparent text-navy-foreground hover:bg-white/10 hover:text-white">
      <LogOut /> Logout
    </Button>
  );
}
