"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Database,
  Activity,
  TrendingUp,
  FolderOpen,
  Users
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRecentCases, type SavedCaseRecord } from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function MetricValueSkeleton() {
  return <Skeleton className="h-8 w-16 rounded-lg bg-slate-200/70" />;
}

function RecentCasesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col justify-between rounded-[24px] border border-[#f1f5f9] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
        >
          <div className="mb-8 flex items-start gap-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-2xl bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5 bg-slate-100" />
              <Skeleton className="h-3 w-3/5 bg-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <Skeleton className="h-3 w-20 bg-slate-200/70" />
              <Skeleton className="mt-3 h-7 w-10 bg-slate-200/70" />
            </div>
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <Skeleton className="h-3 w-16 bg-slate-200/70" />
              <Skeleton className="mt-3 h-7 w-10 bg-slate-200/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardHome() {
  const [cases, setCases] = useState<SavedCaseRecord[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchRecentCases(12)
      .then((payload) => {
        if (!active) return;
        setCases(payload.cases);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard cases.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const totalCases = cases.length;
    const totalDocuments = cases.reduce((sum, item) => sum + item.documentCount, 0);
    const totalMismatches = cases.reduce((sum, item) => sum + item.mismatchCount, 0);
    const averageRisk = Math.round(average(cases.map((item) => item.riskScore)));

    return {
      totalCases,
      totalDocuments,
      totalMismatches,
      averageRisk,
      recentList: cases.slice(0, 6),
    };
  }, [cases]);

  return (
    <AppShell>
      <div className="w-full animate-in fade-in slide-in-from-bottom-4 px-4 py-6 text-[#0f172a] duration-700 ease-out sm:px-8 sm:py-8">

        {/* HEADER SECTION */}
        <header className="mb-10 flex flex-col items-start gap-4">
          <div>
            <div className="text-sm font-medium text-[#64748b] tracking-wide mb-1">Good Afternoon,</div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0f172a]">
              Admin
            </h1>
          </div>
        </header>

        {status === "error" && (
          <div className="mb-6 rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* OVERVIEW SECTION */}
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b]">
              OVERVIEW
            </h2>
            <div className="text-[11px] font-medium text-[#94a3b8]">
              Excludes drafts and recycle bin items
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">

            {/* Card 1: Active Documents (Beige) */}
            <div className="group relative flex h-[160px] flex-col justify-between overflow-hidden rounded-[24px] bg-[#fdfaf6] p-6 transition-transform hover:-translate-y-1">
              <FileText className="absolute -bottom-6 -right-6 h-32 w-32 -rotate-12 text-[#b45309] opacity-[0.03] transition-transform group-hover:scale-110" />
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-[#e2e8f0]">
                <FileText className="h-5 w-5 text-[#94a3b8]" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">
                  ACTIVE DOCUMENTS
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  {status === "loading" ? (
                    <MetricValueSkeleton />
                  ) : (
                    <span className="text-3xl font-extrabold text-[#0f172a] leading-none">
                      {metrics.totalDocuments}
                    </span>
                  )}
                  <ArrowUpRight className="h-4 w-4 text-[#10b981]" />
                </div>
              </div>
            </div>

            {/* Card 2: Total Cases (Rose) */}
            <div className="group relative flex h-[160px] flex-col justify-between overflow-hidden rounded-[24px] bg-[#fdf6f5] p-6 transition-transform hover:-translate-y-1">
              <Database className="absolute -bottom-6 -right-6 h-32 w-32 -rotate-12 text-[#9f1239] opacity-[0.03] transition-transform group-hover:scale-110" />
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-[#e2e8f0]">
                <Database className="h-5 w-5 text-[#94a3b8]" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">
                  TOTAL CASES
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  {status === "loading" ? (
                    <MetricValueSkeleton />
                  ) : (
                    <span className="text-3xl font-extrabold text-[#0f172a] leading-none">
                      {metrics.totalCases}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Mismatches (Lavender) */}
            <div className="group relative flex h-[160px] flex-col justify-between overflow-hidden rounded-[24px] bg-[#f4f5f9] p-6 transition-transform hover:-translate-y-1">
              <Activity className="absolute -bottom-6 -right-6 h-32 w-32 -rotate-12 text-[#4338ca] opacity-[0.03] transition-transform group-hover:scale-110" />
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-[#e2e8f0]">
                <Activity className="h-5 w-5 text-[#94a3b8]" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">
                  MISMATCHES
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  {status === "loading" ? (
                    <MetricValueSkeleton />
                  ) : (
                    <span className="text-3xl font-extrabold text-[#0f172a] leading-none">
                      {metrics.totalMismatches}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 4: Average Risk (Mint) */}
            <div className="group relative flex h-[160px] flex-col justify-between overflow-hidden rounded-[24px] bg-[#f1fae5] p-6 transition-transform hover:-translate-y-1">
              <TrendingUp className="absolute -bottom-6 -right-6 h-32 w-32 -rotate-12 text-[#065f46] opacity-[0.03] transition-transform group-hover:scale-110" />
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-[#e2e8f0]">
                <TrendingUp className="h-5 w-5 text-[#94a3b8]" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">
                  AVERAGE RISK
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  {status === "loading" ? (
                    <MetricValueSkeleton />
                  ) : (
                    <span className="text-3xl font-extrabold text-[#0f172a] leading-none">
                      {metrics.averageRisk}
                    </span>
                  )}
                  <ArrowUpRight className="h-4 w-4 text-[#10b981]" />
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* RECENT CASES SECTION */}
        <section>
          <div className="mb-4 flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b]">
              RECENT CASES
            </h2>
            <div className="rounded-full bg-[#f1f5f9] px-3 py-1 text-[11px] font-bold text-[#64748b]">
              {status === "ready" ? `${metrics.recentList.length} UNITS` : <Skeleton className="h-3 w-12 bg-slate-200/70" />}
            </div>
          </div>

          {status === "loading" ? (
            <RecentCasesSkeleton />
          ) : status === "ready" && metrics.recentList.length === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#e2e8f0] bg-white">
              <FolderOpen className="mb-3 h-8 w-8 text-[#cbd5e1]" />
              <p className="text-sm font-medium text-[#64748b]">No cases processed yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {metrics.recentList.map((item) => (
                <Link
                  href={`/cases/${item.id}`}
                  key={item.id}
                  className="flex flex-col justify-between rounded-[24px] border border-[#f1f5f9] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all hover:border-[#e2e8f0] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                >
                  {/* Top Area: Icon & Name */}
                  <div className="mb-8 flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f8fafc] text-[#94a3b8]">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-bold text-[#0f172a] leading-tight">
                        {item.displayName}
                      </h3>
                      <p className="truncate text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider mt-1">
                        {item.category} • {item.receiverName || "Receiver pending"}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Area: Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Documents Stat */}
                    <div className="rounded-2xl bg-[#f8fafc] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
                        DOCUMENTS
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-2xl font-bold text-[#0f172a]">
                          {item.documentCount}
                        </span>
                      </div>
                    </div>

                    {/* Risk Score Stat */}
                    <div className="rounded-2xl bg-[#f8fafc] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
                        RISK SCORE
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className={`text-2xl font-bold ${item.riskScore >= 40 ? 'text-[#e11d48]' : 'text-[#0f172a]'}`}>
                          {item.riskScore}
                        </span>
                        {item.riskScore > 0 ? (
                          <ArrowUpRight className="h-4 w-4 text-[#e2e8f0]" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-[#e2e8f0]" />
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppShell>
  );
}
