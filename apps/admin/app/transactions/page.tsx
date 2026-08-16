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

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
  ADJUSTMENT: "bg-violet-50 text-violet-700",
  SUBSCRIPTION: "bg-violet-50 text-violet-700",
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
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (pageToLoad = pagination.page, limitToLoad = pagination.limit) => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("limit", String(limitToLoad));
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (daysFilter) params.set("days", daysFilter);
      if (search) params.set("q", search);

      const qs = params.toString();
      const res = await adminApiFetch(`/v1/admin/transactions?${qs}`);
      setLoading(false);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setRows(data.data ?? []);
      if (data.pagination) {
        setPagination(data.pagination);
      }
    },
    [router, statusFilter, typeFilter, daysFilter, search, pagination.page, pagination.limit]
  );

  // Initial and debounced filter reload (resets to page 1)
  useEffect(() => {
    const timer = setTimeout(() => {
      load(1, pagination.limit);
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter, typeFilter, daysFilter]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === pagination.page) return;
    load(newPage, pagination.limit);
  };

  const handleLimitChange = (newLimit: number) => {
    load(1, newLimit);
  };

  const startEntry = pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endEntry = Math.min(pagination.page * pagination.limit, pagination.total);

  const totalPageRevenue = rows
    ? rows.filter((r) => r.status === "SUCCESS" && r.type === "PAYMENT").reduce((s, r) => s + r.amount, 0)
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Transaction History</h1>
            <p className="mt-1 text-sm text-gray-500">All payment transactions with customer, app &amp; subscription details</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pagination.limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm outline-none focus:border-gray-900"
            >
              <option value={10}>10 per page</option>
              <option value={15}>15 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <button
              onClick={() => load(pagination.page, pagination.limit)}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Stats summary cards */}
        {rows && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Transactions", value: pagination.total, accent: false },
              {
                label: "Current Page Items",
                value: rows.length,
                accent: false,
              },
              {
                label: "Pending on Page",
                value: rows.filter((r) => r.status === "PENDING").length,
                accent: rows.filter((r) => r.status === "PENDING").length > 0,
              },
              {
                label: "Page Revenue (SUCCESS)",
                value: formatAmount(totalPageRevenue, "INR"),
                accent: false,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl border p-5 shadow-sm transition-all ${stat.accent ? "border-amber-200 bg-amber-50/60" : "border-gray-100 bg-white"}`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{stat.label}</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</div>
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
            className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none focus:border-gray-900"
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REVERSED">Reversed</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none focus:border-gray-900"
          >
            <option value="">All Types</option>
            <option value="PAYMENT">Payment</option>
            <option value="REFUND">Refund</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </select>

          <div className="flex rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
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

        {/* Table container */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {rows === null || loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading transactions...</div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 border border-gray-100 text-gray-400">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">No transactions found</h3>
              <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                No payment transactions match the selected filters or date range.
              </p>
            </div>
          ) : (
            <>
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
                      <tbody key={row.id} className="contents">
                        <tr
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
                          <tr className="bg-indigo-50/30">
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
                      </tbody>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer bar */}
              <div className="flex flex-wrap items-center justify-between border-t border-gray-100 px-5 py-3.5 text-xs text-gray-500">
                <div>
                  Showing <span className="font-medium text-gray-800">{startEntry}</span> to{" "}
                  <span className="font-medium text-gray-800">{endEntry}</span> of{" "}
                  <span className="font-medium text-gray-800">{pagination.total}</span> transactions
                  {pagination.totalPages > 1 && (
                    <span className="ml-2 text-gray-400">
                      (Page {pagination.page} of {pagination.totalPages})
                    </span>
                  )}
                </div>

                {/* Page buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>

                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((p) => Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages)
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && p - prev > 1;
                      return (
                        <span key={p} className="flex items-center">
                          {showEllipsis && <span className="px-1 text-gray-400">...</span>}
                          <button
                            onClick={() => handlePageChange(p)}
                            className={`min-w-[28px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                              p === pagination.page
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {p}
                          </button>
                        </span>
                      );
                    })}

                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
