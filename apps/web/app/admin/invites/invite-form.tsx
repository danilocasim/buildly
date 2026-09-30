"use client";

import { useActionState } from "react";
import { addInvite, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(addInvite, {
    message: "",
  });
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label htmlFor="invite-email">Email</label>
      <input id="invite-email" name="email" type="email" required placeholder="name@example.com" />
      <button type="submit" disabled={pending}>
        Add invite
      </button>
      <span role="status" style={{ color: state.error ? "#DC2626" : "#737373" }}>
        {state.message}
      </span>
    </form>
  );
}
