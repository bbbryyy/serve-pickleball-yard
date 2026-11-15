import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createUserClient } from "./supabase/server";

export type StaffRole = "staff" | "admin";
export type StaffUser = { id: string; email: string; fullName: string; role: StaffRole };

/** The signed-in, active backoffice user, or null. */
export const getStaffUser = cache(async (): Promise<StaffUser | null> => {
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("staff_profiles")
    .select("full_name, email, role, active")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!data || !data.active) return null;
  return { id: auth.user.id, email: data.email, fullName: data.full_name, role: data.role };
});

export async function requireStaff(): Promise<StaffUser> {
  const user = await getStaffUser();
  if (!user) redirect("/backoffice/login");
  return user;
}

export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/backoffice?denied=1");
  return user;
}
