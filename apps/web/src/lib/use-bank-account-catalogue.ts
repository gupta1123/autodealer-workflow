"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { runCashDiscountLiveRequest } from "./cash-discount-live";
import { bankAccountScopeKey, createBankAccountCatalogue,
  type BankAccountScope, type BankAccountResult, type BankAccountCatalogueState } from "./bank-account-catalogue";

export function useBankAccountCatalogue(scope: BankAccountScope, enabled: boolean) {
  const [state, setState] = useState<BankAccountCatalogueState>({ scopeKey: "", ledgers: [], loading: false, error: "" });
  const reader = useMemo(() => createBankAccountCatalogue((selected, signal) =>
    runCashDiscountLiveRequest<BankAccountResult>({ ...selected, companyNames: [selected.companyName],
      operation: "bank_ledgers", signal }), setState), []);
  const { connectionId, companyName, companyGuid, financialYear } = scope;
  const selected = useMemo(() => ({ connectionId, companyName, companyGuid, financialYear }),
    [connectionId, companyName, companyGuid, financialYear]);
  const key = bankAccountScopeKey(selected);
  useEffect(() => {
    if (enabled) void reader.load(selected).catch(() => {});
    return () => reader.cancel();
  }, [reader, selected, enabled]);
  const refresh = useCallback(() => {
    if (!enabled) return Promise.reject(new Error("Verify the selected Tally company before loading bank accounts."));
    return reader.load(selected, true);
  }, [reader, selected, enabled]);
  const current = enabled && state.scopeKey === key;
  return { ledgers: current ? state.ledgers : [], loading: enabled && (!current || state.loading),
    error: current ? state.error : "", refresh };
}
