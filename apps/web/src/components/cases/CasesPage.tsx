"use client";

import { uploadBatchSuffix } from "@autodealer/shared/lib/upload-groups";

import Link from "next/link";
import dynamic from "next/dynamic";
import { canAccess } from "@autodealer/shared/lib/access";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  Shield,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { useAccess } from '@/components/access/AccessProvider';
import { accessCacheEpoch, registerAccessCache } from '@/lib/access-cache';
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { CaseConfirmDialog } from "@/components/cases/CaseConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeAnalysisStep, formatEta, isAnalysisPaused } from "@/lib/analysis-progress";
import {
  type CaseAnalysisProgress,
  fetchCaseAnalysisProgress,
  fetchCasePage,
  recycleCase,
  updateCaseDecision,
  type CaseDecision,
  type SavedCaseRecord,
} from "@/lib/case-persistence";

const VoucherPanel = dynamic(() => import("./TallyPurchasePostingPanel").then(module => module.TallyPurchasePostingPanel), {
  loading: () => <p className="p-4 text-sm" role="status">Loading voucher...</p>,
});

type LoadState = "loading" | "ready" | "error";
type CachedCaseList = {
  cases: SavedCaseRecord[];
  totalCount: number;
  totalPages: number;
};

const caseListCache = new Map<string, CachedCaseList>();
registerAccessCache('case-list',()=>caseListCache.clear());
function cacheCaseList(key:string,value:CachedCaseList){
  caseListCache.delete(key);caseListCache.set(key,value);
  while(caseListCache.size>20)caseListCache.delete(caseListCache.keys().next().value!);
}

function getCaseListCacheKey(query: string, approval: string, reconciliation: string, page: number, pageSize: number) {
  return `active:${query.trim().toLowerCase()}:approval:${approval}:reconciliation:${reconciliation}:page:${page}:limit:${pageSize}`;
}

