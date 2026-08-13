function pageText(page) {
  return String(typeof page === "string" ? page : page?.text || "");
}

export function shouldAttemptBankStatementSingleShot({
  isPdf,
  pageCount,
  pages = [],
  maxPages,
  maxInputChars = 36_000,
  maxLikelyRows = 70,
}) {
  if (!isPdf) return true;
  if (!Number.isFinite(pageCount) || pageCount <= 0 || pageCount > maxPages) return false;

  const text = pages.map(pageText).join("\n");
  if (text.length > maxInputChars) return false;

  const likelyRows = text
    .split(/\r?\n/)
    .filter((line) => {
      const hasDate = /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/.test(line);
      const hasAmount = /(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}\b/.test(line);
      return hasDate && hasAmount;
    }).length;

  return likelyRows <= maxLikelyRows;
}

export function classifyBankStatementBatchOutcome({ rowCount, likelyHasRows }) {
  if (rowCount > 0) return { status: "succeeded", requiresRecovery: false };
  if (likelyHasRows) return { status: "empty_transaction_page", requiresRecovery: true };
  return { status: "empty_non_transaction", requiresRecovery: false };
}

export function addBankStatementPageProvenance(transactions, {
  startPage,
  endPage,
  method,
}) {
  return transactions.map((transaction, sourceIndex) => ({
    ...transaction,
    raw_payload: {
      ...(transaction.raw_payload ?? {}),
      extractionProvenance: {
        startPage,
        endPage,
        sourceIndex,
        method,
      },
    },
  }));
}

function provenance(transaction) {
  const value = transaction?.raw_payload?.extractionProvenance;
  return value && typeof value === "object" ? value : {};
}

export function sortBankStatementTransactionsByProvenance(transactions) {
  return transactions
    .map((transaction, mergeIndex) => ({ transaction, mergeIndex }))
    .sort((left, right) => {
      const leftProvenance = provenance(left.transaction);
      const rightProvenance = provenance(right.transaction);
      return (
        Number(leftProvenance.startPage ?? Number.MAX_SAFE_INTEGER) -
          Number(rightProvenance.startPage ?? Number.MAX_SAFE_INTEGER) ||
        Number(leftProvenance.sourceIndex ?? Number.MAX_SAFE_INTEGER) -
          Number(rightProvenance.sourceIndex ?? Number.MAX_SAFE_INTEGER) ||
        left.mergeIndex - right.mergeIndex
      );
    })
    .map(({ transaction }) => transaction);
}

export function unresolvedBankStatementRecoveryPages(diagnostics, expectedPages = []) {
  const unresolved = new Set(
    expectedPages
      .map(Number)
      .filter((page) => Number.isFinite(page) && page > 0)
  );
  for (const entry of diagnostics) {
    const page = Number(entry?.page);
    if (!Number.isFinite(page) || page <= 0) continue;
    if (entry?.status === "succeeded" || entry?.status === "confirmed_non_transaction") {
      unresolved.delete(page);
    } else if (entry?.status === "failed" || entry?.status === "empty") {
      unresolved.add(page);
    }
  }
  return [...unresolved].sort((left, right) => left - right);
}
