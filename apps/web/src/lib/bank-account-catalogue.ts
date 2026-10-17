export type BankAccountScope = {
  connectionId: string;
  companyName: string;
  companyGuid?: string | null;
  financialYear: string;
};

export type BankAccountLedger = {
  name: string;
  parent?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  closingBalance?: number | null;
  closingBalanceType?: "Dr" | "Cr" | null;
};

export type BankAccountResult = {
  companyName?: string | null;
  bankLedgers?: BankAccountLedger[];
  byCompany?: Record<string, BankAccountLedger[]>;
  errors?: Array<{ companyName?: string; error?: string }>;
};

export type BankAccountCatalogueState = {
  scopeKey: string;
  ledgers: BankAccountLedger[];
  loading: boolean;
  error: string;
};

export function bankAccountScopeKey(scope: BankAccountScope) {
  return JSON.stringify([scope.connectionId, scope.companyGuid || "", scope.companyName.trim().toLowerCase(), scope.financialYear]);
}

// This list is deliberately independent of transaction vector candidates.
// A result for an old PC/company/year must never select the new scope's bank.
export function createBankAccountCatalogue(
  read: (scope: BankAccountScope, signal: AbortSignal) => Promise<BankAccountResult>,
  publish: (state: BankAccountCatalogueState) => void
) {
  let generation = 0;
  let controller: AbortController | null = null;
  let scopeKey = "";
  let pending: Promise<BankAccountLedger[]> | null = null;
  let completed: BankAccountLedger[] | null = null;
  return {
    cancel() {
      generation++;
      controller?.abort();
      scopeKey = "";
      pending = null;
      completed = null;
    },
    load(scope: BankAccountScope, force = false): Promise<BankAccountLedger[]> {
      const key = bankAccountScopeKey(scope);
      if (!force && key === scopeKey && pending) return pending;
      if (!force && key === scopeKey && completed) return Promise.resolve(completed);
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      const attempt = ++generation;
      scopeKey = key;
      completed = null;
      publish({ scopeKey: key, ledgers: [], loading: true, error: "" });
      pending = (async () => {
        try {
          const result = await read(scope, abort.signal);
          abort.signal.throwIfAborted();
          if (attempt !== generation) throw new Error("The selected Tally company changed.");
          const companyName = String(result.companyName || scope.companyName).trim();
          if (companyName.toLowerCase() !== scope.companyName.trim().toLowerCase()) {
            throw new Error("Tally returned bank accounts for a different company. Refresh the connection.");
          }
          const rows = result.byCompany?.[companyName] ?? result.bankLedgers ?? [];
          const error = result.errors?.find(item => item.error)?.error;
          if (!rows.length && error) throw new Error(error);
          const byName = new Map<string, BankAccountLedger>();
          for (const ledger of rows) {
            const name = String(ledger.name || "").trim();
            if (name) byName.set(name.toLowerCase(), { ...ledger, name });
          }
          completed = [...byName.values()];
          publish({ scopeKey: key, ledgers: completed, loading: false, error: "" });
          return completed;
        } catch (error) {
          if (attempt === generation && !abort.signal.aborted) {
            publish({ scopeKey: key, ledgers: [], loading: false,
              error: error instanceof Error ? error.message : "Could not load bank accounts from Tally." });
          }
          throw error;
        } finally {
          if (attempt === generation) pending = null;
        }
      })();
      return pending;
    },
  };
}
