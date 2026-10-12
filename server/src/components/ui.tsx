import Link from "next/link";
import type { ReactNode } from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ title, sub, children, className, action }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-line bg-card", className)}>
      {title && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("px-5 pb-5", !title && "pt-5")}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

/** Horizontal bar against a max, for ranked lists. */
export function Meter({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-soft">
      <div className="h-2 rounded-full bg-data" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export function Sparkline({ values, width = 88, height = 22 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--data)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        tone === "neutral" && "border-line text-muted",
        tone === "good" && "border-good/40 text-good",
        tone === "warn" && "border-warn/50 text-warn",
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">{children}</p>;
}

export function Button({ children, variant = "default", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-50",
        variant === "default" && "bg-ink text-page hover:opacity-90",
        variant === "outline" && "border border-line bg-card hover:bg-soft",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn("h-9 w-full rounded-md border border-line bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-data/30", p.className)} />;
}

export function Code({ children }: { children: ReactNode }) {
  return <pre className="overflow-x-auto rounded-md border border-line bg-soft p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">{children}</pre>;
}

export function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={cn("rounded-md px-2.5 py-1.5 text-[13px] font-medium", active ? "bg-soft text-ink" : "text-muted hover:text-ink")}>
      {children}
    </Link>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const ago = (d: Date | string | null) => {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return `${Math.max(1, Math.round(s))}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
