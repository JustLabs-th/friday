"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export type NavLink = { href: string; label: string };

/** The menu in the top bar (shadcn buttons): the page the person is on is highlighted. */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  if (links.length === 0) return null;
  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="เมนูหลัก">
      {links.map(link => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Button
            key={link.href}
            variant="ghost"
            size="sm"
            asChild
            className={`text-bar-foreground/80 hover:bg-white/10 hover:text-white ${active ? "bg-white/10 font-semibold text-white" : ""}`}
          >
            <Link href={link.href} aria-current={active ? "page" : undefined}>
              {link.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
