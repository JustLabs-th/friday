"use client";

import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  name: string;
  employeeId: string;
  email: string;
  /** The sign-out address (empty on your own computer, where there is no sign-in). */
  signOut: string;
};

type Theme = "light" | "dark" | "system";

/** Puts the theme on <html> (the same rule as the script that runs before the page is drawn). */
function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** The profile button at the right of the top bar: a shadcn dropdown with who the person is, the theme and sign out. */
export function ProfileMenu({ name, employeeId, email, signOut }: Props) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
  }, []);

  // "system" follows the computer while the page is open
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [theme]);

  function choose(value: string) {
    const next = value as Theme;
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" className="rounded-full font-bold" aria-label="โปรไฟล์">
          {(name || employeeId).trim().charAt(0).toUpperCase() || "?"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5 font-normal">
          <p className="truncate text-sm font-semibold">{name || employeeId}</p>
          {employeeId && <p className="truncate text-xs text-muted-foreground">รหัสพนักงาน {employeeId}</p>}
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">ธีม</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
          <DropdownMenuRadioItem value="light">
            <Sun /> สว่าง
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> มืด
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> ตามเครื่อง
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {signOut ? (
          <DropdownMenuItem asChild>
            <a href={signOut}>
              <LogOut /> ออกจากระบบ
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">เครื่องของคุณเอง: ไม่มีการล็อกอิน</DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
