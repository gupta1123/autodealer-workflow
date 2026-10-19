"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

import { CaseConfirmDialog } from "@/components/cases/CaseConfirmDialog";
import { AppShell } from "@/components/dashboard/AppShell";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
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
  fetchCasePage,
  restoreCase,
  type FetchCasesOptions,
  type SavedCaseRecord,
} from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";
type PendingAction =
  | { type: "destroy"; item: SavedCaseRecord }
  | { type: "restore"; item: SavedCaseRecord }
  | { type: "bulk-restore" }
  | { type: "bulk-destroy" }
  | { type: "empty" }
  | null;
type Notice = { tone: "success" | "warning"; text: string } | null;

const RETENTION_DAYS = 30;
const BULK_CONCURRENCY = 4;
const EMPTY_BIN_PAGE_SIZE = 100;
const EMPTY_BIN_MAX_PAGES = 50;

const AUTO_ROW_HEIGHT_PX = 52;
const AUTO_PAGE_CHROME_PX = 340;
const AUTO_MIN_ROWS = 5;
const AUTO_MAX_ROWS = 100;
const FALLBACK_PAGE_SIZE = 25;

const ROWS_PER_PAGE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
];

// Each dropdown sits under a heading (see FilterField), so the labels stay short.
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const APPROVAL_OPTIONS = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Awaiting approval" },
  { value: "rejected", label: "Rejected" },
];

const RECONCILIATION_OPTIONS = [
  { value: "all", label: "All" },
  { value: "clean", label: "Matched (no issues)" },
  { value: "issues", label: "Has mismatches" },
];

const EXPIRY_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "soon", label: "Within 7 days" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Newest deleted first" },
  { value: "oldest", label: "Oldest deleted first" },
];

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1 sm:w-44">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8a7f72]">
        {label}
      </span>
      {children}
    </div>
  );
}

