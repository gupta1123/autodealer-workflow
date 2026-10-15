'use client';
// The Collections page reads its lists a page at a time, from wherever the
// dashboard is: held on the connector (a paged scan from Kalika Local Agent
// 1.2.25 and later), or received whole (older connectors, read-only views).
// Both answer with the same shared rules (@autodealer/shared collections-query),
// so the page has one way of working.
import { useEffect, useRef, useState } from 'react';
import {
  collectionRowsById,
  collectionRowsByInvoice,
  dashboardRevision,
  queryCollections,
  summarizeCollections,
  type CollectionsQuery,
  type CollectionsView,
} from '@autodealer/shared/lib/collections-query';

export type CollectionsSummary = ReturnType<typeof summarizeCollections>;

/** What a dashboard needs to be paged: the connector's shell or a whole dashboard. */
export type PageableDashboard = {
  paged?: boolean;
  dashboardId?: string;
  summary?: CollectionsSummary;
  kpis?: Record<string, unknown>;
  tabs?: { paymentFollowUps?: unknown[]; debitNoteQueue?: unknown[] };
};

export type ListPage<T> = {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  rows: T[];
  selectableIds?: string[];
  paymentType?: string;
};

/** Asks the connector (through the live channel) for part of a held dashboard. */
export type CollectionsRemote = (operation: 'collections_query' | 'collections_rows', payload: Record<string, unknown>) => Promise<unknown>;

const isHeld = (dashboard: PageableDashboard | null | undefined): dashboard is PageableDashboard & { dashboardId: string } =>
  Boolean(dashboard?.paged && dashboard.dashboardId);

// Whole dashboards are summarised once each.
const summaries = new WeakMap<object, CollectionsSummary>();

export function collectionsSummary(dashboard: PageableDashboard | null | undefined): CollectionsSummary | null {
  if (!dashboard) return null;
  if (dashboard.paged) return dashboard.summary ?? null;
  let summary = summaries.get(dashboard);
  if (!summary) { summary = summarizeCollections(dashboard as never); summaries.set(dashboard, summary); }
  return summary;
}

/** Changes whenever what the lists show changes; replaces comparing every row. */
export function collectionsRevision(dashboard: PageableDashboard | null | undefined) {
  if (!dashboard) return '';
  return dashboard.paged ? String(dashboard.summary?.revision ?? '') : dashboardRevision(dashboard as never);
}

export async function fetchCollectionsPage<T>(dashboard: PageableDashboard, query: CollectionsQuery, remote: CollectionsRemote): Promise<ListPage<T>> {
  if (isHeld(dashboard)) {
    const page = await remote('collections_query', { dashboardId: dashboard.dashboardId, query }) as ListPage<T>;
    if (query.paymentType && query.paymentType !== 'all' && page.paymentType !== query.paymentType) {
      throw new Error('Update the Kalika connector to 1.2.35 or later, then refresh to filter by payment type.');
    }
    if (query.view !== 'followUps') return page;
    // Existing installed connectors omit terms from their compact page rows.
    // Read only this page's missing details from the already-held dashboard.
    const rows = page.rows as Array<T & { id: string; paymentCategory?: string | null; narration?: string | null }>;
    const missing = rows.filter(row => !('paymentCategory' in row) || !('narration' in row));
    if (!missing.length) return page;
    const details = await fetchCollectionsRows<{ id: string; paymentCategory?: string | null; narration?: string | null }>(dashboard, 'followUps', missing.map(row => row.id), remote);
    const byId = new Map(details.map(row => [row.id, row]));
    return { ...page, rows: rows.map(row => {
      if (!missing.includes(row)) return row;
      const detail = byId.get(row.id);
      if (!detail) throw new Error('Payment terms could not be loaded. Refresh to continue.');
      return { ...row, paymentCategory: detail.paymentCategory ?? null, narration: detail.narration ?? null };
    }) };
  }
  return queryCollections(dashboard as never, query) as unknown as ListPage<T>;
}

export async function fetchCollectionsRows<T>(dashboard: PageableDashboard, view: CollectionsView, ids: string[], remote: CollectionsRemote): Promise<T[]> {
  if (!ids.length) return [];
  if (isHeld(dashboard)) return ((await remote('collections_rows', { dashboardId: dashboard.dashboardId, view, ids })) as { rows: T[] }).rows;
  return collectionRowsById(dashboard as never, view, ids) as unknown as T[];
}

export async function fetchCollectionsRowsByInvoice<T>(dashboard: PageableDashboard, view: CollectionsView, invoiceKeys: string[], remote: CollectionsRemote): Promise<T[]> {
  if (!invoiceKeys.length) return [];
  if (isHeld(dashboard)) return ((await remote('collections_rows', { dashboardId: dashboard.dashboardId, view, invoiceKeys })) as { rows: T[] }).rows;
  return collectionRowsByInvoice(dashboard as never, view, invoiceKeys) as unknown as T[];
}

/** A held dashboard was replaced or its access expired: the page should re-check. */
export function isExpiredCollectionsError(error: unknown) {
  return /replaced by a newer check|have expired|Refresh to continue/i.test(error instanceof Error ? error.message : String(error ?? ''));
}

/**
 * One page of one list. Keeps showing the previous page while the next one
 * loads (no flicker), waits briefly while search text is being typed, and
 * ignores answers that arrive after a newer request.
 */
export function useCollectionsList<T>(
  dashboard: PageableDashboard | null,
  query: CollectionsQuery | null,
  remote: CollectionsRemote,
  onExpired: () => void,
) {
  const [state, setState] = useState<{ page: ListPage<T> | null; loading: boolean; error: string | null }>({ page: null, loading: false, error: null });
  const latest = useRef(0);
  const source = dashboard ? (isHeld(dashboard) ? dashboard.dashboardId : dashboard) : null;
  const queryKey = query ? JSON.stringify(query) : '';
  const searchKey = query?.search ?? '';
  const previousSearch = useRef(searchKey);
  const remoteRef = useRef(remote);
  const expiredRef = useRef(onExpired);
  remoteRef.current = remote;
  expiredRef.current = onExpired;

  useEffect(() => {
    if (!dashboard || !query) { setState({ page: null, loading: false, error: null }); return; }
    const request = ++latest.current;
    const typing = previousSearch.current !== searchKey;
    previousSearch.current = searchKey;
    setState((current) => ({ ...current, loading: true, error: null }));
    const timer = window.setTimeout(() => {
      fetchCollectionsPage<T>(dashboard, query, remoteRef.current).then(
        (page) => { if (request === latest.current) setState({ page, loading: false, error: null }); },
        (error) => {
          if (request !== latest.current) return;
          if (isExpiredCollectionsError(error)) expiredRef.current();
          setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Could not load this list.' }));
        },
      );
    }, typing && isHeld(dashboard) ? 250 : 0);
    return () => window.clearTimeout(timer);
    // The source identity and the query (as a key) decide when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, queryKey]);

  return state;
}
