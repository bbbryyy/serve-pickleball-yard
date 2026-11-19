"use client";

import { useActionState, useState, useTransition } from "react";
import { createStaffUser, updateStaffUser, type FormResult } from "../../admin-actions";

type U = { user_id: string; full_name: string; email: string; role: "staff" | "admin"; active: boolean };

export function UserRow({ u, isMe }: { u: U; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<FormResult>({});
  const run = (patch: Parameters<typeof updateStaffUser>[1]) => start(async () => setRes(await updateStaffUser(u.user_id, patch)));
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-[200px] flex-1">
        <p className={`font-semibold ${u.active ? "text-steel" : "text-steel/40 line-through"}`}>
          {u.full_name} {isMe && <span className="text-xs font-normal text-steel/60">(you)</span>}
        </p>
        <p className="text-xs text-steel/60">{u.email}</p>
      </div>
      <select
        className="input w-auto"
        value={u.role}
        disabled={isMe || pending}
        onChange={(e) => run({ role: e.target.value as U["role"] })}
        aria-label={`Role for ${u.full_name}`}
      >
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      <button className="btn-ghost px-3 py-1.5" disabled={isMe || pending} onClick={() => run({ active: !u.active })}>
        {u.active ? "Deactivate" : "Reactivate"}
      </button>
      {(res.error || res.ok) && <p className={`w-full text-sm ${res.error ? "text-red-700" : "text-court"}`}>{res.error ?? res.ok}</p>}
    </div>
  );
}

export function NewUserForm() {
  const [state, action, pending] = useActionState<FormResult, FormData>(createStaffUser, {});
  return (
    <form action={action} className="card grid gap-3 p-5 sm:grid-cols-2">
      <h2 className="text-sm font-bold text-steel uppercase sm:col-span-2">Add a user</h2>
      <input name="full_name" placeholder="Full name" className="input" required aria-label="Full name" />
      <input name="email" type="email" placeholder="Email" className="input" required aria-label="Email" />
      <input name="password" type="text" placeholder="Temporary password (10+ characters)" className="input" required minLength={10} autoComplete="new-password" aria-label="Temporary password" />
      <select name="role" className="input" defaultValue="staff" aria-label="Role">
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      {(state.error || state.ok) && (
        <p className={`rounded-md px-3 py-2 text-sm sm:col-span-2 ${state.error ? "bg-red-50 text-red-700" : "bg-ball/30 text-ball-dark"}`}>{state.error ?? state.ok}</p>
      )}
      <button className="btn-court sm:col-span-2 sm:w-fit" disabled={pending}>{pending ? "Adding…" : "Add user"}</button>
    </form>
  );
}
