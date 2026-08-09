"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminApiFetch } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/applications", label: "Applications" },
  { href: "/customers", label: "Customers" },
  { href: "/payments", label: "Payments" },
  { href: "/refunds", label: "Refunds" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/reports", label: "Reports" },
  { href: "/audit-logs", label: "Audit Logs" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await adminApiFetch("/v1/admin/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-56 shrink-0 border-r border-gray-100 bg-white min-h-screen p-4 flex flex-col">
      <div className="mb-6 px-2">
        <div className="text-xs uppercase tracking-wide text-gray-400">Devify</div>
        <div className="text-lg font-semibold text-gray-900">Pay Admin</div>
      </div>
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={logout}
        className="mt-4 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        Sign out
      </button>
    </aside>
  );
}
