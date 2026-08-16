"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

interface TransactionRow {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  reference_id: string | null;
  provider: string;
  created_at: string;

  application_id: string;
  application_name: string;

  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;

  payment_id: string | null;
  payment_method: string | null;
  payment_transaction_ref: string | null;

  order_id: string | null;
  order_description: string | null;

  plan_name: string | null;
  plan_description: string | null;
  plan_interval: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  PENDING: "bg-amber-100 text-amber-700 border border-amber-200",
  FAILED: "bg-red-100 text-red-700 border border-red-200",
  REFUNDED: "bg-blue-100 text-blue-700 border border-blue-200",
};

const TYPE_STYLES: Record<string, string> = {
  PAYMENT: "bg-indigo-50 text-indigo-700",
  REFUND: "bg-sky-50 text-sky-700",
  SUBSCRIPTION: "bg-violet-50 text-violet-700",
  PAYOUT: "bg-orange-50 text-orange-700",
};

const DAYS_OPTIONS = [
  { label: "All Time", value: "" },
  { label: "7 Days", value: "7" },
  { label: "30 Days", value: "30" },
  { label: "90 Days", value: "90" },
];

function formatAmount(amount: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : currency + " ";
  return `${symbol}${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (daysFilter) params.set("days", daysFilter);
    if (search) params.set("q", search);
    const qs = params.toString();
    const res = await adminApiFetch(`/v1/admin/transactions${qs ? `?${qs}` : ""}`);
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setRows(data.data ?? []);
    setTotal(data.total ?? 0);
  }, [router, statusFilter, typeFilter, daysFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const totalRevenue = rows
    ? rows.filter((r) => r.status === "SUCCESS" && r.type === "PAYMENT").reduce((s, r) => s + r.amount, 0)
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Transaction History</h1>
            <p className="mt-1 text-sm text-gray-500">All payment transactions with customer, app &amp; subscription details</p>
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Stats row */}
        {rows && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Shown", value: total, accent: false },
              {
                label: "Successful",
                value: rows.filter((r) => r.status === "SUCCESS").length,
                accent: false,
              },
              {
                label: "Pending",
                value: rows.filter((r) => r.status === "PENDING").length,
                accent: rows.filter((r) => r.status === "PENDING").length > 0,
              },
              {
                label: "Revenue (SUCCESS)",
                value: formatAmount(totalRevenue, "INR"),
                accent: false,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl border p-4 shadow-sm ${stat.accent ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-white"}`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{stat.label}</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search customer, app, reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-72 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All Types</option>
            <option value="PAYMENT">Payment</option>
            <option value="REFUND">Refund</option>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="PAYOUT">Payout</option>
          </select>

          <div className="flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDaysFilter(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  daysFilter === opt.value
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {rows === null ? (
            <div className="p-12 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-400">Loading transactions…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm font-medium text-gray-500">No transactions found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">App</th>
                    <th className="px-5 py-3 font-semibold">Subscription / Description</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => (
                    <>
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                      >
                        {/* Customer */}
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-gray-900 truncate max-w-[160px]">{row.customer_name}</div>
                          {row.customer_email && (
                            <div className="text-xs text-gray-400 truncate max-w-[160px]">{row.customer_email}</div>
                          )}
                          {!row.customer_email && row.customer_phone && (
                            <div className="text-xs text-gray-400">{row.customer_phone}</div>
                          )}
                        </td>

                        {/* App */}
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-gray-800">{row.application_name}</span>
                        </td>

                        {/* Subscription / Description */}
                        <td className="px-5 py-3.5 max-w-[200px]">
                          {row.plan_name ? (
                            <div>
                              <div className="font-medium text-violet-700 text-xs">{row.plan_name}</div>
                              {row.plan_description && (
                                <div className="text-xs text-gray-500 truncate">{row.plan_description}</div>
                              )}
                              {row.plan_interval && (
                                <div className="text-xs text-gray-400">{row.plan_interval}</div>
                              )}
                            </div>
                          ) : row.order_description ? (
                            <span className="text-xs text-gray-500 truncate block">{row.order_description}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="px-5 py-3.5 font-semibold text-gray-900 tabular-nums">
                          {formatAmount(row.amount, row.currency)}
                        </td>

                        {/* Type */}
                        <td className="px-5 py-3.5">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[row.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.type}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.status}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>

                        {/* Expand toggle */}
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-gray-400 text-xs select-none">
                            {expandedId === row.id ? "▲ Hide" : "▼ More"}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expandedId === row.id && (
                        <tr key={`${row.id}-detail`} className="bg-indigo-50/30">
                          <td colSpan={8} className="px-5 py-4">
                            <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                              <div>
                                <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Transaction ID</div>
                                <div className="font-mono text-gray-700 break-all">{row.id}</div>
                              </div>
                              {row.payment_id && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Payment ID</div>
                                  <div className="font-mono text-gray-700">{row.payment_id}</div>
                                </div>
                              )}
                              {row.order_id && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Order ID</div>
                                  <div className="font-mono text-gray-700">{row.order_id}</div>
                                </div>
                              )}
                              {row.payment_transaction_ref && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">UPI Txn Ref</div>
                                  <div className="font-mono text-gray-700">{row.payment_transaction_ref}</div>
                                </div>
                              )}
                              {row.reference_id && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Reference</div>
                                  <div className="font-mono text-gray-700">{row.reference_id}</div>
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Provider</div>
                                <div className="text-gray-700">{row.provider}</div>
                              </div>
                              {row.payment_method && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Method</div>
                                  <div className="text-gray-700">{row.payment_method}</div>
                                </div>
                              )}
                              {row.customer_phone && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone</div>
                                  <div className="text-gray-700">{row.customer_phone}</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer count */}
          {rows && rows.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400 flex justify-between items-center">
              <span>Showing {rows.length} transaction{rows.length !== 1 ? "s" : ""}</span>
              <span className="text-gray-300">Click any row to see full details</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
