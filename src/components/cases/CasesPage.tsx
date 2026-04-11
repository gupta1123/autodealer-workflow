"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import {
  Loader2,
  Search,
  FolderOpen,
  Folder,
  AlertTriangle,
  Database,
  LayoutGrid,
  List,
  Upload,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { CaseConfirmDialog } from "@/components/cases/CaseConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCasesByScope,
  recycleCase,
  type SavedCaseRecord,
} from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";
type ViewMode = "grid" | "table";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRiskColor(score: number) {
  if (score >= 70) return "text-red-600 bg-red-50 border-red-200";
  if (score >= 40) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-emerald-600 bg-emerald-50 border-emerald-200";
}

export function CasesPage() {
  const [cases, setCases] = useState<SavedCaseRecord[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [pendingCase, setPendingCase] = useState<SavedCaseRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    fetchCasesByScope("active", 100)
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

  const totalDocs = useMemo(() => cases.reduce((acc, curr) => acc + curr.documentCount, 0), [cases]);

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

  async function handleConfirmDelete() {
    if (!pendingCase) return;

    try {
      setIsDeleting(true);
      setError(null);
      await recycleCase(pendingCase.id);
      setCases((current) => current.filter((item) => item.id !== pendingCase.id));
      setPendingCase(null);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to move case to the recycle bin."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700 ease-out text-slate-800">

        {/* MAIN CONTAINER matching the image's white box UI */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">

          {/* =========================================
              HEADER SECTION (Matches Image)
              ========================================= */}
          <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">

            {/* Title Area */}
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-indigo-50 border border-indigo-100/50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                <FolderOpen className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Case Directory</h1>
                <p className="text-sm font-semibold text-slate-400 mt-0.5">Root</p>
              </div>
            </div>

            {/* Action Cluster */}
            <div className="flex items-center gap-3 w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0">
              {/* View Toggles */}
              <div className="hidden md:flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-slate-50 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === "grid"
                      ? "bg-white shadow-sm border border-slate-200 text-slate-800"
                      : "text-slate-400 hover:text-slate-800"
                  }`}
                  aria-label="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === "table"
                      ? "bg-white shadow-sm border border-slate-200 text-slate-800"
                      : "text-slate-400 hover:text-slate-800"
                  }`}
                  aria-label="Table view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Status Summary */}
              <div className="hidden md:flex items-center text-xs font-semibold text-slate-500 px-4 border-x border-slate-200 shrink-0">
                {cases.length} folders • {totalDocs} documents
              </div>

              <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20 shrink-0 transition-transform hover:scale-[1.02]">
                <Link href="/workspace">
                  <Upload className="w-4 h-4 mr-2" /> Upload
                </Link>
              </Button>
            </div>
          </div>

          {/* =========================================
              FILTER / SEARCH BAR (Matches Image)
              ========================================= */}
          <div className="p-6 md:px-8 md:py-6">
            <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex-1 flex items-center px-5 py-3 bg-white">
                <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full outline-none text-sm font-medium text-slate-900 placeholder:text-slate-400 bg-transparent"
                />
              </div>
            </div>

            <div className="mt-6 text-sm font-semibold text-slate-500">
              Documents <span className="text-slate-400 ml-1">({filteredCases.length} in current view)</span>
            </div>
          </div>

          {/* =========================================
              TABLE AREA
              ========================================= */}
          <div className="w-full overflow-x-auto pb-4">

            {status === "loading" && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-500" />
                <p className="text-sm font-semibold">Loading directory...</p>
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
              <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 border border-slate-100 shadow-sm">
                  <Database className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Directory is empty</h3>
                <p className="mt-2 text-sm font-medium text-slate-500 max-w-sm">
                  No cases have been processed yet. Upload your first packet to see it here.
                </p>
                <Button asChild className="mt-6 rounded-lg font-bold bg-indigo-600 hover:bg-indigo-700">
                  <Link href="/workspace">Start Upload</Link>
                </Button>
              </div>
            )}

            {status === "ready" && filteredCases.length > 0 && (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-2 md:px-8 xl:grid-cols-3">
                  {filteredCases.map((item) => (
                    <div
                      key={item.id}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                            <Folder className="h-5 w-5 fill-indigo-100" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/cases/${item.id}`}
                              className="block truncate text-base font-bold text-slate-900 transition-colors hover:text-indigo-600"
                            >
                              {item.displayName}
                            </Link>
                            <div className="mt-1 text-xs font-medium text-slate-500">
                              {item.buyerName || "No buyer name"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-slate-400 transition-colors hover:text-rose-600"
                          aria-label="Delete"
                          onClick={() => setPendingCase(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Case File
                        </span>
                        <span
                          className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getRiskColor(item.riskScore)}`}
                        >
                          Risk: {item.riskScore}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Documents
                          </div>
                          <div className="mt-1 text-lg font-bold text-slate-900">
                            {item.documentCount}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Created
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {formatDateTime(item.createdAt)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-500">
                          {item.mismatchCount} mismatches
                        </div>
                        <Link
                          href={`/cases/${item.id}`}
                          className="text-sm font-bold text-indigo-600 transition-colors hover:text-indigo-700"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="border-b border-slate-100 hover:bg-transparent">
                      <TableHead className="h-12 font-bold text-slate-400 text-xs uppercase tracking-wider">Name</TableHead>
                      <TableHead className="h-12 font-bold text-slate-400 text-xs uppercase tracking-wider">Type</TableHead>
                      <TableHead className="h-12 font-bold text-slate-400 text-xs uppercase tracking-wider">Category</TableHead>
                      <TableHead className="h-12 font-bold text-slate-400 text-xs uppercase tracking-wider">Risk</TableHead>
                      <TableHead className="h-12 font-bold text-slate-400 text-xs uppercase tracking-wider">Date</TableHead>
                      <TableHead className="h-12 font-bold text-slate-400 text-xs uppercase tracking-wider text-right pr-6 md:pr-8">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCases.map((item) => (
                      <TableRow
                        key={item.id}
                        className="group cursor-pointer border-slate-100/60 transition-colors hover:bg-slate-50/80 h-16"
                      >
                        <TableCell className="py-3 pl-6 md:pl-8">
                          <Link href={`/cases/${item.id}`} className="flex items-center gap-3 outline-none">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50/80 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                              <Folder className="w-4 h-4 fill-indigo-100" />
                            </div>
                            <span className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors truncate max-w-[200px] xl:max-w-[300px]">
                              {item.displayName}
                            </span>
                            <span className="hidden sm:inline-flex items-center justify-center text-[10px] font-bold bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full shadow-sm">
                              {item.documentCount} items
                            </span>
                          </Link>
                        </TableCell>

                        <TableCell className="py-3">
                          <span className="font-bold text-xs text-slate-500 tracking-wide bg-slate-50 border border-slate-100 px-2 py-1 rounded-md uppercase">
                            Case File
                          </span>
                        </TableCell>

                        <TableCell className="py-3">
                          <span className="font-semibold text-slate-600 truncate block max-w-[150px]" title={item.buyerName || "—"}>
                            {item.buyerName || "—"}
                          </span>
                        </TableCell>

                        <TableCell className="py-3">
                          <span className={`font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md border ${getRiskColor(item.riskScore)}`}>
                            Risk: {item.riskScore}
                          </span>
                        </TableCell>

                        <TableCell className="py-3 whitespace-nowrap text-sm font-semibold text-slate-500">
                          {formatDateTime(item.createdAt)}
                        </TableCell>

                        <TableCell className="pr-6 md:pr-8 py-3 text-right">
                          <div className="flex items-center justify-end gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/cases/${item.id}`} className="text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                              Open
                            </Link>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-rose-600 transition-colors"
                              aria-label="Delete"
                              onClick={() => setPendingCase(item)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </div>
        </div>

        <CaseConfirmDialog
          open={Boolean(pendingCase)}
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setPendingCase(null);
            }
          }}
          title="Move case to recycle bin?"
          description={
            pendingCase
              ? `"${pendingCase.displayName}" will be removed from the active cases list and moved to the recycle bin.`
              : ""
          }
          confirmLabel="Move to recycle bin"
          loading={isDeleting}
          onConfirm={handleConfirmDelete}
        />

      </div>
    </AppShell>
  );
}
