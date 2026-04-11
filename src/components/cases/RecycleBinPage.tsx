"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Trash,
} from "lucide-react";

import { CaseConfirmDialog } from "@/components/cases/CaseConfirmDialog";
import { AppShell } from "@/components/dashboard/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  });
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
        (item.buyerName ?? "").toLowerCase().includes(normalized)
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
      <div className="mx-auto max-w-[1500px] w-full px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700 ease-out text-slate-800">
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
          <div className="border-b border-slate-100 px-6 py-7 md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                  Recycle Bin
                </div>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                  Deleted cases
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
                  Review recycled cases, restore them to the active directory, or permanently
                  remove them.
                </p>
              </div>

              <Button asChild variant="outline" className="border-slate-200 text-slate-700">
                <Link href="/cases">Back to cases</Link>
              </Button>
            </div>
          </div>

          <div className="px-6 py-6 md:px-8">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search recycled cases..."
                className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm font-semibold">Loading recycle bin...</p>
            </div>
          )}

          {error && (
            <div className="mx-6 mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 md:mx-8">
              <div className="font-semibold">Recycle bin error</div>
              <div className="mt-1">{error}</div>
            </div>
          )}

          {status === "ready" && filteredCases.length === 0 && (
            <div className="px-6 pb-8 md:px-8">
              <Card className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 py-20 text-center shadow-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Trash className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Recycle bin is empty</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Deleted cases will appear here until they are restored or permanently deleted.
                </p>
              </Card>
            </div>
          )}

          {status === "ready" && filteredCases.length > 0 && (
            <div className="grid gap-4 px-6 pb-8 md:px-8">
              {filteredCases.map((item) => (
                <Card
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="truncate text-lg font-bold text-slate-900">
                          {item.displayName}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          {item.documentCount} docs
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                        <span>Buyer: {item.buyerName || "—"}</span>
                        <span>Deleted: {formatDateTime(item.deletedAt)}</span>
                        <span>Slug: {item.slug}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-200 text-slate-700 hover:bg-slate-50"
                        onClick={() => setPendingAction({ type: "restore", item })}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="shadow-sm"
                        onClick={() => setPendingAction({ type: "destroy", item })}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete forever
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

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
