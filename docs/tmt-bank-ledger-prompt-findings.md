# TMT Bank Ledger Prompt Findings

Generated: 2026-08-04

Model: `deepseek/deepseek-v4-pro`

## Improved prompt result

After adding explicit collision vetoes, derived-field conflict handling, statutory and bank-account ambiguity rules, and reversal/return rules:

| Test | Passed | Total | Result |
|---|---:|---:|---:|
| Quality cases, consolidated across successful family runs and targeted retries | 79 | 79 | 100% |
| Stress cases with 1,089 ledgers | 26 | 26 | 100% |

The production batch size is now 3. Larger collision-heavy batches intermittently returned empty OpenRouter messages even when the output-token cap was increased, while three-row batches returned valid indexed JSON. API typecheck and the authenticated-route health check pass after restart.

Improved reports:

- `docs/tmt-bank-ledger-prompt-audit-pro-improved-direct.md`
- `docs/tmt-bank-ledger-prompt-audit-pro-improved-close.md`
- `docs/tmt-bank-ledger-prompt-audit-pro-improved-suspense.md`
- `docs/tmt-bank-ledger-prompt-audit-pro-improved-bias.md`
- `docs/tmt-bank-ledger-prompt-audit-pro-improved-retry.md`
- `docs/tmt-bank-ledger-prompt-audit-pro-improved-direct-retry-batch3.md`
- `docs/tmt-bank-ledger-prompt-audit-pro-improved-complete-vs-root.md`
- `docs/tmt-bank-ledger-stress-audit-pro-improved.md`

The sections below record the original, unchanged-prompt baseline and the issues that motivated the improvement.

## Test scope

- 89 realistic TMT-company ledgers across 13 Tally groups.
- 79 quality cases covering customers, raw-material suppliers, transporters, contractors, plant expenses, statutory payments, payroll, bank facilities, internal transfers, suspense, OCR collisions, and narration-field bias.
- 1,000 additional neutral distractor ledgers for stress testing.
- A full 25-transaction request plus a 26th batch-boundary transaction.

## Baseline quality result

The initial run had two empty provider responses. Those 24 rows were rerun unchanged in batches of six and are included below.

| Expected outcome | Passed | Total | Result |
|---|---:|---:|---:|
| Direct match | 35 | 35 | 100% |
| Close match | 14 | 29 | 48% |
| Suspense | 10 | 15 | 67% |
| Overall | 59 | 79 | 75% |

The cross-cutting narration and field-bias family passed 11 of 15 cases (73%).

Fourteen review-required cases were incorrectly promoted to `direct_match`. In this deliberately adversarial test pack, 35 direct matches were correct and 14 were unsafe, giving 71% direct-match precision.

## Stress result

| Ledgers | Transactions | Batch size | Passed | Index completeness |
|---:|---:|---:|---:|---:|
| 1,089 | 26 | 25 | 23/26 | 26/26 |

The large ledger list did not cause missing, duplicated, or cross-wired indexes. The three failures were policy failures already seen in the smaller test: JSW corporate-root ambiguity, a Manibhadra OCR collision, and generic TDS classification.

## Prompt issues identified

### 1. Exact-looking text overrides collision checking

The model directly selected `Mahavir Steel Traders`, `Sahyadri Steel Distributors`, and `Manibhadra Steel Cement Co` even though near-identical OCR or spelling variants were present.

Required prompt behavior: an exact lexical match must not automatically win when a near-duplicate ledger could plausibly be the intended party after OCR correction.

### 2. Short corporate roots are treated as the parent company

`JSW STEEL` and `TATA STEEL` were directly mapped to the shorter parent-name ledger while ledgers for coated or downstream products were present.

Required prompt behavior: a shortened corporate root must remain a close match whenever subsidiaries, divisions, or product-company variants share that root.

### 3. Transaction direction and ledger group are over-weighted

For `NEFT SHAKTI`, the model selected the debtor `Shakti TMT Dealers` because of its interpretation of debit/payment direction and ignored three creditor ledgers.

Required prompt behavior: direction and group are supporting evidence only. Supplier refunds, customer refunds, advances, and contra transactions make direction non-deterministic.

### 4. Generic statutory and bank transactions are guessed

- Generic GST was mapped to `GST Payable` despite CGST, SGST, and IGST ledgers.
- Generic TDS was mapped to `TDS Payable 194C` despite a 194Q ledger. Challan 281 does not identify the section.
- `TRANSFER TO HDFC BANK` was mapped to the current account despite an OD account and no account number.

Required prompt behavior: never infer a tax section, tax component, bank account, or facility without an explicit identifier.

### 5. Derived fields are treated as independent evidence

Reference-only narrations were directly mapped when `counterpartyName` contained a ledger name, even though that counterparty could only have been hallucinated or derived from the same weak source.

Required prompt behavior: `counterpartyName`, `category`, and `transactionType` may be derived from `description` and must not count as independent corroboration.

### 6. Conflicting narration and extracted fields are not escalated

When narration explicitly named Roadlines but `counterpartyName` named Steels, or narration named Scrap while `counterpartyName` named Sponge Iron, the model trusted narration and returned a direct match.

Required prompt behavior: for automatic posting safety, an explicit conflict between full narration and extracted counterparty must produce review, even when one field exactly matches a ledger.

### 7. Close-match candidate enumeration is inconsistent

- Broad `BALAJI` results omitted transporter ledgers because of direction/group bias.
- `BALAJI STEEL` omitted `Balaji Steel Transport Services`.
- Short `OM` included `Omkar` ledgers, making the candidate set too broad.

Required prompt behavior: define a party root boundary, enumerate all plausible variants, and do not exclude candidates solely by ledger group or direction.

### 8. Reversal and return taxonomy is inconsistent

Reversals, cheque returns, and generic fuel transactions returned `close_match` rather than `suspense`. These remain manual-review outcomes, so they are operationally safer than a wrong direct match, but they violate the current policy contract.

Required prompt behavior: explicitly force reversals, returns, split transactions, and generic categories to suspense when ledger assignment requires voucher-level context.

## Runtime findings

- Two 12-row baseline requests returned empty messages after all retries.
- Rerunning those rows unchanged in six-row batches recovered every response.
- A separate 25-row request with 1,089 ledgers succeeded on the first run.

This indicates intermittent provider/model reliability rather than a deterministic batch-size limit. Production must continue validating every expected index and falling back per missing row.

## Fixture files

- `scripts/fixtures/tmt-bank-ledgers.json`
- `scripts/fixtures/tmt-bank-ledger-audit-cases.json`
- `scripts/fixtures/tmt-bank-ledger-stress-cases.json`

## Reports

- `docs/tmt-bank-ledger-prompt-audit-report.md`
- `docs/tmt-bank-ledger-prompt-audit-retry-report.md`
- `docs/tmt-bank-ledger-stress-audit-report.md`
