import { requireOrg } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Nav } from "@/components/nav";

export default async function DashLayout({ children }: LayoutProps<"/">) {
  const org = await requireOrg();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">Commons</span>
            <span className="text-[13px] text-muted">{org.name}</span>
          </div>
          <Nav />
          <form action={logout} className="ml-auto">
            <button className="text-[13px] text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
