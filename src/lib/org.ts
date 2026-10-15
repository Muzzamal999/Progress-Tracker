import { createAnonClient } from "./supabase/anon";
import { DEFAULT_ORG, type OrgSettings } from "./workflow-types";

/** Organisation branding (public, non-sensitive). Falls back to defaults if the row can't be read. */
export async function getOrg(): Promise<OrgSettings> {
  try {
    const { data } = await createAnonClient().from("organization_settings").select("*").maybeSingle();
    return { ...DEFAULT_ORG, ...(data ?? {}) } as OrgSettings;
  } catch {
    return DEFAULT_ORG;
  }
}
