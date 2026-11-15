import { requireAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { NewUserForm, UserRow } from "./UserForms";

export default async function UsersPage() {
  const me = await requireAdmin();
  const supabase = await createUserClient();
  const { data: users } = await supabase.from("staff_profiles").select("user_id, full_name, email, role, active, created_at").order("created_at");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-steel uppercase">Users</h1>
        <p className="text-sm text-steel/60">Staff can handle bookings and the schedule. Admins can also see sales, analytics, settings, and users.</p>
      </div>
      <div className="card divide-y divide-kitchen-light">
        {(users ?? []).map((u) => (
          <UserRow key={u.user_id} u={u} isMe={u.user_id === me.id} />
        ))}
      </div>
      <NewUserForm />
    </div>
  );
}
