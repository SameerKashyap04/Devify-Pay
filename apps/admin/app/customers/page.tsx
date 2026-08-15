"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  application: string;
  orders: number;
  payments: number;
  subscriptions: number;
  created_at: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [q, setQ] = useState("");
  const [deduping, setDeduping] = useState(false);

  const load = useCallback(
    async (query: string) => {
      const res = await adminApiFetch(`/v1/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setCustomers(data.data);
    },
    [router]
  );

  useEffect(() => {
    load("");
  }, [load]);

  const handleDedupe = async () => {
    setDeduping(true);
    try {
      await adminApiFetch("/v1/admin/customers/dedupe", { method: "POST" });
      await load(q);
    } catch (e) {
      console.error("Deduplication error:", e);
    } finally {
      setDeduping(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
          </div>
          <button
            onClick={handleDedupe}
            disabled={deduping}
            className="rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {deduping ? "Cleaning up..." : "Clean Up Duplicates"}
          </button>
        </div>

        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(q)}
            placeholder="Search by name, email, or phone..."
            className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {customers === null ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No customers found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Payments</th>
                  <th className="px-4 py-3">Subs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">{c.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3">{c.application}</td>
                    <td className="px-4 py-3">{c.orders}</td>
                    <td className="px-4 py-3">{c.payments}</td>
                    <td className="px-4 py-3">{c.subscriptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