function localDayBoundary(day: string, nextDay = false) {
  if (!day) return undefined;
  const date = new Date(day + "T00:00:00");
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
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

function getApprovalPill(status: string) {
  switch (status.toLowerCase()) {
    case "processing":
    case "queued":
      return {
        label: "Processing",
        className: "bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]",
        dotColor: "bg-[#2563eb] animate-pulse",
      };
    case "failed":
      return {
        label: "Analysis failed",
        className: "bg-[#fbf0ef] text-[#8c1d18] border-[#f2c7c4]",
        dotColor: "bg-[#b91c1c]",
      };
    case "draft":
      return {
        label: "Not analysed",
        className: "bg-[#f5f5f4] text-[#57534e] border-[#e7e5e4]",
        dotColor: "bg-[#78716c]",
      };
    case "accepted":
      return {
        label: "Approved",
        className: "bg-[#ebf5ee] text-[#1b4332] border-[#c3dfcb]",
        dotColor: "bg-[#2d6a4f]",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "bg-[#fbf0ef] text-[#8c1d18] border-[#f2c7c4]",
        dotColor: "bg-[#b91c1c]",
      };
    default:
      return {
        label: "Pending approval",
        className: "bg-[#fef6e9] text-[#78350f] border-[#f9d8a7]",
        dotColor: "bg-[#b45309]",
      };
  }
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

function caseName(item: SavedCaseRecord) {
  return toReadableCaseText(item.receiverName || item.buyerName || item.displayName);
}

function getCaseTitle(item: SavedCaseRecord) {
  return caseName(item) + uploadBatchSuffix(item.uploadBatch, item.tallyPosting?.status);
}

const APPROVAL_OPTIONS = [
  { value: "all", label: "All Approval States" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending Approval" },
  { value: "rejected", label: "Rejected" },
];

const RECONCILIATION_OPTIONS = [
  { value: "all", label: "All Reconciliation" },
  { value: "clean", label: "No Issues (Matched)" },
  { value: "issues", label: "Has Mismatches" },
];

const ROWS_PER_PAGE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
];

// Auto sizing fits the table to the window: row height plus the table header
// and the pagination footer/page padding that sit around the rows.
const AUTO_ROW_HEIGHT_PX = 53;
const AUTO_TABLE_CHROME_PX = 120;
const AUTO_MIN_ROWS = 5;
const AUTO_MAX_ROWS = 100;
const FALLBACK_PAGE_SIZE = 10;

function getOffsetTopInScrollParents(element: HTMLElement) {
  let top = element.getBoundingClientRect().top;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    top += parent.scrollTop;
  }
  return top;
}

function getTallyPostingLabel(posting: SavedCaseRecord["tallyPosting"]) {
  const status = posting?.status;
  if (status === "created") {
    return {
      label: posting?.voucherNumber ? `Posted · ${posting.voucherNumber}` : "Posted",
      className: "font-medium text-[#2d6a4f]",
      title: posting?.postedAt ? `Posted to Tally ${formatRelativeDate(posting.postedAt)}` : "Posted to Tally",
    };
  }
  if (status === "creating" || status === "sending") {
    return { label: "Posting…", className: "font-medium text-[#2b6cb0]", title: "Tally is saving this voucher" };
  }
  if (status === "approved" || status === "queued") {
    return { label: "In line for Tally", className: "font-medium text-[#2b6cb0]", title: "Purchase posts go to Tally one at a time; this one is waiting its turn" };
  }
  if (status === "verification_required") {
    return { label: posting?.voucherNumber ? `Check in Tally · ${posting.voucherNumber}` : "Check in Tally", className: "font-semibold text-[#9a6700]", title: "Tally's reply was lost; check whether the voucher exists" };
  }
  if (status === "failed") {
    return { label: "Posting failed", className: "font-semibold text-[#8c1d18]", title: "Open the case to see why and retry" };
  }
  return { label: "Not posted", className: "text-[#a89d91]", title: "Not posted to Tally yet" };
}

export function CasesPage() {
  const router = useRouter();
  const {snapshot, enforcementRequired}=useAccess();
  const canDecide = !enforcementRequired || canAccess(snapshot, "purchases.prepare");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<{value: CaseDecision; rows: SavedCaseRecord[]} | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [preview, setPreview] = useState<SavedCaseRecord | null>(null);
  const [cacheEpoch,setCacheEpoch]=useState(accessCacheEpoch);
  useEffect(()=>{const reset=()=>{setCacheEpoch(accessCacheEpoch());setCases([]);setTotalCount(0);setPendingCase(null);setDecision(null);setDecisionMessage("");setPreview(null);setSelectedIds([]);};window.addEventListener('kalika-access-invalidated',reset);return()=>window.removeEventListener('kalika-access-invalidated',reset);},[]);
  const [cases, setCases] = useState<SavedCaseRecord[]>([]);
  const [progressByCase, setProgressByCase] = useState<Record<string, CaseAnalysisProgress>>({});
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  // Relevant filters & controls
  const [showFilters, setShowFilters] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [posting, setPosting] = useState("all");
  const [selectedApproval, setSelectedApproval] = useState("all");
  const [selectedReconciliation, setSelectedReconciliation] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsMode, setRowsMode] = useState("auto");
  const [autoPageSize, setAutoPageSize] = useState<number | null>(null);
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const measuredRowsRef = useRef<number | null>(null);
  const pageSizeReady = rowsMode !== "auto" || autoPageSize !== null;
  const pageSize = rowsMode === "auto" ? autoPageSize ?? FALLBACK_PAGE_SIZE : Number(rowsMode);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listRevision, setListRevision] = useState(0);

  // Deletion
  const [pendingCase, setPendingCase] = useState<SavedCaseRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasFilters = Boolean(searchQuery || dateFrom || dateTo || posting !== "all" || selectedApproval !== "all" || selectedReconciliation !== "all");
  const cacheKey = useMemo(
    () => `${cacheEpoch}:${listRevision}:${snapshot?.member.user_id||'legacy'}:${snapshot?.organizationId||''}:${snapshot?.revision||0}:`+getCaseListCacheKey(debouncedSearchQuery, selectedApproval, selectedReconciliation, currentPage, pageSize) + JSON.stringify([dateFrom, dateTo, posting]),
    [dateFrom, dateTo, posting, currentPage, debouncedSearchQuery, selectedApproval, selectedReconciliation, pageSize,cacheEpoch,listRevision,snapshot?.member.user_id,snapshot?.organizationId,snapshot?.revision]
  );

  const eligibleRows = canDecide ? cases.filter(row => row.status === "completed") : [];
  const selectedRows = eligibleRows.filter(row => selectedIds.includes(row.id));
  useEffect(() => { setSelectedIds([]); }, [cacheKey]);

  async function confirmDecision() {
    if (!decision || deciding || !canDecide) return;
    const epoch = accessCacheEpoch();
    setDeciding(true);
    const failures: string[] = [];
    try {
      for (let offset = 0; offset < decision.rows.length; offset += 4) {
        if (epoch !== accessCacheEpoch()) return;
        const batch = decision.rows.slice(offset, offset + 4);
        const results = await Promise.allSettled(batch.map(row => updateCaseDecision(row.id, decision.value)));
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            failures.push(`${batch[index].displayName} - ${result.reason instanceof Error ? result.reason.message : "Decision failed"}`);
          }
        });
      }
      if (epoch !== accessCacheEpoch()) return;
      const count = decision.rows.length - failures.length;
      setDecisionMessage([`${count} of ${decision.rows.length} cases ${decision.value}.`, ...failures].join(" "));
      setDecision(null);
      caseListCache.clear();
      setListRevision(value => value + 1);
    } finally {
      setDeciding(false);
    }
  }

  // Size the page from the window height so laptops and large monitors both
  // fill their screen without scrolling. Re-measured when the window resizes.
  useEffect(() => {
    if (rowsMode !== "auto") return;

    const measure = () => {
      const area = tableAreaRef.current;
      if (!area) return;
      const available = window.innerHeight - getOffsetTopInScrollParents(area) - AUTO_TABLE_CHROME_PX;
      const rows = Math.min(
        AUTO_MAX_ROWS,
        Math.max(AUTO_MIN_ROWS, Math.floor(available / AUTO_ROW_HEIGHT_PX))
      );
      if (measuredRowsRef.current === rows) return;
      if (measuredRowsRef.current !== null) setCurrentPage(1);
      measuredRowsRef.current = rows;
      setAutoPageSize(rows);
    };

    measure();
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [rowsMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setCurrentPage(1);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    // Wait for the first window measurement so the list is fetched once at
    // the right size instead of fetching a default and then refetching.
    if (!pageSizeReady) return;
    const cached = caseListCache.get(cacheKey);
    if (cached) {
      setCases(cached.cases);
      setTotalCount(cached.totalCount);
      setTotalPages(cached.totalPages);
      setStatus("ready");
      setError(null);
    }

    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let hasResults = Boolean(cached);

    if (!cached) {
      setCases([]);
      setTotalCount(0);
      setTotalPages(1);
      setStatus("loading");
    }
    setError(null);

    const refresh = () => fetchCasePage({
      scope: "active",
      limit: pageSize,
      page: currentPage,
      query: debouncedSearchQuery,
      createdFrom: localDayBoundary(dateFrom),
      createdBefore: localDayBoundary(dateTo, true),
      posting,
      approvalFilter: selectedApproval as "all" | "approved" | "pending" | "rejected",
      reconciliationFilter: selectedReconciliation as "all" | "clean" | "issues",
      signal: controller.signal,
    })
      .then((payload) => {
        if(controller.signal.aborted)return;
        hasResults = true;
        const nextTotalCount = payload.totalCount ?? payload.cases.length;
        const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / pageSize));
        if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages);
        setCases(payload.cases);
        setTotalCount(nextTotalCount);
        setTotalPages(nextTotalPages);
        setStatus("ready");
        cacheCaseList(cacheKey, {
          cases: payload.cases,
          totalCount: nextTotalCount,
          totalPages: nextTotalPages,
        });
        const activeIds = payload.cases
          .filter((item) => item.status === "processing" || item.status === "queued")
          .map((item) => item.id);
        if (activeIds.length) {
          // Progress and time left for the rows that are still being analysed.
          fetchCaseAnalysisProgress(activeIds, controller.signal)
            .then((next) => {
              if (controller.signal.aborted) return;
              // A retry restarts the job at 0; keep the bar from stepping back between polls.
              setProgressByCase((previous) =>
                Object.fromEntries(
                  Object.entries(next).map(([caseId, live]) => [
                    caseId,
                    previous[caseId]?.status === "running" && live.status === "running"
                      ? { ...live, progress: Math.max(live.progress, previous[caseId].progress) }
                      : live,
                  ])
                )
              );
            })
            .catch(() => undefined);
          refreshTimer = setTimeout(refresh, 4000);
        } else {
          setProgressByCase({});
          // Purchase posts run one after another in the connector; keep their status live
          // so people can queue several and watch them finish from the list.
          const postingInFlight = payload.cases.some((item) =>
            ["approved", "queued", "creating", "sending"].includes(item.tallyPosting?.status ?? "")
          );
          if (postingInFlight) refreshTimer = setTimeout(refresh, 10_000);
        }
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        if (hasResults) {
          refreshTimer = setTimeout(refresh, 5000);
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load cases.");
        setStatus("error");
      });
    void refresh();

    return () => { controller.abort(); clearTimeout(refreshTimer); };
  }, [cacheKey, currentPage, debouncedSearchQuery, pageSize, pageSizeReady]);

  async function handleConfirmDelete() {
    if (!pendingCase) return;

    try {
      setIsDeleting(true);
      setError(null);
      await recycleCase(pendingCase.id);
      const nextTotalCount = Math.max(0, totalCount - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / pageSize));
      const nextPage = Math.min(currentPage, nextTotalPages);

      setCases((current) => current.filter((item) => item.id !== pendingCase.id));
      setTotalCount(nextTotalCount);
      setTotalPages(nextTotalPages);
      caseListCache.clear();
      setCurrentPage(nextPage);
      setListRevision((current) => current + 1);
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
      <div className="min-h-full bg-[#f7f4ef] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4">

          {/* ── Fixed/Sticky Reusable PageHeader (Compact SaaS style) ── */}
          <PageHeader
            title="Cases"
            subtitle="Track and manage all cases"
            badge={
              <div className="flex items-center gap-1.5 rounded-lg border border-[#e6ded2] bg-[#fbfaf8] px-2.5 py-1 text-xs font-medium text-[#5b4b3d] shadow-sm">
                <Shield className="h-3 w-3 text-[#8a7f72]" />
                <span>Admin view</span>
              </div>
            }
            actions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 py-1.5 text-xs font-medium text-[#3d3530] shadow-sm transition hover:bg-[#ede6d9]"
                >
                  <Filter className="h-3.5 w-3.5 text-[#8a7f72]" />
                  <span>{showFilters ? "Hide Filters" : "Show Filters"}</span>
                </button>

                <Link
                  href="/workspace"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2b1a10] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#3b271a]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Case</span>
                </Link>
              </div>
            }
          >
            {showFilters && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {/* Customer / Case Search */}
                <div className="flex h-9 items-center gap-2 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 text-xs shadow-sm focus-within:border-[#b9aa99] focus-within:bg-white transition">
                  <Search className="h-3.5 w-3.5 text-[#8a7f72]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search case, buyer, invoice or PO..."
                    className="w-full bg-transparent font-medium text-[#111827] outline-none placeholder:text-[#b5aaa0]"
                  />
                </div>

                {/* Approval Filter */}
                <SelectDropdown
                  value={selectedApproval}
                  onChange={(value) => {
                    setSelectedApproval(value);
                    setCurrentPage(1);
                  }}
                  options={APPROVAL_OPTIONS}
                  placeholder="All Approval States"
                />

                {/* Reconciliation / Mismatch Filter */}
                <SelectDropdown
                  value={selectedReconciliation}
                  onChange={(value) => {
                    setSelectedReconciliation(value);
                    setCurrentPage(1);
                  }}
                  options={RECONCILIATION_OPTIONS}
                  placeholder="All Reconciliation"
                />
                <label className="flex h-9 items-center justify-between gap-2 rounded-lg border px-3 text-xs">
                  Created from
                  <input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => { setDateFrom(event.target.value); setCurrentPage(1); }} />
                </label>
                <label className="flex h-9 items-center justify-between gap-2 rounded-lg border px-3 text-xs">
                  Created through
                  <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => { setDateTo(event.target.value); setCurrentPage(1); }} />
                </label>
                <SelectDropdown value={posting} onChange={value => { setPosting(value); setCurrentPage(1); }}
                  options={[
                    { value: "all", label: "All Tally posting states" },
                    { value: "posted", label: "Posted to Tally" }, { value: "unposted", label: "Not posted" },
                    { value: "waiting", label: "In line for Tally" }, { value: "posting", label: "Posting" },
                    { value: "verification", label: "Check in Tally" }, { value: "failed", label: "Posting failed" },
                  ]} />
                {hasFilters && <button type="button" className="justify-self-start text-xs underline" onClick={() => {
                  setDateFrom(""); setDateTo(""); setPosting("all"); setSelectedApproval("all");
                  setSelectedReconciliation("all"); setSearchQuery(""); setDebouncedSearchQuery(""); setCurrentPage(1);
                }}>Clear filters</button>}
              </div>
            )}
          </PageHeader>

          {/* ── Seamless Cardless Table ── */}
          <div ref={tableAreaRef} className="w-full pt-1">
            {decisionMessage && <p role="status" className="mb-3 text-sm">{decisionMessage}</p>}
            {selectedRows.length > 0 && (
              <div className="mb-3 flex items-center gap-3 text-sm">
                <span>{selectedRows.length} selected</span>
                <button type="button" className="font-semibold text-emerald-800" onClick={() => setDecision({value: "accepted", rows: selectedRows})}>Accept selected</button>
                <button type="button" className="font-semibold text-rose-800" onClick={() => setDecision({value: "rejected", rows: selectedRows})}>Reject selected</button>
              </div>
            )}
            {status === "loading" && (
              <div className="space-y-3 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-3 border-b border-[#ece6dc]">
                    <Skeleton className="h-4 w-44 bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-32 bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-16 bg-[#eee7dd]" />
                    <Skeleton className="h-5 w-20 rounded-full bg-[#eee7dd]" />
                    <Skeleton className="h-4 w-24 bg-[#eee7dd]" />
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
                <p className="text-sm font-semibold text-[#111827]">
                  {hasFilters ? "No matching cases found" : "No cases yet"}
                </p>
                <p className="mt-1 text-xs text-[#8a7f72]">
                  {hasFilters
                    ? "Try adjusting your search query or filters."
                    : "Add your first case to see it in the list."}
                </p>
                {!hasFilters && (
                  <Link
                    href="/workspace"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#2b1a10] px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#3b271a]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Case
                  </Link>
                )}
              </div>
            )}

            {status === "ready" && Object.values(progressByCase).some(isAnalysisPaused) && (
              <div
                role="status"
                className="mb-3 rounded-lg border border-[#e8d9a8] bg-[#fdf6dc] px-3.5 py-2.5 text-xs text-[#6b5200]"
              >
                Some cases are waiting to be processed. We&apos;re on it. You don&apos;t need to do anything or upload
                them again.
              </div>
            )}

            {status === "ready" && cases.length > 0 && (
              <div className="w-full">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="border-b border-[#e0d8cc] bg-transparent hover:bg-transparent">
                      {canDecide && <TableHead className="w-8 px-1">
                        <input type="checkbox" aria-label="Select all analysed cases on this page"
                          ref={node => { if (node) node.indeterminate = selectedRows.length > 0 && selectedRows.length < eligibleRows.length; }}
                          disabled={!eligibleRows.length} checked={eligibleRows.length > 0 && selectedRows.length === eligibleRows.length}
                          onChange={event => setSelectedIds(event.target.checked ? eligibleRows.map(row => row.id) : [])} />
                      </TableHead>}
                      <TableHead className="h-10 pl-0 pr-3 text-xs font-semibold text-[#3d3530]">
                        Customer Name
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Invoice
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Approval
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Reconciliation
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Tally
                      </TableHead>
                      <TableHead className="h-10 px-2.5 text-center text-xs font-semibold text-[#3d3530]">
                        Docs
                      </TableHead>
                      <TableHead className="h-10 px-3 text-xs font-semibold text-[#3d3530]">
                        Date
                      </TableHead>
                      <TableHead className="h-10 pl-3 pr-0 text-right text-xs font-semibold text-[#3d3530]">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((item) => {
                      const pill = getApprovalPill(item.status);
                      return (
                        <TableRow
                          key={item.id}
                          className="group h-[52px] border-b border-[#ece6dc] transition-colors hover:bg-[#ede6d9]/40"
                        >
                          {canDecide && <TableCell className="w-8 px-1">
                            {item.status === "completed" && <input type="checkbox" aria-label={`Select ${getCaseTitle(item)}`}
                              checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])} />}
                          </TableCell>}
                          {/* Customer Name */}
                          <TableCell className="pl-0 pr-3 py-2 font-medium text-[#111827]">
                            <Link
                              href={`/cases/${item.id}`}
                              className="hover:underline hover:text-[#2b1a10] flex max-w-[260px] items-baseline gap-1 font-medium text-[13px]"
                              onFocus={() => router.prefetch(`/cases/${item.id}`)}
                              onMouseEnter={() => router.prefetch(`/cases/${item.id}`)}
                            >
                              <span className="truncate">{caseName(item)}</span>
                              <span className="shrink-0">{uploadBatchSuffix(item.uploadBatch, item.tallyPosting?.status)}</span>
                            </Link>
                          </TableCell>

                          {/* Invoice */}
                          <TableCell className="px-3 py-2 text-xs text-[#5a5046] font-normal">
                            <span className="block max-w-[180px] truncate" title={item.invoiceNumber || ""}>
                              {item.invoiceNumber || "—"}
                            </span>
                          </TableCell>

                          {/* Approval decision */}
                          <TableCell className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${pill.className}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${pill.dotColor}`} />
                              {isAnalysisPaused(progressByCase[item.id]) ? "Paused" : pill.label}
                            </span>
                            {(item.status === "processing" || item.status === "queued") && (() => {
                              const live = progressByCase[item.id];
                              if (!live) return null;
                              const eta = live.status === "running" ? formatEta(live.etaSeconds) : null;
                              const stepLabel = describeAnalysisStep({
                                status: live.status,
                                stage: live.stage,
                                detail: live.detail,
                                queuePosition: live.queuePosition,
                                nextRunAt: live.nextRunAt,
                              });
                              return (
                                <div className="mt-1.5 w-44" title={stepLabel}>
                                  <div className="h-1 overflow-hidden rounded-full bg-[#ece8e0]">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${isAnalysisPaused(live) ? "bg-[#c9a227]" : "bg-[#2b6cb0]"}`}
                                      style={{ width: `${live.status === "queued" ? 4 : Math.min(100, Math.max(4, live.progress))}%` }}
                                    />
                                  </div>
                                  <div className="mt-0.5 flex justify-between gap-2 text-[10px] text-[#8a7f72]">
                                    <span className="truncate">{live.status === "queued" ? stepLabel : `${Math.round(live.progress)}%`}</span>
                                    {eta ? <span className="shrink-0">{eta}</span> : null}
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>

                          {/* Reconciliation */}
                          <TableCell className="px-3 py-2 text-xs font-normal whitespace-nowrap">
                            {item.mismatchCount > 0 ? (
                              <span className="font-semibold text-[#8c1d18]">
                                {item.mismatchCount} {item.mismatchCount === 1 ? "issue" : "issues"}
                              </span>
                            ) : item.status === "completed" || item.status === "accepted" ? (
                              <span className="font-medium text-[#2d6a4f]">No issues</span>
                            ) : (
                              <span className="text-[#a89d91]">—</span>
                            )}
                          </TableCell>

                          {/* Tally posting */}
                          <TableCell className="px-3 py-2 text-xs font-normal whitespace-nowrap">
                            {(() => {
                              const posting = getTallyPostingLabel(item.tallyPosting);
                              return (
                                <span className={posting.className} title={posting.title}>
                                  {posting.label}
                                </span>
                              );
                            })()}
                          </TableCell>

                          {/* Docs */}
                          <TableCell className="px-2.5 py-2 text-xs text-[#5a5046] font-normal text-center whitespace-nowrap">
                            {item.documentCount}
                          </TableCell>

                          {/* Date */}
                          <TableCell className="px-3 py-2 text-xs text-[#5a5046] font-normal whitespace-nowrap">
                            {formatRelativeDate(item.createdAt)}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="pl-3 pr-0 py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {canDecide && item.status === "completed" && <>
                                <button type="button" title="Accept case" aria-label={`Accept ${getCaseTitle(item)}`} className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50" onClick={() => setDecision({value: "accepted", rows: [item]})}><Check size={16} /></button>
                                <button type="button" title="Reject case" aria-label={`Reject ${getCaseTitle(item)}`} className="rounded p-1.5 text-rose-700 hover:bg-rose-50" onClick={() => setDecision({value: "rejected", rows: [item]})}><X size={16} /></button>
                              </>}
                              {item.status === "accepted" && <button type="button" title="Quick view voucher" aria-label={`Quick view voucher for ${getCaseTitle(item)}`} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50" onClick={() => setPreview(item)}><Eye size={15} /> Quick view</button>}
                              <Link
                                href={`/cases/${item.id}`}
                                className="text-xs font-semibold text-[#2b1a10] hover:text-black hover:underline"
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                className="rounded p-1 text-[#8a7f72] transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                                aria-label="Move to recycle bin"
                                onClick={() => setPendingCase(item)}
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

            {/* ── Seamless Pagination Footer ── */}
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
      </div>

      {decision && <CaseConfirmDialog open title={`${decision.value === "accepted" ? "Accept" : "Reject"} ${decision.rows.length === 1 ? decision.rows[0].displayName : decision.rows.length + " cases"}?`}
        description={`Unreviewed issues in these cases will also be ${decision.value}. Previously reviewed issues keep their decision.`}
        footnote="Case decisions are final." confirmLabel={decision.value === "accepted" ? "Accept" : "Reject"}
        variant={decision.value === "accepted" ? "default" : "danger"} loading={deciding}
        onOpenChange={open => { if (!open && !deciding) setDecision(null); }} onConfirm={confirmDecision} />}
      <Dialog open={Boolean(preview)} onOpenChange={open => {
        if (!open) { setPreview(null); caseListCache.clear(); setListRevision(value => value + 1); }
      }}>
        {preview && <DialogContent placement="right" aria-describedby={undefined} className="max-w-4xl gap-0 p-0">
          <DialogTitle className="border-b px-5 py-4 pr-16 text-base">Voucher for {getCaseTitle(preview)}</DialogTitle>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f4ef]">
            <VoucherPanel key={preview.id} caseId={preview.id} quickView />
          </div>
        </DialogContent>}
      </Dialog>
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
            ? `"${pendingCase.displayName}" will be moved to the recycle bin.`
            : ""
        }
        confirmLabel="Move to recycle bin"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  );
}
