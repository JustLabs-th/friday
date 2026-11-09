import { Zap } from "lucide-react";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { NavLinks, type NavLink } from "@/components/nav-links";
import { ProfileMenu } from "@/components/profile-menu";
import { Button } from "@/components/ui/button";
import { getUser, signInUrl, signOutUrl } from "@/lib/user";

/**
 * The top bar of every page. Two parts:
 *  - left: the system's icon and name. These are yours to change: pass `title` and `icon` in app/layout.tsx.
 *      <UserBar title="ระบบบันทึกงาน" icon={<ClipboardList className="size-5" />} />
 *    `icon` is any lucide-react icon (https://lucide.dev) or an <img>; `links` adds a menu next to the name (optional).
 *  - right: sign-in / profile / sign-out. Built in; do not change it.
 */
export async function UserBar({ title, icon, links = [] }: { title?: string; icon?: ReactNode; links?: NavLink[] }) {
  const user = await getUser();
  const [signOut, signIn] = await Promise.all([signOutUrl(), signInUrl()]);
  const h = await headers();
  const name = title || (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(".")[0] || "ระบบ";
  return (
    <>
    {/* sets the theme (light, dark or system) before the page is drawn, so it does not flash */}
    <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
    <header className="sticky top-0 z-50 border-b border-white/10 bg-bar text-bar-foreground">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
        <span className="flex shrink-0 items-center text-primary" aria-hidden="true">
          {icon ?? <Zap className="size-5" fill="currentColor" />}
        </span>
        <span className="text-white/30" aria-hidden="true">/</span>
        <span className="shrink-0 text-sm font-semibold">{name}</span>
        <div className="min-w-0 flex-1 text-sm text-white/80">
          <NavLinks links={links} />
        </div>
        {user.username ? (
          <ProfileMenu name={user.name || user.username} employeeId={user.employeeId} email={user.email} signOut={signOut ?? ""} />
        ) : signIn ? (
          <Button size="sm" asChild>
            <a href={signIn}>เข้าสู่ระบบ</a>
          </Button>
        ) : null}
      </div>
    </header>
    </>
  );
}

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();`;
