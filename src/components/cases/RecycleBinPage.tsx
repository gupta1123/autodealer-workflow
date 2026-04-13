"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Loader2,
  RotateCcw,
  Search,
  Trash,
  Trash2,
} from "lucide-react";

import { CaseConfirmDialog } from "@/components/cases/CaseConfirmDialog";
import { AppShell } from "@/components/dashboard/AppShell";
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
  deleteCaseForever,
  fetchCasesByScope,
  restoreCase,
  type SavedCaseRecord,
} from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";
type PendingAction =
  | { type: "destroy"; item: SavedCaseRecord }
  | { type: "restore"; item: SavedCaseRecord }
  | null;

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(',', ' -').replace(/\s([AP]M)$/, '_$1'); // Rough match for image format
}

function calculateDaysRemaining(deletedAt: string | null) {
  if (!deletedAt) return 30;
  const deletedDate = new Date(deletedAt);
  const expiryDate = new Date(deletedDate.getTime() + (30 * 24 * 60 * 60 * 1000));
  const now = new Date();
  const diffTime = Math.max(0, expiryDate.getTime() - now.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function RecycleBinPage() {
  const [cases, setCases] = useState<SavedCaseRecord[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    let active = true;

    fetchCasesByScope("deleted", 100)
      .then((payload) => {
        if (!active) return;
        setCases(payload.cases);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load recycle bin."
        );
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredCases = useMemo(() => {
    if (!query.trim()) return cases;
    const normalized = query.trim().toLowerCase();

    return cases.filter((item) => {
      return (
      item.displayName.toLowerCase().includes(normalized) ||
      item.slug.toLowerCase().includes(normalized) ||
      (item.receiverName ?? "").toLowerCase().includes(normalized) ||
      item.category.toLowerCase().includes(normalized)
      );
    });
  }, [cases, query]);

  async function handleConfirmAction() {
    if (!pendingAction) return;

    try {
      setIsMutating(true);
      setError(null);

      if (pendingAction.type === "restore") {
        await restoreCase(pendingAction.item.id);
      } else {
        await deleteCaseForever(pendingAction.item.id);
      }

      setCases((current) =>
        current.filter((item) => item.id !== pendingAction.item.id)
      );
      setPendingAction(null);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update recycle bin."
      );
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700 ease-out text-[#0f172a]">

        {/* MAIN CONTAINER matching the image's white box UI */}
        <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">

          {/* =========================================
              HEADER SECTION (Matches Image)
              ========================================= */}
          <div className="p-6 md:p-8 border-b border-[#f1f5f9] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">

            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-[#fef2f2] border border-[#fecaca] text-[#e11d48] rounded-2xl flex items-center justify-center shadow-sm">
                <Trash2 className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-[#0f172a] tracking-tight">Recycle Bin</h1>
                <p className="text-sm font-semibold text-[#94a3b8] mt-0.5">
                  {filteredCases.length} items • Auto-deleted after 30 days
                </p>
              </div>
            </div>
          </div>

          {/* =========================================
              SEARCH BAR (Matches Image)
              ========================================= */}
          <div className="p-6 md:px-8 md:py-6">
            <div className="flex items-center px-4 py-2.5 border border-[#e2e8f0] rounded-xl bg-[#f8fafc] shadow-sm max-w-md">
              <Search className="w-4 h-4 text-[#94a3b8] mr-3 shrink-0" />
              <input
                type="text"
                placeholder="Search deleted items..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full outline-none text-sm font-medium text-[#0f172a] placeholder:text-[#94a3b8] bg-transparent"
              />
            </div>
          </div>

          {/* =========================================
              TABLE AREA
              ========================================= */}
          <div className="w-full overflow-x-auto pb-4">

            {status === "loading" && (
              <div className="flex flex-col items-center justify-center py-20 text-[#64748b]">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#6366f1]" />
                <p className="text-sm font-semibold">Loading recycle bin...</p>
              </div>
            )}

            {status === "error" && (
              <div className="m-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 flex items-start shadow-sm">
                <Trash className="mr-3 h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-base mb-1">Failed to load recycle bin</div>
                  <div>{error}</div>
                </div>
              </div>
            )}

            {status === "ready" && cases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f8fafc] border border-[#e2e8f0] shadow-sm">
                  <Trash2 className="h-8 w-8 text-[#cbd5e1]" />
                </div>
                <h3 className="text-lg font-bold text-[#0f172a]">Recycle Bin is Empty</h3>
                <p className="mt-2 text-sm font-medium text-[#64748b] max-w-sm">
                  Items you delete will appear here for 30 days before being permanently removed.
                </p>
              </div>
            )}

            {status === "ready" && cases.length > 0 && filteredCases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                <Search className="h-10 w-10 text-[#e2e8f0] mb-4" />
                <h3 className="text-base font-bold text-[#0f172a]">No matches found</h3>
                <p className="mt-1 text-sm font-medium text-[#64748b]">
                  We couldn&apos;t find any deleted items matching &quot;{query}&quot;.
                </p>
                <Button
                  variant="link"
                  onClick={() => setQuery("")}
                  className="mt-2 text-[#4f46e5] font-bold"
                >
                  Clear search
                </Button>
              </div>
            )}

            {status === "ready" && filteredCases.length > 0 && (
              <>
                <div className="grid gap-4 px-4 pb-2 md:hidden">
                  {filteredCases.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/cases/${item.id}`}
                            className="block truncate text-sm font-bold text-[#0f172a] hover:text-[#4f46e5]"
                          >
                            {item.displayName || "Unnamed Document"}
                          </Link>
                          <div className="mt-1 text-[11px] font-medium text-[#94a3b8]">
                            {formatDateTime(item.deletedAt)} • by Admin
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-[#f8fafc] p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
                            Receiver
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold text-[#64748b]">
                            {item.receiverName || "Receiver pending"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#f8fafc] p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
                            Expires
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#64748b]">
                            <Clock className="h-3.5 w-3.5" />
                            {calculateDaysRemaining(item.deletedAt)}d
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2">
                        <Link
                          href={`/cases/${item.id}`}
                          className="rounded-lg border border-[#e2e8f0] p-2 text-[#64748b] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a]"
                          aria-label="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          className="rounded-lg border border-[#e0e7ff] p-2 text-[#4f46e5] transition-colors hover:bg-[#eef2ff]"
                          aria-label="Restore"
                          onClick={() => setPendingAction({ type: "restore", item })}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg border border-[#fecaca] p-2 text-[#e11d48] transition-colors hover:bg-[#fef2f2]"
                          aria-label="Delete Permanently"
                          onClick={() => setPendingAction({ type: "destroy", item })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table className="w-full text-sm">
                    <TableHeader>
                      <TableRow className="border-b border-[#f1f5f9] hover:bg-transparent">
                        <TableHead className="h-12 font-bold text-[#94a3b8] text-xs uppercase tracking-wider">DOCUMENT</TableHead>
                        <TableHead className="h-12 font-bold text-[#94a3b8] text-xs uppercase tracking-wider">RECEIVER</TableHead>
                        <TableHead className="h-12 font-bold text-[#94a3b8] text-xs uppercase tracking-wider">EXPIRES</TableHead>
                        <TableHead className="h-12 font-bold text-[#94a3b8] text-xs uppercase tracking-wider text-right pr-6 md:pr-8">ACTIONS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCases.map((item) => (
                        <TableRow
                          key={item.id}
                          className="group border-[#f1f5f9] transition-colors hover:bg-[#f8fafc] h-16"
                        >
                          <TableCell className="py-4 pl-6 md:pl-8">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 w-8 h-8 rounded-lg bg-[#f1f5f9] border border-[#e2e8f0] text-[#64748b] flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <Link
                                  href={`/cases/${item.id}`}
                                  className="font-bold text-[#0f172a] text-sm transition-colors hover:text-[#4f46e5]"
                                >
                                  {item.displayName || "Unnamed Document"}
                                </Link>
                                <div className="mt-1 text-[11px] font-medium text-[#94a3b8]">
                                  {formatDateTime(item.deletedAt)} • by Admin
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                              <span className="font-semibold text-[#64748b] text-sm truncate max-w-[150px]">
                                {item.receiverName || "Receiver pending"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            <div className="flex items-center gap-1.5 text-[#64748b] text-sm font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              {calculateDaysRemaining(item.deletedAt)}d
                            </div>
                          </TableCell>

                          <TableCell className="pr-6 md:pr-8 py-4 text-right">
                            <div className="flex items-center justify-end gap-3 text-[#94a3b8]">
                              <Link
                                href={`/cases/${item.id}`}
                                className="p-1.5 hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md transition-colors"
                                aria-label="View"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                              <button
                                className="p-1.5 hover:text-[#4f46e5] hover:bg-[#eef2ff] rounded-md transition-colors"
                                aria-label="Restore"
                                onClick={() => setPendingAction({ type: "restore", item })}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1.5 hover:text-[#e11d48] hover:bg-[#fef2f2] rounded-md transition-colors"
                                aria-label="Delete Permanently"
                                onClick={() => setPendingAction({ type: "destroy", item })}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {/* Pagination Footer (Placeholder matching image) */}
            {status === "ready" && filteredCases.length > 0 && (
              <div className="px-6 md:px-8 pt-4 pb-2 flex items-center justify-between text-sm font-semibold text-[#94a3b8]">
                <div>Page 1 of 1</div>
                <div className="flex items-center gap-4">
                  <button className="flex items-center opacity-50 cursor-not-allowed">
                    <ChevronDown className="w-4 h-4 rotate-90 mr-1" /> Previous
                  </button>
                  <button className="flex items-center opacity-50 cursor-not-allowed">
                    Next <ChevronDown className="w-4 h-4 -rotate-90 ml-1" />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Confirmation Dialog remains unchanged functionally, but styled to fit if possible via its own component */}
        <CaseConfirmDialog
          open={Boolean(pendingAction)}
          onOpenChange={(open) => {
            if (!open && !isMutating) {
              setPendingAction(null);
            }
          }}
          title={
            pendingAction?.type === "restore"
              ? "Restore this case?"
              : "Delete this case permanently?"
          }
          description={
            pendingAction
              ? pendingAction.type === "restore"
                ? `"${pendingAction.item.displayName}" will be moved back into the active cases list.`
                : `"${pendingAction.item.displayName}" and its stored documents will be removed permanently. This cannot be undone.`
              : ""
          }
          confirmLabel={pendingAction?.type === "restore" ? "Restore case" : "Delete forever"}
          variant={pendingAction?.type === "restore" ? "default" : "danger"}
          loading={isMutating}
          onConfirm={handleConfirmAction}
        />
      </div>
    </AppShell>
  );
}
