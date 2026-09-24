import path from 'node:path';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export function validatePurchaseDocumentFolder(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a shared folder path.');
  const folder = value.trim().replace(/\\+$/, '');
  if (!folder) return '';
  if (folder.length > 500 || !/^\\\\[^\\]+\\[^\\]+/.test(folder) ||
      /^\\\\[?.]\\/.test(folder) || /[<>:"|?*\/\x00-\x1f]/.test(folder) ||
      folder.split('\\').some(part => /[. ]$/.test(part))) {
    throw new Error('Use a shared Windows folder such as \\\\AccountsServer\\Invoices\\Kalika.');
  }
  return path.win32.normalize(folder);
}

export function purchaseDocumentCompanyKey(companyId: string | undefined, connectionId: string, companyName: string) {
  return companyId || `legacy:${connectionId}:${companyName.trim().toLowerCase()}`;
}

export async function readPurchaseDocumentFolder(organizationId: string, companyKey: string) {
  const { data, error } = await createSupabaseAdminClient().from('purchase_document_folders')
    .select('folder_path').eq('organization_id', organizationId).eq('company_key', companyKey).maybeSingle();
  if (error) {
    // Without the migration no folder can have been saved, so posting keeps
    // using connector-local storage instead of blocking every purchase.
    if (['42P01', 'PGRST205'].includes(String(error.code || ''))) return '';
    throw new Error('Purchase document folder settings are unavailable. Try again.');
  }
  return validatePurchaseDocumentFolder(data?.folder_path || '');
}
