"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "./ui";

const LINKS = [
  { href: "/", label: "Analytics" },
  { href: "/skills", label: "Skills" },
  { href: "/live", label: "Live events" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => (
        <NavLink key={l.href} href={l.href} active={l.href === "/" ? path === "/" : path.startsWith(l.href)}>{l.label}</NavLink>
      ))}
    </nav>
  );
}
