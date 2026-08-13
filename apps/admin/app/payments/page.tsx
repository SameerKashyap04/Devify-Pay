"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

interface PendingPayment {
  payment_id: string;
  order_id: string;
  application: string;
  customer: string;
  amount: number;
  currency: string;
  transaction_ref: string | null;
  created_at: string;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PendingPayment[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminApiFetch("/v1/admin/payments/pending-verification");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setPayments(data.data);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(paymentId: string, action: "APPROVE" | "REJECT") {
    const confirmed = window.confirm(
      action === "APPROVE"
        ? `Approve payment ${paymentId}? This marks it as SUCCESS and notifies the application.`
        : `Reject payment ${paymentId}? This marks it as FAILED.`
    );
    if (!confirmed) return;

    setBusyId(paymentId);
    setError(null);
    try {
      const res = await adminApiFetch(`/v1/admin/payments/${paymentId}/verify`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Action failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
          <h1 className="text-2xl font-semibold text-gray-900">Pending Verification</h1>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {payments === null ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            No payments pending verification. Nothing to review right now.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">App</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Txn Ref</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.payment_id}>
                  <td className="px-4 py-3 font-mono text-xs">{p.payment_id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.order_id}</td>
                  <td className="px-4 py-3">{p.application}</td>
                  <td className="px-4 py-3 text-gray-600">{p.customer}</td>
                  <td className="px-4 py-3 font-medium">
                    ₹{(p.amount / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{p.transaction_ref}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      disabled={busyId === p.payment_id}
                      onClick={() => act(p.payment_id, "APPROVE")}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === p.payment_id}
                      onClick={() => act(p.payment_id, "REJECT")}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Reject
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
