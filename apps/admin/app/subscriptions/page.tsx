"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "../../lib/api";
import AppShell from "../components/AppShell";

interface SubscriptionRow {
  subscription_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: any;

  application_id: string;
  application_name: string;

  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;

  plan_id: string;
  plan_name: string;
  plan_description: string | null;
  plan_amount: number;
  plan_currency: string;
  plan_interval: string;
  plan_interval_count: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface StatsInfo {
  total: number;
  active_count: number;
  mrr_paise: number;
}

interface AppOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
  amount: number;
  interval: string;
  intervalCount: number;
  applicationId: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  TRIALING: "bg-blue-100 text-blue-700",
  PAST_DUE: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-red-100 text-red-700",
};

function formatCurrency(amountPaise: number, currency = "INR") {
  const symbol = currency === "INR" ? "₹" : currency + " ";
  return `${symbol}${(amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SubscriptionsPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null);
  const [stats, setStats] = useState<StatsInfo>({ total: 0, active_count: 0, mrr_paise: 0 });
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [appFilter, setAppFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal states
  const [showSubModal, setShowSubModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [apps, setApps] = useState<AppOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  // New Subscription Form
  const [newSubAppId, setNewSubAppId] = useState("");
  const [newSubPlanId, setNewSubPlanId] = useState("");
  const [newSubCustomerName, setNewSubCustomerName] = useState("");
  const [newSubCustomerEmail, setNewSubCustomerEmail] = useState("");
  const [newSubCustomerPhone, setNewSubCustomerPhone] = useState("");
  const [newSubStatus, setNewSubStatus] = useState<"ACTIVE" | "TRIALING">("ACTIVE");
  const [modalSubLoading, setModalSubLoading] = useState(false);

  // New Plan Form
  const [newPlanAppId, setNewPlanAppId] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDescription, setNewPlanDescription] = useState("");
  const [newPlanAmountRupees, setNewPlanAmountRupees] = useState("");
  const [newPlanInterval, setNewPlanInterval] = useState<"MONTH" | "YEAR" | "WEEK" | "DAY">("MONTH");
  const [newPlanIntervalCount, setNewPlanIntervalCount] = useState(1);
  const [modalPlanLoading, setModalPlanLoading] = useState(false);

  // Load subscriptions
  const load = useCallback(
    async (pageToLoad = pagination.page, limitToLoad = pagination.limit) => {
      setLoading(true);
      setActionError(null);
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("limit", String(limitToLoad));
      if (statusFilter) params.set("status", statusFilter);
      if (appFilter) params.set("application_id", appFilter);
      if (search) params.set("q", search);

      const res = await adminApiFetch(`/v1/admin/subscriptions?${params.toString()}`);
      setLoading(false);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setSubs(data.data || []);
      if (data.pagination) setPagination(data.pagination);
      if (data.stats) setStats(data.stats);
    },
    [router, statusFilter, appFilter, search, pagination.page, pagination.limit]
  );

  // Initial & search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      load(1, pagination.limit);
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter, appFilter]);

  // Load apps & plans for modal dropdowns
  const loadMetadata = async () => {
    try {
      const [appsRes, plansRes] = await Promise.all([
        adminApiFetch("/v1/admin/applications"),
        adminApiFetch("/v1/admin/plans"),
      ]);
      if (appsRes.ok) {
        const appsData = await appsRes.json();
        setApps(appsData.data || []);
        if (appsData.data?.[0]) {
          setNewSubAppId((prev) => prev || appsData.data[0].id);
          setNewPlanAppId((prev) => prev || appsData.data[0].id);
        }
      }
      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData.data || []);
        if (plansData.data?.[0]) {
          setNewSubPlanId((prev) => prev || plansData.data[0].id);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  // Action handlers
  const handleActivate = async (id: string) => {
    if (!confirm(`Activate subscription ${id}? This sets its status to ACTIVE and extends its billing cycle.`)) return;
    setActionBusyId(id);
    setActionError(null);
    try {
      const res = await adminApiFetch(`/v1/admin/subscriptions/${id}/activate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setActionError(err?.error?.message || "Failed to activate subscription");
        return;
      }
      await load();
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm(`Cancel subscription ${id}? The customer will no longer be marked active.`)) return;
    setActionBusyId(id);
    setActionError(null);
    try {
      const res = await adminApiFetch(`/v1/admin/subscriptions/${id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setActionError(err?.error?.message || "Failed to cancel subscription");
        return;
      }
      await load();
    } finally {
      setActionBusyId(null);
    }
  };

  // Create Subscription Submit
  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubAppId || !newSubPlanId) {
      alert("Please select an application and plan");
      return;
    }
    setModalSubLoading(true);
    try {
      const res = await adminApiFetch("/v1/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          application_id: newSubAppId,
          plan_id: newSubPlanId,
          customer_name: newSubCustomerName || undefined,
          customer_email: newSubCustomerEmail || undefined,
          customer_phone: newSubCustomerPhone || undefined,
          status: newSubStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error?.message || "Failed to create subscription");
        return;
      }
      setShowSubModal(false);
      setNewSubCustomerName("");
      setNewSubCustomerEmail("");
      setNewSubCustomerPhone("");
      await load(1, pagination.limit);
    } finally {
      setModalSubLoading(false);
    }
  };

  // Create Plan Submit
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountPaise = Math.round(parseFloat(newPlanAmountRupees) * 100);
    if (!newPlanAppId || !newPlanName || isNaN(amountPaise) || amountPaise <= 0) {
      alert("Please fill in valid plan details and amount in ₹");
      return;
    }
    setModalPlanLoading(true);
    try {
      const res = await adminApiFetch("/v1/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          application_id: newPlanAppId,
          name: newPlanName,
          description: newPlanDescription || undefined,
          amount: amountPaise,
          currency: "INR",
          interval: newPlanInterval,
          interval_count: newPlanIntervalCount,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error?.message || "Failed to create plan");
        return;
      }
      setShowPlanModal(false);
      setNewPlanName("");
      setNewPlanDescription("");
      setNewPlanAmountRupees("");
      await loadMetadata();
      await load(1, pagination.limit);
    } finally {
      setModalPlanLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === pagination.page) return;
    load(newPage, pagination.limit);
  };

  const startEntry = pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endEntry = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Devify Pay Admin</div>
            <h1 className="text-2xl font-semibold text-gray-900">Subscriptions</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowPlanModal(true)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
            >
              + New Plan
            </button>
            <button
              onClick={() => setShowSubModal(true)}
              className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 shadow-sm transition-colors"
            >
              + New Subscription
            </button>
            <button
              onClick={() => load(pagination.page, pagination.limit)}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {actionError && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Stats Row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Subscribers</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Active Subscriptions</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{stats.active_count}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Est. MRR (Monthly)</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(stats.mrr_paise)}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Available Plans</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{plans.length}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by customer, plan, app..."
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
            <option value="ACTIVE">Active</option>
            <option value="TRIALING">Trialing</option>
            <option value="PAST_DUE">Past Due</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>

          {apps.length > 0 && (
            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none focus:border-gray-900"
            >
              <option value="">All Applications</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={pagination.limit}
            onChange={(e) => load(1, Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none focus:border-gray-900"
          >
            <option value={10}>10 per page</option>
            <option value={15}>15 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
          </select>
        </div>

        {/* Subscriptions Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {subs === null || loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading subscriptions...</div>
          ) : subs.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 border border-gray-100 text-gray-400">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">No subscriptions found</h3>
              <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                Subscriptions are created automatically when orders with plan metadata are paid, or you can add one manually.
              </p>
              <button
                onClick={() => setShowSubModal(true)}
                className="mt-4 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors"
              >
                + Create First Subscription
              </button>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Application</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Price / Rate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subs.map((s) => (
                    <tbody key={s.subscription_id} className="contents">
                      <tr
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setExpandedId(expandedId === s.subscription_id ? null : s.subscription_id)}
                      >
                        {/* Customer */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{s.customer_name}</div>
                          {s.customer_email && (
                            <div className="text-xs text-gray-500">{s.customer_email}</div>
                          )}
                          {!s.customer_email && s.customer_phone && (
                            <div className="text-xs text-gray-500">{s.customer_phone}</div>
                          )}
                        </td>

                        {/* App */}
                        <td className="px-4 py-3 text-gray-900 font-medium">{s.application_name}</td>

                        {/* Plan */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{s.plan_name}</div>
                          {s.plan_description && (
                            <div className="text-xs text-gray-400 truncate max-w-[180px]">{s.plan_description}</div>
                          )}
                        </td>

                        {/* Price / Interval */}
                        <td className="px-4 py-3 font-medium text-gray-900 tabular-nums">
                          <div>{formatCurrency(s.plan_amount, s.plan_currency)}</div>
                          <div className="text-xs text-gray-400 lowercase">
                            per {s.plan_interval_count > 1 ? `${s.plan_interval_count} ` : ""}{s.plan_interval}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>

                        {/* Period */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {s.start_date ? (
                            <div>
                              <span>{new Date(s.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                              <span className="text-gray-400 mx-1">→</span>
                              <span className="font-medium text-gray-700">
                                {s.end_date ? new Date(s.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Ongoing"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Pending First Payment</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {s.status !== "ACTIVE" && (
                            <button
                              disabled={actionBusyId === s.subscription_id}
                              onClick={() => handleActivate(s.subscription_id)}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors"
                            >
                              Activate
                            </button>
                          )}
                          {s.status !== "CANCELLED" && (
                            <button
                              disabled={actionBusyId === s.subscription_id}
                              onClick={() => handleCancel(s.subscription_id)}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => setExpandedId(expandedId === s.subscription_id ? null : s.subscription_id)}
                            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            {expandedId === s.subscription_id ? "▲" : "▼"}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Drawer Details */}
                      {expandedId === s.subscription_id && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                              <div>
                                <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Subscription ID</div>
                                <div className="font-mono text-gray-700 break-all">{s.subscription_id}</div>
                              </div>
                              <div>
                                <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer ID</div>
                                <div className="font-mono text-gray-700 break-all">{s.customer_id}</div>
                              </div>
                              <div>
                                <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Plan ID</div>
                                <div className="font-mono text-gray-700 break-all">{s.plan_id}</div>
                              </div>
                              <div>
                                <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Created At</div>
                                <div className="text-gray-700">{new Date(s.created_at).toLocaleString()}</div>
                              </div>
                              {s.start_date && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</div>
                                  <div className="text-gray-700">{new Date(s.start_date).toLocaleString()}</div>
                                </div>
                              )}
                              {s.end_date && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Renewal Date</div>
                                  <div className="text-gray-700">{new Date(s.end_date).toLocaleString()}</div>
                                </div>
                              )}
                              {s.cancelled_at && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Cancelled Date</div>
                                  <div className="text-red-600">{new Date(s.cancelled_at).toLocaleString()}</div>
                                </div>
                              )}
                              {s.customer_phone && (
                                <div>
                                  <div className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone</div>
                                  <div className="text-gray-700">{s.customer_phone}</div>
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

              {/* Pagination bar */}
              <div className="flex flex-wrap items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
                <div>
                  Showing <span className="font-medium text-gray-700">{startEntry}</span> to{" "}
                  <span className="font-medium text-gray-700">{endEntry}</span> of{" "}
                  <span className="font-medium text-gray-700">{pagination.total}</span> entries
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
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
                                ? "bg-gray-900 text-white"
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
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal: New Subscription */}
        {showSubModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Create New Subscription</h3>
                <button onClick={() => setShowSubModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubscription} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Application</label>
                  <select
                    value={newSubAppId}
                    onChange={(e) => setNewSubAppId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                    required
                  >
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Subscription Plan</label>
                  <select
                    value={newSubPlanId}
                    onChange={(e) => setNewSubPlanId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                    required
                  >
                    {plans
                      .filter((p) => !newSubAppId || p.applicationId === newSubAppId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatCurrency(p.amount)} / {p.interval.toLowerCase()}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Sameer Kashyap"
                    value={newSubCustomerName}
                    onChange={(e) => setNewSubCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Email</label>
                  <input
                    type="email"
                    placeholder="e.g. user@example.com"
                    value={newSubCustomerEmail}
                    onChange={(e) => setNewSubCustomerEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={newSubCustomerPhone}
                    onChange={(e) => setNewSubCustomerPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Initial Status</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-700">
                      <input
                        type="radio"
                        name="status"
                        checked={newSubStatus === "ACTIVE"}
                        onChange={() => setNewSubStatus("ACTIVE")}
                      />
                      Active (immediate access)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700">
                      <input
                        type="radio"
                        name="status"
                        checked={newSubStatus === "TRIALING"}
                        onChange={() => setNewSubStatus("TRIALING")}
                      />
                      Trialing (pending payment)
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowSubModal(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSubLoading}
                    className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {modalSubLoading ? "Creating..." : "Create Subscription"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Plan */}
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Create Subscription Plan</h3>
                <button onClick={() => setShowPlanModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreatePlan} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Application</label>
                  <select
                    value={newPlanAppId}
                    onChange={(e) => setNewPlanAppId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                    required
                  >
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Plan Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Pro Monthly, Premium Annual"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Unlimited check-ins and priority support"
                    value={newPlanDescription}
                    onChange={(e) => setNewPlanDescription(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount in ₹</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 199.00"
                      value={newPlanAmountRupees}
                      onChange={(e) => setNewPlanAmountRupees(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Billing Interval</label>
                    <select
                      value={newPlanInterval}
                      onChange={(e) => setNewPlanInterval(e.target.value as any)}
                      className="w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-gray-900"
                    >
                      <option value="MONTH">Monthly</option>
                      <option value="YEAR">Yearly</option>
                      <option value="WEEK">Weekly</option>
                      <option value="DAY">Daily</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowPlanModal(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalPlanLoading}
                    className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {modalPlanLoading ? "Creating..." : "Save Plan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
