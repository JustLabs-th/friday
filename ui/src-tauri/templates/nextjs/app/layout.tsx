import type { Metadata } from "next";
import { UserBar } from "@/components/user-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "__NAME__",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <UserBar title="__NAME__" />
        {children}
      </body>
    </html>
  );
}
