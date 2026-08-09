"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "@/lib/api";
import AppShell from "../components/AppShell";

interface RefundRow {
  id: string;
  payment_id: string;
  application: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export default function RefundsPage() {
  const router = useRouter();
  const [refunds, setRefunds] = useState<RefundRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refText, setRefText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await adminApiFetch("/v1/admin/refunds");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setRefunds(data.data);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function record(id: string, outcome: "SUCCESS" | "FAILED") {
    const confirmed = window.confirm(
      outcome === "SUCCESS"
        ? `Confirm you have processed refund ${id} through the actual bank/provider interface, then record it as SUCCESS?`
        : `Mark refund ${id} as FAILED?`
    );
    if (!confirmed) return;

    setBusyId(id);
    try {
      await adminApiFetch(`/v1/admin/refunds/${id}/record`, {
        method: "POST",
        body: JSON.stringify({ outcome, provider_ref: refText[id] || undefined }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">Refunds</h1>
          <p className="mt-1 text-sm text-gray-500">
            Process each refund manually through the actual bank/merchant interface, then record the outcome here.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {refunds === null ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : refunds.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No refunds pending.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Refund</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">App</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Provider Ref</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.payment_id}</td>
                    <td className="px-4 py-3">{r.application}</td>
                    <td className="px-4 py-3 font-medium">₹{(r.amount / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500">{r.reason ?? "—"}</td>
                    <td className="px-4 py-3">
                      <input
                        value={refText[r.id] ?? ""}
                        onChange={(e) => setRefText((s) => ({ ...s, [r.id]: e.target.value }))}
                        placeholder="Bank ref"
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        disabled={busyId === r.id}
                        onClick={() => record(r.id, "SUCCESS")}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Mark Success
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => record(r.id, "FAILED")}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Mark Failed
                      </button>
                    </td>
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
