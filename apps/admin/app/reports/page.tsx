"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

import AppShell from "../components/AppShell";

const REPORTS = [
  { key: "revenue", label: "Revenue Report", description: "Successful payments and their amounts" },
  { key: "payments", label: "Payment Report", description: "All payments across every status" },
  { key: "refunds", label: "Refund Report", description: "All refunds and their outcomes" },
  { key: "subscriptions", label: "Subscription Report", description: "All subscriptions across every status" },
  { key: "applications", label: "Application Report", description: "Per-application order/payment/customer counts" },
];

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {REPORTS.map((r) => (
            <div key={r.key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">{r.label}</div>
              <div className="mt-1 text-xs text-gray-500">{r.description}</div>
              <a
                href={`${API_URL}/v1/admin/reports/${r.key}?format=csv`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Export CSV
              </a>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
