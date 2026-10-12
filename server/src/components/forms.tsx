"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions";
import { Button, Code, Input } from "./ui";

type Field = { name: string; label: string; type?: string; placeholder?: string; required?: boolean; defaultValue?: string };

/** A small form bound to a server action; shows errors, a success line and one-time secrets. */
export function ActionForm({ action, fields, submit }: { action: (s: FormState, f: FormData) => Promise<FormState>; fields: Field[]; submit: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-3">
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="mb-1 block text-[13px] font-medium">{f.label}</span>
          <Input name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required={f.required} defaultValue={f.defaultValue} />
        </label>
      ))}
      <Button disabled={pending}>{pending ? "Working…" : submit}</Button>
      <StateView state={state} />
    </form>
  );
}

export function StateView({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <div className="space-y-2">
      {state.error && <p className="text-[13px] text-warn">{state.error}</p>}
      {state.ok && <p className="text-[13px] text-good">{state.ok}</p>}
      {state.secrets && <Code>{Object.entries(state.secrets).map(([k, v]) => `${k}: ${v}`).join("\n")}</Code>}
    </div>
  );
}

export function RotateToken({ action }: { action: () => Promise<FormState> }) {
  const [state, run, pending] = useActionState(async () => action(), undefined);
  return (
    <form action={run} className="space-y-2">
      <Button variant="outline" disabled={pending}>{pending ? "Rotating…" : "Create a new org token"}</Button>
      <StateView state={state} />
    </form>
  );
}
