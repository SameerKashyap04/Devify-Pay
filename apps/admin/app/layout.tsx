import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Devify Pay — Admin",
  description: "Devify Pay admin dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
