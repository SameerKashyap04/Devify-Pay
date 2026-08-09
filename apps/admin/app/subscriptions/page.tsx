"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "@/lib/api";
import AppShell from "../components/AppShell";

interface SubRow {
  subscription_id: string;
  application: string;
  plan: string;
  customer: string;
  status: string;
  created_at: string;
}

export default function SubscriptionsPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await adminApiFetch("/v1/admin/reports/subscriptions");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setSubs(data.data);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    TRIALING: "bg-blue-100 text-blue-700",
    PAST_DUE: "bg-amber-100 text-amber-700",
    CANCELLED: "bg-gray-100 text-gray-600",
    EXPIRED: "bg-gray-100 text-gray-500",
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">Subscriptions</h1>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {subs === null ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : subs.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No subscriptions yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subs.map((s) => (
                  <tr key={s.subscription_id}>
                    <td className="px-4 py-3 font-mono text-xs">{s.subscription_id}</td>
                    <td className="px-4 py-3">{s.application}</td>
                    <td className="px-4 py-3">{s.plan}</td>
                    <td className="px-4 py-3 text-gray-600">{s.customer}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[s.status] ?? ""}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
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
