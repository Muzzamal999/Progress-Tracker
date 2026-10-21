import "server-only";
import { createClient } from "./supabase/server";
import type { MyWindow } from "@/components/student/SubmissionWindow";

/** The signed-in student's submission windows, evaluated by the database (never by the browser). */
export async function getMyWindows(): Promise<MyWindow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_deadlines");
  if (error) {
    console.error("my_deadlines failed", error.message);
    return [];
  }
  return (data ?? []) as MyWindow[];
}
