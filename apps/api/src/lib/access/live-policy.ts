/** A socket login is not permission to perform every operation on that socket. */
export const LIVE_OPERATION_PERMISSIONS:Readonly<Record<string,readonly string[]>> = {
  company_check:['connections.manage','purchases.view','bank.view','discounts.view','followups.view'],
  bank_ledgers:['bank.prepare'],
  ledger_masters:['bank.prepare','purchases.prepare'],
  ledger_suggestions:['bank.prepare','purchases.prepare','discounts.prepare','followups.prepare'],
  verify_bank_transaction:['bank.prepare'],
  fetch_customer_open_bills:['bank.prepare','discounts.prepare','followups.prepare'],
  scan:['discounts.prepare'],
  followups_scan:['followups.prepare'],
  create_debit_note:['discounts.post'],
};
