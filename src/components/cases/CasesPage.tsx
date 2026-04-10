"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import {
  Loader2,
  Search,
  ArrowRight,
  FolderOpen,
  AlertTriangle,
  Database,
  FileText
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchRecentCases, type SavedCaseRecord } from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRiskBadgeStyle(score: number) {
  if (score >= 70) return "bg-red-50 text-red-700 border-red-200 shadow-sm";
  if (score >= 40) return "bg-amber-50 text-amber-700 border-amber-200 shadow-sm";
  return "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm";
}

export function CasesPage() {
  const [cases, setCases] = useState<SavedCaseRecord[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;

    // Fetching up to 100 cases for the directory
    fetchRecentCases(100)
      .then((payload) => {
        if (!active) return;
        setCases(payload.cases);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load cases.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  // Client-side filtering logic
  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return cases;
    const query = searchQuery.toLowerCase();

    return cases.filter((c) =>
      c.displayName.toLowerCase().includes(query) ||
      (c.buyerName && c.buyerName.toLowerCase().includes(query)) ||
      (c.poNumber && c.poNumber.toLowerCase().includes(query)) ||
      c.slug.toLowerCase().includes(query)
    );
  }, [cases, searchQuery]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] w-full px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700 ease-out text-slate-800">

        {/* =========================================
            HEADER SECTION
            ========================================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600 mb-3">
              <FolderOpen className="w-4 h-4" /> Case Directory
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              All processed packet cases
            </h1>
            <p className="mt-3 text-sm font-medium text-slate-500 leading-relaxed">
              Review every saved case created by the current signed-in user. Inspect risk profiles,
              document extractions, and reconciliation mismatches at a glance.
            </p>
          </div>

          <Button asChild className="shrink-0 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-6 font-bold shadow-lg transition-transform hover:-translate-y-0.5">
            <Link href="/workspace">
              <FileText className="mr-2 w-4 h-4" />
              New Packet Review
            </Link>
          </Button>
        </div>

        {/* =========================================
            DATA GRID CONTAINER
            ========================================= */}
        <div className="bg-white border border-slate-200/80 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">

          {/* Toolbar */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search cases, buyers, or PO numbers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
              />
            </div>

            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {status === "ready" ? `${filteredCases.length} Results` : "Loading..."}
            </div>
          </div>

          {/* Table Area */}
          <div className="w-full overflow-x-auto">

            {status === "loading" && (
              <div className="flex flex-col items-center justify-center py-24 text-slate-500">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-500" />
                <p className="text-sm font-semibold">Loading your case directory...</p>
              </div>
            )}

            {status === "error" && (
              <div className="m-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 flex items-start shadow-sm">
                <AlertTriangle className="mr-3 h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-base mb-1">Failed to load cases</div>
                  <div>{error}</div>
                </div>
              </div>
            )}

            {status === "ready" && cases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center px-4">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 border border-slate-100 shadow-sm">
                  <Database className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No cases found</h3>
                <p className="mt-2 text-sm font-medium text-slate-500 max-w-sm">
                  You haven&apos;t saved any packet reviews yet. Start a new review in the workspace to see it listed here.
                </p>
                <Button asChild variant="outline" className="mt-6 rounded-full font-bold">
                  <Link href="/workspace">Go to Workspace</Link>
                </Button>
              </div>
            )}

            {status === "ready" && cases.length > 0 && filteredCases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                <Search className="h-10 w-10 text-slate-200 mb-4" />
                <h3 className="text-base font-bold text-slate-900">No matches found</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  We couldn&apos;t find any cases matching &quot;{searchQuery}&quot;.
                </p>
                <Button
                  variant="link"
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-indigo-600 font-bold"
                >
                  Clear search
                </Button>
              </div>
            )}

            {status === "ready" && filteredCases.length > 0 && (
              <Table className="w-full text-sm">
                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider pl-6">Case Details</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider">Buyer</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider text-center">Docs</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider text-center">Issues</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider text-center">Risk</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider">Invoice / PO</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider">Processed On</TableHead>
                    <TableHead className="h-12 font-bold text-slate-500 text-xs uppercase tracking-wider text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCases.map((item) => (
                    <TableRow
                      key={item.id}
                      className="group cursor-default border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      {/* Case Details */}
                      <TableCell className="pl-6 py-4">
                        <Link
                          href={`/cases/${item.id}`}
                          className="inline-flex min-w-[200px] flex-col rounded-lg outline-none transition-colors hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                        >
                          <div className="font-bold text-slate-900 transition-colors group-hover:text-indigo-600 hover:text-indigo-600">
                            {item.displayName}
                          </div>
                          <div className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                            {item.slug}
                          </div>
                        </Link>
                      </TableCell>

                      {/* Buyer */}
                      <TableCell className="py-4">
                        <span className="font-semibold text-slate-700">
                          {item.buyerName || "—"}
                        </span>
                      </TableCell>

                      {/* Docs Count */}
                      <TableCell className="py-4 text-center">
                        <span className="font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                          {item.documentCount}
                        </span>
                      </TableCell>

                      {/* Mismatches */}
                      <TableCell className="py-4 text-center">
                        <span className={`font-bold px-2.5 py-1 rounded-md ${item.mismatchCount > 0 ? 'bg-amber-100/50 text-amber-700' : 'text-slate-400'}`}>
                          {item.mismatchCount}
                        </span>
                      </TableCell>

                      {/* Risk Badge */}
                      <TableCell className="py-4 text-center">
                        <Badge variant="outline" className={`rounded-md font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 ${getRiskBadgeStyle(item.riskScore)}`}>
                          {item.riskScore}
                        </Badge>
                      </TableCell>

                      {/* Refs */}
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-slate-700 text-xs truncate max-w-[120px]" title={item.invoiceNumber || "No Invoice"}>
                            {item.invoiceNumber || "—"}
                          </span>
                          <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded w-fit truncate max-w-[120px]" title={item.poNumber || "No PO"}>
                            PO: {item.poNumber || "—"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Date */}
                      <TableCell className="py-4 whitespace-nowrap text-xs font-medium text-slate-500">
                        {formatDateTime(item.createdAt)}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="pr-6 py-4 text-right">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="rounded-full h-9 w-9 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all group-hover:translate-x-1"
                        >
                          <Link href={`/cases/${item.id}`}>
                            <ArrowRight className="h-4 w-4" />
                            <span className="sr-only">View Case</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
