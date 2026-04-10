"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  CloudUpload,
  FileText,
  Loader2,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { fetchRecentCases, type SavedCaseRecord } from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";

function formatDateTimeShort(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function generateSparklinePath(data: number[], width: number, height: number) {
  if (!data || data.length === 0) return `M 0 ${height / 2} L ${width} ${height / 2}`;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;
  const stepX = width / (data.length - 1 || 1);

  return data
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentage(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
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
    const issueFreeRate = percentage(
      cases.filter((item) => item.mismatchCount === 0).length,
      totalCases
    );
    const lowRiskRate = percentage(
      cases.filter((item) => item.riskScore < 40).length,
      totalCases
    );
    const reviewCoverage = percentage(
      cases.filter((item) => item.documentCount >= 5).length,
      totalCases
    );

    const chartSource = cases.slice(0, 8).reverse();
    const maxDocumentCount = Math.max(1, ...chartSource.map((item) => item.documentCount));
    const chartData = chartSource.map((item, index) => ({
      id: item.id,
      height: Math.max(10, Math.round((item.documentCount / maxDocumentCount) * 100)),
      highlighted: index % 3 === 0,
      label: formatDateTimeShort(item.createdAt),
    }));

    const riskSeries = cases.slice(0, 8).reverse().map((item) => item.riskScore);
    const mismatchSeries = cases.slice(0, 6).reverse().map((item) => item.mismatchCount);
    const cumulativeSeries = cases
      .slice(0, 6)
      .reverse()
      .map((_, index) => index + 1);

    const recentWindow = cases.slice(0, 3);
    const previousWindow = cases.slice(3, 6);
    const recentIssueFreeRate = percentage(
      recentWindow.filter((item) => item.mismatchCount === 0).length,
      recentWindow.length
    );
    const previousIssueFreeRate = percentage(
      previousWindow.filter((item) => item.mismatchCount === 0).length,
      previousWindow.length
    );
    const issueFreeTrend = recentIssueFreeRate - previousIssueFreeRate;

    const recentRisk = average(recentWindow.map((item) => item.riskScore));
    const previousRisk = average(previousWindow.map((item) => item.riskScore));
    const riskTrend = recentRisk - previousRisk;

    const axisLabels =
      chartData.length >= 3
        ? [
            chartData[0].label,
            chartData[Math.floor((chartData.length - 1) / 2)].label,
            chartData[chartData.length - 1].label,
          ]
        : chartData.map((item) => item.label);

    return {
      totalCases,
      totalDocuments,
      totalMismatches,
      averageRisk,
      issueFreeRate,
      lowRiskRate,
      reviewCoverage,
      chartData,
      riskSeries,
      mismatchSeries,
      cumulativeSeries,
      recentList: cases.slice(0, 3),
      issueFreeTrend,
      riskTrend,
      axisLabels,
    };
  }, [cases]);

  const hasDashboardData = metrics.chartData.length > 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] animate-in fade-in px-4 py-8 text-slate-800 duration-700 ease-out sm:px-6 lg:px-8">
        <header className="mb-8 flex justify-end">
          <div className="flex w-full items-center justify-end gap-4 md:w-auto">
            <Link
              href="/workspace"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-8 py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_4px_14px_rgba(15,23,42,0.28)] transition-transform hover:scale-[1.02] hover:from-slate-800 hover:to-slate-700 md:flex-none"
            >
              <CloudUpload className="h-4 w-4" />
              Upload
            </Link>
          </div>
        </header>

        {status === "error" && (
          <div className="mb-6 rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex flex-col gap-6 xl:col-span-2">
            <div className="rounded-[24px] border border-slate-100/50 bg-white p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Analytics</h2>
                <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-1.5 text-xs font-bold text-white shadow-[0_2px_10px_rgba(15,23,42,0.18)]">
                  Recent Cases <ChevronDown className="h-3 w-3" />
                </div>
              </div>

              {status === "loading" ? (
                <div className="flex h-[200px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : !hasDashboardData ? (
                <div className="flex h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-medium text-slate-400">
                  No saved cases yet.
                </div>
              ) : (
                <>
                  <div className="relative flex h-[200px] w-full items-end justify-between border-b border-dashed border-slate-200 px-2 pb-8 sm:px-8">
                    <div className="absolute left-0 top-[30%] z-0 w-full border-t-[2px] border-dashed border-indigo-100" />

                    {metrics.chartData.map((bar) => (
                      <div
                        key={bar.id}
                        className="group relative z-10 flex h-full w-[10%] items-end gap-1 sm:w-[8%]"
                      >
                        <div
                          className={`w-full rounded-t-md transition-all duration-500 ease-out ${
                            bar.highlighted
                              ? "bg-slate-900"
                              : "bg-slate-100 group-hover:bg-slate-200"
                          }`}
                          style={{ height: `${bar.height}%` }}
                        />
                        <div
                          className={`hidden w-full rounded-t-md transition-all duration-500 ease-out sm:block ${
                            bar.highlighted ? "bg-indigo-200/60" : "bg-slate-50"
                          }`}
                          style={{ height: `${bar.height * 0.6}%` }}
                        />
                      </div>
                    ))}

                    <div className="absolute -bottom-8 left-0 flex w-full justify-between px-4 text-[11px] font-bold text-slate-400 sm:px-12">
                      {metrics.axisLabels.map((label, index) => (
                        <span key={`${label}-${index}`}>{label}</span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-100/50 bg-white p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
              <h2 className="mb-6 text-sm font-bold text-slate-400">Performance Metrics</h2>

              <div className="grid grid-cols-2 gap-x-4 gap-y-8">
                <div className="flex items-center justify-between pr-4 sm:pr-8">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-800">
                      {status === "loading" ? "..." : metrics.totalCases}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-400">Saved Cases</div>
                  </div>
                  <svg
                    width="60"
                    height="24"
                    className="fill-none stroke-indigo-500"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d={generateSparklinePath(metrics.cumulativeSeries, 60, 24)} />
                  </svg>
                </div>

                <div className="flex items-center justify-between border-l border-slate-100 pl-4 sm:pl-8">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-800">
                      {status === "loading" ? "..." : `${metrics.issueFreeRate}%`}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-400">Issue-Free Rate</div>
                  </div>
                  <div
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${
                      metrics.issueFreeTrend >= 0
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {metrics.issueFreeTrend >= 0 ? "UP" : "DOWN"}
                    {metrics.issueFreeTrend >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pr-4 sm:pr-8">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-800">
                      {status === "loading" ? "..." : metrics.totalMismatches}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-400">Mismatches</div>
                  </div>
                  <svg
                    width="60"
                    height="24"
                    className="fill-none stroke-indigo-400"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d={generateSparklinePath(metrics.mismatchSeries, 60, 24)} />
                  </svg>
                </div>

                <div className="flex items-center justify-between border-l border-slate-100 pl-4 sm:pl-8">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-800">
                      {status === "loading" ? "..." : metrics.averageRisk}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-400">Average Risk</div>
                  </div>
                  <div
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${
                      metrics.riskTrend <= 0
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {metrics.riskTrend <= 0 ? "DOWN" : "UP"}
                    {metrics.riskTrend <= 0 ? (
                      <ArrowDownRight className="h-3 w-3" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-100/50 bg-white p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
              <h2 className="mb-6 text-sm font-bold text-slate-400">System Health</h2>
              <div className="flex items-center justify-around px-4 sm:px-12">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="4"
                        strokeDasharray={`${metrics.issueFreeRate}, 100`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
                      {metrics.issueFreeRate}%
                    </div>
                  </div>
                  <div className="hidden text-[10px] font-bold text-slate-400 sm:block">
                    Issue Free
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="4"
                        strokeDasharray={`${metrics.lowRiskRate}, 100`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
                      {metrics.lowRiskRate}%
                    </div>
                  </div>
                  <div className="hidden text-[10px] font-bold text-slate-400 sm:block">
                    Low Risk
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#334155"
                        strokeWidth="4"
                        strokeDasharray={`${metrics.reviewCoverage}, 100`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
                      {metrics.reviewCoverage}%
                    </div>
                  </div>
                  <div className="hidden text-[10px] font-bold text-slate-400 sm:block">
                    Coverage
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 xl:col-span-1">
            <div className="rounded-[24px] border border-slate-100/50 bg-white p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
              <div className="mb-6 flex items-center gap-2 rounded-full bg-slate-50 p-1">
                <div className="flex-1 rounded-full bg-white py-2 text-center text-xs font-bold text-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                  Overview
                </div>
                <div className="flex-1 py-2 text-center text-xs font-bold text-slate-400">
                  Details
                </div>
              </div>

              <div className="mb-8 grid grid-cols-3 gap-2">
                <div className="border-r border-slate-100 text-center">
                  <div className="text-xl font-extrabold text-slate-800">{metrics.totalDocuments}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase text-slate-400">Docs</div>
                </div>
                <div className="border-r border-slate-100 text-center">
                  <div className="text-xl font-extrabold text-slate-800">{metrics.totalMismatches}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase text-slate-400">Issues</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-extrabold text-slate-800">{metrics.averageRisk}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase text-slate-400">Risk</div>
                </div>
              </div>

              {status === "loading" ? (
                <div className="flex h-[100px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : metrics.riskSeries.length === 0 ? (
                <div className="flex h-[100px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                  No risk trend yet.
                </div>
              ) : (
                <div className="relative h-[100px] w-full">
                  <svg viewBox="0 0 300 100" className="h-full w-full overflow-visible">
                    <path
                      d={generateSparklinePath(metrics.riskSeries, 300, 70)}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute bottom-0 left-0 flex w-full justify-between text-[8px] font-bold text-slate-300">
                    {metrics.axisLabels.slice(0, 3).map((label, index) => (
                      <span key={`${label}-${index}`}>{label}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-center gap-2">
                <div className="rounded-full bg-slate-50 px-4 py-1.5 text-[10px] font-bold text-slate-400">
                  Cases
                </div>
                <div className="rounded-full bg-slate-50 px-4 py-1.5 text-[10px] font-bold text-slate-400">
                  Issues
                </div>
                <div className="rounded-full bg-indigo-50 px-4 py-1.5 text-[10px] font-bold text-indigo-600">
                  Risk
                </div>
              </div>
            </div>

            <div className="flex-1 rounded-[24px] border border-slate-100/50 bg-white p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">Recent Cases</h2>
                <Link
                  href="/cases"
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  View All
                </Link>
              </div>

              {status === "loading" ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                </div>
              ) : status === "ready" && metrics.recentList.length === 0 ? (
                <div className="py-8 text-center text-sm font-medium text-slate-400">
                  No recent activity.
                </div>
              ) : (
                <div className="space-y-5">
                  {metrics.recentList.map((item, index) => (
                    <Link
                      href={`/cases/${item.id}`}
                      key={item.id}
                      className="group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-4 text-center text-xs font-bold text-slate-300">
                          {index + 1}.
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="max-w-[140px] truncate text-sm font-extrabold text-slate-800 transition-colors group-hover:text-indigo-600">
                            {item.displayName}
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                            {formatDateTimeShort(item.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-amber-500">
                          Risk {item.riskScore}
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                          {item.documentCount} docs
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
