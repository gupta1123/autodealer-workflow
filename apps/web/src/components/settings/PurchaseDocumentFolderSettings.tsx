"use client";

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { runCashDiscountLiveRequest } from '@/lib/cash-discount-live';

export function PurchaseDocumentFolderSettings({ connectionId, companyName, companyGuid, financialYear }: {
  connectionId: string; companyName: string; companyGuid?: string | null; financialYear?: string | null;
}) {
  const [folderPath, setFolderPath] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [busy, setBusy] = useState('loading');
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setFolderPath(''); setSavedPath(''); setLoaded(false); setNotice(null); setBusy('loading');
    if (!connectionId || !companyName) { setBusy(''); return; }
    const query = new URLSearchParams({ connectionId, companyName });
    if (companyGuid) query.set('companyGuid', companyGuid);
    if (financialYear) query.set('financialYear', financialYear);
    void apiFetch(`/api/settings/purchase-document-folder?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load folder settings.');
        if (generation.current === current) { setFolderPath(data.folderPath || ''); setSavedPath(data.folderPath || ''); setLoaded(true); }
      }).catch(error => {
        if (!controller.signal.aborted && generation.current === current) setNotice({ error: true, text: error.message });
      }).finally(() => { if (generation.current === current) setBusy(''); });
    return () => { ++generation.current; controller.abort(); };
  }, [connectionId, companyName, companyGuid, financialYear]);

  // Saves when the field is left or Enter is pressed, like the other defaults on this page.
  async function save() {
    if (!loaded || busy || folderPath.trim() === savedPath.trim()) return;
    const current = generation.current;
    setBusy('save'); setNotice(null);
    try {
      const response = await apiFetch('/api/settings/purchase-document-folder', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, companyName, companyGuid, financialYear, folderPath }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save folder.');
      if (generation.current === current) {
        setFolderPath(data.folderPath || ''); setSavedPath(data.folderPath || '');
        setNotice({ error: false, text: data.folderPath ? 'Folder saved.' : 'Folder cleared; invoices stay on the connector PC.' });
      }
    } catch (error) {
      if (generation.current === current) setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not save folder.' });
    } finally { if (generation.current === current) setBusy(''); }
  }

  async function test() {
    const current = generation.current;
    setBusy('test'); setNotice(null);
    try {
      await runCashDiscountLiveRequest({ connectionId, companyName, companyGuid, financialYear,
        operation: 'test_purchase_document_folder', payload: { folderPath } });
      if (generation.current === current) setNotice({ error: false, text: 'The connector can read and write this folder. Tally users also need read access.' });
    } catch (error) {
      if (generation.current === current) setNotice({ error: true, text: error instanceof Error ? error.message : 'Folder test failed.' });
    } finally { if (generation.current === current) setBusy(''); }
  }

  return <div>
    <h3 className="text-sm font-bold text-[#111827]">Purchase invoice folder</h3>
    <p className="mt-0.5 text-xs text-[#8a7f72]">Invoice PDFs are copied here before posting so every Tally user can open them. Leave empty to keep them on the connector PC.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block flex-1 text-xs font-medium text-[#5b4b3d]">Shared folder path
        <input className="mt-1 h-10 w-full rounded-lg border border-[#ddd7cc] px-3" value={folderPath}
          placeholder={'\\\\AccountsServer\\Invoices\\Kalika'} disabled={busy === 'loading' || busy === 'save' || !loaded}
          onBlur={() => void save()}
          onKeyDown={event => { if (event.key === 'Enter') void save(); }}
          onChange={event => { setFolderPath(event.target.value); setNotice(null); }} />
      </label>
      <Button variant="outline" disabled={Boolean(busy) || !loaded || !folderPath.trim()} onClick={() => void test()}>
        {busy === 'test' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test folder access
      </Button>
    </div>
    {busy === 'loading' && <p className="mt-2 text-xs">Loading folder settings…</p>}
    {busy === 'save' && <p className="mt-2 text-xs">Saving…</p>}
    {notice && <p role="status" className={`mt-2 text-xs ${notice.error ? 'text-rose-700' : 'text-emerald-700'}`}>{notice.text}</p>}
  </div>;
}
