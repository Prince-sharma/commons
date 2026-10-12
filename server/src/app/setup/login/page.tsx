import { superLogin } from "@/lib/actions";
import { ActionForm } from "@/components/forms";

export default function SetupLogin() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="text-xl font-semibold tracking-tight">Commons setup</h1>
      <p className="mt-1 mb-6 text-[13px] text-muted">For the person running this Commons server. Uses SUPERADMIN_PASSWORD.</p>
      <ActionForm action={superLogin} submit="Continue" fields={[{ name: "password", label: "Setup password", type: "password", required: true }]} />
    </main>
  );
}
