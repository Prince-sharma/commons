import { login } from "@/lib/actions";
import { ActionForm } from "@/components/forms";

export default function Login() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="text-xl font-semibold tracking-tight">Commons</h1>
      <p className="mt-1 mb-6 text-[13px] text-muted">Sign in with the organization ID and password from your setup email.</p>
      <ActionForm
        action={login}
        submit="Sign in"
        fields={[
          { name: "org", label: "Organization ID", placeholder: "acme-1a2b", required: true },
          { name: "password", label: "Password", type: "password", required: true },
        ]}
      />
    </main>
  );
}