function formatRelativeDate(dateString: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function calculateDaysRemaining(deletedAt: string | null) {
  if (!deletedAt) return null;
  const deletedDate = new Date(deletedAt);
  const expiryDate = new Date(deletedDate.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const diffTime = Math.max(0, expiryDate.getTime() - Date.now());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function toReadableCaseText(value: string) {
  return value
    .split(/(\/)/)
    .map((part) => {
      if (part === "/") return part;
      return part
        .split(/(\s+)/)
        .map((word) => {
          if (!word.trim()) return word;
          if (/[0-9]/.test(word)) return word;
          if (word.length <= 3 && word === word.toUpperCase()) return word;
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join("");
    })
    .join("")
    .replace(/\s+packet$/i, " packet");
}

function getCaseTitle(item: SavedCaseRecord) {
  if (item.receiverName) return toReadableCaseText(item.receiverName);
  if (item.buyerName) return toReadableCaseText(item.buyerName);
  return toReadableCaseText(item.displayName);
}

function getCaseSubtitle(item: SavedCaseRecord) {
  if (item.invoiceNumber) return `Inv: ${item.invoiceNumber}`;
  if (item.poNumber) return `PO: ${item.poNumber}`;
  return item.category || "Document Packet";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Runs one request per id with limited concurrency and reports each outcome. */
async function runForEach(
  ids: string[],
  task: (id: string) => Promise<unknown>
): Promise<{ succeeded: string[]; failures: string[] }> {
  const succeeded: string[] = [];
  const failures: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await task(id);
        succeeded.push(id);
      } catch (taskError) {
        failures.push(errorMessage(taskError, "Request failed."));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, () => worker())
  );
  return { succeeded, failures };
}

export function RecycleBinPage() {
  const [cases, setCases] = useState<SavedCaseRecord[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedApproval, setSelectedApproval] = useState("all");
  const [selectedReconciliation, setSelectedReconciliation] = useState("all");
  const [selectedExpiry, setSelectedExpiry] = useState("all");
  const [selectedSort, setSelectedSort] = useState("recent");
  const [rowsMode, setRowsMode] = useState("auto");
  const [autoPageSize, setAutoPageSize] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  const pageSizeReady = rowsMode !== "auto" || autoPageSize !== null;
  const pageSize =
    rowsMode === "auto" ? autoPageSize ?? FALLBACK_PAGE_SIZE : Number(rowsMode);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setCurrentPage(1);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  // Auto page size: as many rows as fit the viewport, re-measured on resize.
  useEffect(() => {
    if (rowsMode !== "auto") return;

    function measure() {
      const rows = Math.floor((window.innerHeight - AUTO_PAGE_CHROME_PX) / AUTO_ROW_HEIGHT_PX);
      const next = Math.min(AUTO_MAX_ROWS, Math.max(AUTO_MIN_ROWS, rows));
      setAutoPageSize((current) => {
        if (current === next) return current;
        if (current !== null) setCurrentPage(1);
        return next;
      });
    }

    measure();
    let timeout: number | undefined;
    function onResize() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(measure, 200);
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("resize", onResize);
    };
  }, [rowsMode]);

  useEffect(() => {
    if (!pageSizeReady) return;
    const controller = new AbortController();

    // Keep the current rows on screen while a new page loads; only the very
    // first load (or a load after an error) shows skeletons.
    setRefreshing(true);
    setError(null);

    fetchCasePage({
      scope: "deleted",
      limit: pageSize,
      page: currentPage,
      query: debouncedQuery,
      statusFilter: selectedStatus as FetchCasesOptions["statusFilter"],
      approvalFilter: selectedApproval as FetchCasesOptions["approvalFilter"],
      reconciliationFilter: selectedReconciliation as FetchCasesOptions["reconciliationFilter"],
      expiring: selectedExpiry === "soon",
      sortMode: selectedSort as FetchCasesOptions["sortMode"],
      signal: controller.signal,
    })
      .then((payload) => {
        const lastPage = Math.max(1, payload.totalPages ?? 1);
        if (payload.cases.length === 0 && currentPage > lastPage) {
          // Removed the last row of the final page: step back and reload.
          setCurrentPage(lastPage);
          return;
        }
        setCases(payload.cases);
        setTotalCount(payload.totalCount ?? payload.cases.length);
        setTotalPages(payload.totalPages ?? 1);
        setSelectedIds(new Set());
        setStatus("ready");
        setRefreshing(false);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError, "Failed to load recycle bin."));
        setStatus("error");
        setRefreshing(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    currentPage,
    debouncedQuery,
    pageSize,
    pageSizeReady,
    reloadKey,
    selectedStatus,
    selectedApproval,
    selectedReconciliation,
    selectedExpiry,
    selectedSort,
  ]);

  const hasActiveFilters =
    selectedStatus !== "all" ||
    selectedApproval !== "all" ||
    selectedReconciliation !== "all" ||
    selectedExpiry !== "all";
  const isFiltered = hasActiveFilters || Boolean(debouncedQuery);

  function clearFilters() {
    setQuery("");
    setSelectedStatus("all");
    setSelectedApproval("all");
    setSelectedReconciliation("all");
    setSelectedExpiry("all");
    setSelectedSort("recent");
    setCurrentPage(1);
  }

  const allOnPageSelected = cases.length > 0 && cases.every((item) => selectedIds.has(item.id));
  const selectedCount = selectedIds.size;
  const selectedItems = useMemo(
    () => cases.filter((item) => selectedIds.has(item.id)),
    [cases, selectedIds]
  );

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(cases.map((item) => item.id)));
  }

  function closeDialog() {
    setPendingAction(null);
    setActionError(null);
  }

  async function collectAllDeletedIds() {
    const ids: string[] = [];
    for (let page = 1; page <= EMPTY_BIN_MAX_PAGES; page += 1) {
      const payload = await fetchCasePage({
        scope: "deleted",
        limit: EMPTY_BIN_PAGE_SIZE,
        page,
      });
      ids.push(...payload.cases.map((item) => item.id));
      if (page >= (payload.totalPages ?? 1)) break;
    }
    return ids;
  }

  async function handleConfirmAction() {
    if (!pendingAction) return;

    try {
      setIsMutating(true);
      setActionError(null);

      if (pendingAction.type === "restore" || pendingAction.type === "destroy") {
        if (pendingAction.type === "restore") {
          await restoreCase(pendingAction.item.id);
        } else {
          await deleteCaseForever(pendingAction.item.id);
        }
        setNotice(null);
        closeDialog();
        setReloadKey((key) => key + 1);
        return;
      }

      const restoring = pendingAction.type === "bulk-restore";
      const ids =
        pendingAction.type === "empty"
          ? await collectAllDeletedIds()
          : selectedItems.map((item) => item.id);
      const { succeeded, failures } = await runForEach(
        ids,
        restoring ? restoreCase : deleteCaseForever
      );

      const verb = restoring ? "restored" : "deleted permanently";
      if (failures.length === 0) {
        setNotice({
          tone: "success",
          text: `${succeeded.length} ${succeeded.length === 1 ? "case" : "cases"} ${verb}.`,
        });
      } else {
        setNotice({
          tone: "warning",
          text: `${succeeded.length} ${verb}, ${failures.length} could not be processed. ${failures[0]}`,
        });
      }
      closeDialog();
      setCurrentPage(1);
      setReloadKey((key) => key + 1);
    } catch (mutationError) {
      setActionError(errorMessage(mutationError, "Failed to update recycle bin."));
    } finally {
      setIsMutating(false);
    }
  }

  const dialogCopy = (() => {
    if (!pendingAction) {
      return { title: "", description: "", confirmLabel: "", danger: false, footnote: null as string | null };
    }
    const keepNote =
      "Cases with purchase, approval or ERP history are kept and cannot be deleted permanently.";
    switch (pendingAction.type) {
      case "restore":
        return {
          title: "Restore this case?",
          description: `"${pendingAction.item.displayName}" will be moved back into the active cases list.`,
          confirmLabel: "Restore case",
          danger: false,
          footnote: null,
        };
      case "bulk-restore":
        return {
          title: `Restore ${selectedCount} ${selectedCount === 1 ? "case" : "cases"}?`,
          description: "The selected cases will be moved back into the active cases list.",
          confirmLabel: "Restore selected",
          danger: false,
          footnote: null,
        };
      case "bulk-destroy":
        return {
          title: `Delete ${selectedCount} ${selectedCount === 1 ? "case" : "cases"} permanently?`,
          description:
            "The selected cases and their stored documents will be removed permanently. This cannot be undone.",
          confirmLabel: "Delete forever",
          danger: true,
          footnote: keepNote,
        };
      case "empty":
        return {
          title: "Empty the recycle bin?",
          description: `All ${totalCount} ${totalCount === 1 ? "case" : "cases"} in the recycle bin and their stored documents will be removed permanently. This cannot be undone.`,
          confirmLabel: "Empty recycle bin",
          danger: true,
          footnote: keepNote,
        };
      default:
        return {
          title: "Delete this case permanently?",
          description: `"${pendingAction.item.displayName}" and its stored documents will be removed permanently. This cannot be undone.`,
          confirmLabel: "Delete forever",
          danger: true,
          footnote: keepNote,
        };
    }
  })();

  return (
    <AppShell>
      <div className="min-h-full bg-[#f7f4ef] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4">

          {/* ── Fixed/Sticky Reusable PageHeader (Matches CasesPage) ── */}
          <PageHeader
            title="Recycle Bin"
            subtitle="Manage and restore deleted cases"
            badge={
              <div className="flex items-center gap-1.5 rounded-lg border border-[#e6ded2] bg-[#fbfaf8] px-2.5 py-1 text-xs font-medium text-[#5b4b3d] shadow-sm">
                <Trash2 className="h-3 w-3 text-[#8a7f72]" />
                <span>Auto-cleans in {RETENTION_DAYS} days</span>
              </div>
            }
            actions={
              <div className="flex items-center gap-2">
                {totalCount > 0 && !isFiltered && (
                  <button
                    type="button"
                    onClick={() => setPendingAction({ type: "empty" })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#f2c7c4] bg-[#fbf0ef] px-3 py-1.5 text-xs font-medium text-[#8c1d18] shadow-sm transition hover:bg-[#f7e1df]"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Empty bin</span>
                  </button>
                )}
                <Link
                  href="/cases"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 py-1.5 text-xs font-medium text-[#3d3530] shadow-sm transition hover:bg-[#ede6d9]"
                >
                  <span>All Cases</span>
                </Link>
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              {/* Search Input Filter */}
              <div className="flex h-9 max-w-md items-center gap-2 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 text-xs shadow-sm focus-within:border-[#b9aa99] focus-within:bg-white transition">
                <Search className="h-3.5 w-3.5 text-[#8a7f72]" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search deleted cases, buyers, or numbers..."
                  className="w-full bg-transparent font-medium text-[#111827] outline-none placeholder:text-[#b5aaa0]"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-[11px] font-semibold text-[#8a7f72] hover:text-[#111827]"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <FilterField label="Processing status">
                  <SelectDropdown
                    value={selectedStatus}
                    onChange={(value) => {
                      setSelectedStatus(value);
                      setCurrentPage(1);
                    }}
                    options={STATUS_OPTIONS}
                    placeholder="All"
                  />
                </FilterField>

                <FilterField label="Approval">
                  <SelectDropdown
                    value={selectedApproval}
                    onChange={(value) => {
                      setSelectedApproval(value);
                      setCurrentPage(1);
                    }}
                    options={APPROVAL_OPTIONS}
                    placeholder="All"
                  />
                </FilterField>

                <FilterField label="Reconciliation">
                  <SelectDropdown
                    value={selectedReconciliation}
                    onChange={(value) => {
                      setSelectedReconciliation(value);
                      setCurrentPage(1);
                    }}
                    options={RECONCILIATION_OPTIONS}
                    placeholder="All"
                  />
                </FilterField>

                <FilterField label="Auto-deletes">
                  <SelectDropdown
                    value={selectedExpiry}
                    onChange={(value) => {
                      setSelectedExpiry(value);
                      setCurrentPage(1);
                    }}
                    options={EXPIRY_OPTIONS}
                    placeholder="Any time"
                  />
                </FilterField>

                <FilterField label="Sort by">
                  <SelectDropdown
                    value={selectedSort}
                    onChange={(value) => {
                      setSelectedSort(value);
                      setCurrentPage(1);
                    }}
                    options={SORT_OPTIONS}
                    placeholder="Newest deleted first"
                  />
                </FilterField>

                {(hasActiveFilters || selectedSort !== "recent") && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="h-9 px-1 text-xs font-semibold text-[#2b1a10] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </PageHeader>

          {notice && (
            <div
              role="status"
              className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium ${
                notice.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <span>{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="shrink-0 font-semibold hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e0d8cc] bg-[#fbfaf8] px-3 py-2 text-xs shadow-sm">
              <span className="font-semibold text-[#3d3530]">{selectedCount} selected</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  onClick={() => setPendingAction({ type: "bulk-restore" })}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restore selected</span>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  onClick={() => setPendingAction({ type: "bulk-destroy" })}
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Delete selected</span>
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#8a7f72] hover:text-[#111827]"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ── Cardless Table Area (Matches CasesPage) ── */}
          <div className="w-full pt-1">
            {status === "loading" && (
              <div className="space-y-3 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-3 border-b border-[#ece6dc]">
                    <Skeleton className="h-4 w-44 bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-32 bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-20 bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-20 bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-16 ml-auto bg-[#eee7dd]" />
                  </div>
                ))}
              </div>
            )}

            {status === "error" && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            {status === "ready" && cases.length === 0 && (
              <div className="flex min-h-[300px] flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[#ded8d0] bg-[#fbfaf8] text-[#8a7f72]">
                  <Trash2 className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-[#111827]">
                  {isFiltered ? "No matching deleted cases found" : "Recycle bin is empty"}
                </p>
                <p className="mt-1 text-xs text-[#8a7f72]">
                  {isFiltered
                    ? "Try adjusting your search or filters."
                    : "Cases moved to the recycle bin will appear here."}
                </p>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 text-xs font-semibold text-[#2b1a10] hover:underline"
                  >
                    Clear search and filters
                  </button>
                )}
              </div>
            )}

            {status === "ready" && cases.length > 0 && (
              <div className={`w-full transition-opacity ${refreshing ? "opacity-60" : ""}`}>
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="border-b border-[#e0d8cc] bg-transparent hover:bg-transparent">
                      <TableHead className="h-10 w-8 pl-0 pr-2">
                        <input
                          type="checkbox"
                          aria-label="Select all cases on this page"
                          checked={allOnPageSelected}
                          onChange={toggleAllOnPage}
                          className="h-3.5 w-3.5 cursor-pointer accent-[#2b1a10]"
                        />
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Case / Document
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Category
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Deleted On
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Expires In
                      </TableHead>
                      <TableHead className="h-10 pl-3 pr-0 text-right text-xs font-semibold text-[#3d3530]">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((item) => {
                      const daysRemaining = calculateDaysRemaining(item.deletedAt);
                      const selected = selectedIds.has(item.id);
                      return (
                        <TableRow
                          key={item.id}
                          data-state={selected ? "selected" : undefined}
                          className="group h-[52px] border-b border-[#ece6dc] transition-colors hover:bg-[#ede6d9]/40 data-[state=selected]:bg-[#ede6d9]/60"
                        >
                          <TableCell className="w-8 pl-0 pr-2 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Select ${item.displayName}`}
                              checked={selected}
                              onChange={() => toggleSelected(item.id)}
                              className="h-3.5 w-3.5 cursor-pointer accent-[#2b1a10]"
                            />
                          </TableCell>

                          {/* Title / Subtitle */}
                          <TableCell className="px-3 py-2 font-medium text-[#111827]">
                            <Link
                              href={`/cases/${item.id}`}
                              className="hover:underline hover:text-[#2b1a10] block max-w-[280px] truncate font-medium text-[13px]"
                            >
                              {getCaseTitle(item)}
                            </Link>
                            <span className="block text-[11px] font-normal text-[#8a7f72] truncate max-w-[260px]">
                              {getCaseSubtitle(item)}
                            </span>
                          </TableCell>

                          {/* Category */}
                          <TableCell className="px-3 py-2 text-xs text-[#5a5046] font-normal">
                            <span className="block max-w-[160px] truncate" title={item.category || ""}>
                              {item.category || "—"}
                            </span>
                          </TableCell>

                          {/* Deleted On Date */}
                          <TableCell className="px-3 py-2 text-xs text-[#5a5046] font-normal whitespace-nowrap">
                            {formatRelativeDate(item.deletedAt)}
                          </TableCell>

                          {/* Expires In */}
                          <TableCell className="px-3 py-2 whitespace-nowrap">
                            {item.keptForHistory ? (
                              <span
                                className="inline-flex items-center rounded-full border border-[#ded8d0] bg-[#fbfaf8] px-2.5 py-0.5 text-xs font-medium text-[#5b4b3d]"
                                title="Has purchase posting or approval history, so it is kept and never auto-deleted."
                              >
                                Kept (has history)
                              </span>
                            ) : daysRemaining === null ? (
                              <span className="text-xs text-[#8a7f72]">—</span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                  daysRemaining <= 5
                                    ? "bg-[#fbf0ef] text-[#8c1d18] border-[#f2c7c4]"
                                    : "bg-[#fef6e9] text-[#78350f] border-[#f9d8a7]"
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                <span>{daysRemaining} {daysRemaining === 1 ? "day" : "days"}</span>
                              </span>
                            )}
                          </TableCell>

                          {/* Action Buttons */}
                          <TableCell className="pl-3 pr-0 py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/cases/${item.id}`}
                                className="text-xs font-semibold text-[#2b1a10] hover:text-black hover:underline"
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 transition-colors"
                                onClick={() => setPendingAction({ type: "restore", item })}
                                title="Restore case"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Restore</span>
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-[#8a7f72] transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                                aria-label="Delete permanently"
                                onClick={() => setPendingAction({ type: "destroy", item })}
                                title="Delete permanently"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ── Seamless Pagination Footer (Matches CasesPage) ── */}
            {status === "ready" && totalCount > 0 && (
              <div className="flex flex-col gap-3 pt-4 text-xs text-[#8a7f72] sm:flex-row sm:items-center sm:justify-between">
                {/* Rows per page selector */}
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <SelectDropdown
                    size="sm"
                    value={rowsMode}
                    onChange={(val) => {
                      setRowsMode(val);
                      setCurrentPage(1);
                    }}
                    options={ROWS_PER_PAGE_OPTIONS}
                    className="w-20"
                  />
                  {rowsMode === "auto" && <span>({pageSize} fit your screen)</span>}
                </div>

                {/* Page Navigation */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 py-1.5 text-xs font-medium text-[#3d3530] shadow-sm transition hover:bg-[#ede6d9] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Previous</span>
                  </button>

                  <span className="text-xs font-medium text-[#8a7f72]">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 py-1.5 text-xs font-medium text-[#3d3530] shadow-sm transition hover:bg-[#ede6d9] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <CaseConfirmDialog
          open={Boolean(pendingAction)}
          onOpenChange={(open) => {
            if (!open && !isMutating) {
              closeDialog();
            }
          }}
          error={actionError}
          footnote={dialogCopy.footnote}
          title={dialogCopy.title}
          description={dialogCopy.description}
          confirmLabel={dialogCopy.confirmLabel}
          variant={dialogCopy.danger ? "danger" : "default"}
          loading={isMutating}
          onConfirm={handleConfirmAction}
        />
      </div>
    </AppShell>
  );
}
