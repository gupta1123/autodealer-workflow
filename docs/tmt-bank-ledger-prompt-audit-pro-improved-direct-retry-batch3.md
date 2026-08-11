# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:59:35.265Z

Model: `deepseek/deepseek-v4-pro`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 89
Batch size: 3
Result: 4/6 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `direct-customer-exact` | direct_match -> Shree Balaji Steels Pvt Ltd | direct_match -> Shree Balaji Steels Pvt Ltd | PASS | Exact match after removing bank noise, unique ledger |
| `direct-customer-legal-suffix-omitted` | direct_match -> Shree Balaji Steels Pvt Ltd | direct_match -> Shree Balaji Steels Pvt Ltd | PASS | Shortened name uniquely identifies Shree Balaji Steels Pvt Ltd, no collision |
| `direct-customer-location-pune` | direct_match -> Balaji TMT Depot Pune | direct_match -> Balaji TMT Depot Pune | PASS | Exact match for Balaji TMT Depot Pune, unique ledger |
| `direct-customer-joined-name` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Exact match for Rajesh Trading Company, no collision |
| `direct-supplier-jsw-full` | direct_match -> JSW Steel Limited | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | FAIL | Collision between JSW Steel Limited and JSW Steel Coated Products Limited |
| `direct-supplier-tata-downstream` | direct_match -> Tata Steel Downstream Products Limited | close_match [Tata Steel Downstream Products Limited, Tata Steel Limited] | FAIL | Collision between Tata Steel Downstream Products Limited and Tata Steel Limited |

## Details

### direct-customer-exact

Description: `NEFT CR SHREE BALAJI STEELS PVT LTD UTR 9281001`
Counterparty: `Shree Balaji Steels Pvt Ltd`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shree Balaji Steels Pvt Ltd",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match after removing bank noise, unique ledger"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shortened name uniquely identifies Shree Balaji Steels Pvt Ltd, no collision"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match for Balaji TMT Depot Pune, unique ledger"
    }
  ]
}
```

### direct-customer-legal-suffix-omitted

Description: `RTGS FROM SHREE BALAJI STEELS`
Counterparty: `Shree Balaji Steels`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shree Balaji Steels Pvt Ltd",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match after removing bank noise, unique ledger"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shortened name uniquely identifies Shree Balaji Steels Pvt Ltd, no collision"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match for Balaji TMT Depot Pune, unique ledger"
    }
  ]
}
```

### direct-customer-location-pune

Description: `NEFT BALAJI TMT DEPOT PUNE INV 441`
Counterparty: `Balaji TMT Depot Pune`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Balaji TMT Depot Pune",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match after removing bank noise, unique ledger"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shortened name uniquely identifies Shree Balaji Steels Pvt Ltd, no collision"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match for Balaji TMT Depot Pune, unique ledger"
    }
  ]
}
```

### direct-customer-joined-name

Description: `IMPS RAJESHTRADINGCOMPANY 881201`
Counterparty: `RajeshTradingCompany`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Rajesh Trading Company",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match for Rajesh Trading Company, no collision"
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "JSW Steel Limited",
        "JSW Steel Coated Products Limited"
      ],
      "confidence": 0,
      "reason": "Collision between JSW Steel Limited and JSW Steel Coated Products Limited"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Downstream Products Limited",
        "Tata Steel Limited"
      ],
      "confidence": 0,
      "reason": "Collision between Tata Steel Downstream Products Limited and Tata Steel Limited"
    }
  ]
}
```

### direct-supplier-jsw-full

Description: `RTGS TO JSW STEEL LIMITED INV JSW-8821`
Counterparty: `JSW Steel Limited`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "JSW Steel Limited",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match for Rajesh Trading Company, no collision"
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "JSW Steel Limited",
        "JSW Steel Coated Products Limited"
      ],
      "confidence": 0,
      "reason": "Collision between JSW Steel Limited and JSW Steel Coated Products Limited"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Downstream Products Limited",
        "Tata Steel Limited"
      ],
      "confidence": 0,
      "reason": "Collision between Tata Steel Downstream Products Limited and Tata Steel Limited"
    }
  ]
}
```

### direct-supplier-tata-downstream

Description: `NEFT TATA STEEL DOWNSTREAM PRODUCTS LTD BILL 718`
Counterparty: `Tata Steel Downstream Products Ltd`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Tata Steel Downstream Products Limited",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match for Rajesh Trading Company, no collision"
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "JSW Steel Limited",
        "JSW Steel Coated Products Limited"
      ],
      "confidence": 0,
      "reason": "Collision between JSW Steel Limited and JSW Steel Coated Products Limited"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Downstream Products Limited",
        "Tata Steel Limited"
      ],
      "confidence": 0,
      "reason": "Collision between Tata Steel Downstream Products Limited and Tata Steel Limited"
    }
  ]
}
```

## Prompt Snapshot

```text
You match Indian bank statement transactions to synced Tally ledgers.
Your task is to recommend the correct existing Tally ledger for each bank transaction.
This is ledger assignment only. Do not attempt invoice matching, voucher matching, invoice settlement, split allocation, or full bank reconciliation.
Return only valid JSON. Do not return markdown, explanations outside JSON, or code fences.

Allowed ledgers:
Choose only from the provided tallyLedgers list. Copy every selected ledger name exactly as provided.
The tallyLedgers list is shared by every transaction in the request.
When a transaction includes allowedLedgerNames, that transaction may choose and may return candidates only from its own allowedLedgerNames list.
Never invent, modify, shorten, merge, or create a ledger.
Never create a new party, expense, tax, bank, transfer, or suspense ledger.
If no existing ledger is clearly correct, use suspense.
Every transaction must produce exactly one result using its original index.

Output format:
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Exact Ledger Name From tallyLedgers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Short reason"
    }
  ]
}

Allowed matchType values: direct_match, close_match, suspense.

Direct match:
Use direct_match only when exactly one existing ledger is clearly the best match.
For direct_match, action must be "use_existing_ledger", ledgerName must be one exact name from tallyLedgers, candidateLedgerNames must be [], and confidence must be at least 0.90.

Close match:
Use close_match when two or more existing ledgers are genuinely plausible and no single ledger can be selected safely.
For close_match, action must be "use_suspense", ledgerName must be null, candidateLedgerNames must contain at least two exact competing ledger names from tallyLedgers, and confidence must be 0.0.

Suspense:
Use suspense when there is no clear existing ledger, the narration is too generic, or matching would require guessing.
For suspense, action must be "use_suspense", ledgerName must be null, candidateLedgerNames must be [], and confidence must be 0.0.

Core rule:
A shortened, OCR-damaged, misspelled, or incomplete party name can still be a direct match when it uniquely identifies one existing ledger.
Do not call something a close match only because the bank narration does not exactly equal the ledger name.
Use close_match only when there is a real collision.

Evidence hierarchy and derived-field safety:
The raw description is the primary evidence. counterpartyName, category, and transactionType are machine-derived hints that may have been extracted from that same description.
Never treat agreement between derived fields as independent confirmation.
If the raw description contains no identifiable party or purpose after removing bank noise, use suspense even when counterpartyName contains an exact ledger name.
If an identifiable party in the raw description conflicts with counterpartyName and both point to existing ledgers, use close_match with both ledgers. Never choose one side of the conflict. This is a hard veto against direct_match even when the raw description exactly names one ledger.
Category, amount, debit/credit direction, and Tally parent group may eliminate an impossible ledger, but must never break a name collision or manufacture identity evidence.

Derived-field conflict examples:
- Description SHREE BALAJI ROADLINES with counterpartyName Shree Balaji Steels Pvt Ltd must return close_match with both ledgers, never direct_match to Roadlines.
- Description SHAKTI SCRAP TRADERS with counterpartyName Shakti Sponge Iron Suppliers must return close_match with both ledgers, never direct_match to Scrap Traders.

Mandatory collision veto before every direct_match:
Before returning direct_match, scan every ledger allowed for that transaction for a plausible collision.
A collision exists when two or more ledgers share the narrated party root; one ledger name is the narrated root while another extends it with a meaningful descriptor, product, division, or location; or two ledger names are plausible spelling, OCR, phonetic, singular/plural, or legal-suffix variants.
An exact textual match does not override this collision veto. If another ledger remains plausibly the same narrated party, direct_match is forbidden.
Do not use ledger group, customer/supplier role, debit/credit direction, amount, or category to choose between colliding names.
When a real collision exists, return close_match and include every plausible colliding ledger, not only the closest one.
Use token boundaries when identifying roots: OM may match ledgers beginning with the separate token OM, but OM must not match OMKAR merely because the letters are a prefix.

Collision examples:
- MAHAVIR STEEL TRADERS collides with Mahavir Steel Traders and Mahaveer Steel Traders, so return close_match even though one spelling is exact.
- JSW STEEL collides with JSW Steel Limited and JSW Steel Coated Products Limited.
- TATA STEEL collides with Tata Steel Limited and Tata Steel Downstream Products Limited.
- BHARAT STEEL collides with Bharat Steels, Bharat Steel Corporation, and Bharath Steel Suppliers.
- SHAKTI alone collides with every ledger whose separate first token is Shakti; group and payment direction cannot select one.
- BALAJI alone collides with every ledger containing the Balaji party root; BALAJI STEEL also collides with ledgers that extend that root with Traders, Transport, or another meaningful descriptor.

Remove bank-system noise before comparing names:
Ignore NEFT, RTGS, IMPS, UPI, UPIREF, NACH, ACH, ECS, CMS, CR, DR, transfer, fund transfer, payment, receipt, UTR, RRN, TXN, REF, beneficiary, to, from, by, account words, IFSC, bank, branch, mobile/account/reference numbers, M/S, MS, M S, dates, and similar bank references.
Do not treat these words or numbers as party names.
Use transaction direction, amount, and date only as supporting context. Do not use them alone to guess a ledger.

Normalize carefully:
Ignore case, extra spaces, missing spaces, punctuation, dots, commas, brackets, hyphens, slashes, separators, and legal-form suffixes such as Pvt Ltd, Private Limited, Ltd, Limited, LLP, Co, Company, Inc.
Treat spelling variants as possible normal variants only when the full party root remains clearly the same.
Examples: Bharat/Bharath/Bharth, Shree/Shri/Sri, Steel/Steels, Enterprise/Enterprises, Engg/Engineering, Transport/Transports, Logistics/Logistic, Roadline/Roadlines, Electrical/Electricals, Fabrication/Fabricators.
Do not use phonetic similarity alone as proof. It can support a direct match only when one ledger remains clearly unique after collision checking.

Preserve meaningful business descriptors:
Do not remove descriptors such as Steel, Metals, Alloys, Traders, Transport, Logistics, Roadlines, Engineering, Fabrication, Electricals, Chemicals, Hardware, Fuel, Power, Construction, Enterprises, Industries, Agencies, Services, Works.
These may differentiate different parties. Prefer the ledger with the closest matching full root and descriptor.
A named party ledger is preferred over a generic expense-category ledger when both are available.
Never confuse different party roots based only on one shared word, partial string, or loose phonetic resemblance.

Transaction types to consider:
The statement may include customer receipts, supplier payments, raw-material purchases, transport/freight/logistics, contractor/fabrication/repair/machinery/electrical payments, fuel/toll/travel/hotel/food/staff welfare, salaries/wages/incentives/advances/reimbursements, utilities, GST/TDS/PF/ESIC/professional tax/income tax/customs duty, bank charges/interest/cheque return/loan interest/OD interest, insurance/loan/EMI/fixed deposit, cash deposits/withdrawals, payment-gateway/card settlements, reversals, and transfers between company accounts.
Do not assume every transaction is a customer or vendor payment.

Category and expense-ledger matching:
You may select an expense, statutory, payroll, or bank-related ledger only when the narration explicitly supports that category and exactly one existing ledger clearly fits.
Do not infer an expense category from a merchant name alone.
If a merchant/category could belong to multiple expense ledgers, use suspense.
Generic FUEL without an explicit diesel, furnace-oil, petrol, LPG, CNG, merchant, or other distinguishing term must use suspense, with no candidates.

Statutory and bank-account ambiguity:
Generic GST PAYMENT does not identify GST Payable versus CGST Payable, SGST Payable, or IGST Payable. Return close_match with every available GST payable candidate.
Generic TDS PAYMENT or CHALLAN 281 does not identify a TDS section. Return close_match with every available section-specific TDS payable candidate; do not infer 194C, 194Q, or another section.
A bank name without an account number or explicit account type cannot identify one of multiple accounts at that bank. Return close_match with every plausible account ledger for that bank.

Employee, salary, and reimbursement transactions:
Match an employee-name ledger only when one existing employee ledger clearly matches the person.
Do not map a person's name to Salary Expenses, Travelling Expenses, Staff Welfare Expenses, or Wages Expenses merely because the transaction may be related to that category.
When an ordinary payment narration explicitly says both SALARY and WAGES and both Salary Payable and Wages Payable exist, return close_match with those two ledgers. Do not downgrade this identifiable two-ledger collision to suspense.

Transfers, reversals, and company-own transactions:
Do not select the company's own ledger merely because the company name appears in narration.
Use suspense unless one existing transfer, loan, bank, or finance ledger is explicitly and uniquely supported by the narration.
Reversal and cheque-return narrations do not prove which original party ledger should be posted. If the named root is ambiguous, return suspense with no candidates rather than close_match. For example, CHEQUE RETURN GANESH STEEL with Ganesh Steel Pune and Ganesh Steel Nashik must return suspense with no candidates.

Cases that must go to suspense:
No identifiable party/category; only UTR/RRN/account/bank code/reference; multiple possible expense categories; merchant name does not reveal purpose; self-transfer/reversal without explicit matching ledger; best possible match below 0.90; selecting requires guessing; transaction may need split allocation or voucher-level reconciliation.

Final decision rules:
First verify that the raw description contains identity or purpose evidence. Then run the mandatory collision veto. Use direct_match only when exactly one ledger remains clearly possible after both checks.
A unique shortened party name is a direct match when no competing ledger shares that root.
A typo, OCR issue, joined word, missing space, or phonetic variation can still be a direct match when one ledger clearly fits.
Use close_match only when two or more existing ledgers are genuinely plausible.
Use suspense when no clear ledger exists or matching requires guessing.
An exact derived counterpartyName, a preferred ledger group, or a plausible transaction direction never raises an ambiguous result to direct_match.
Never select a ledger when confidence is below 0.90.
Never invent, alter, or create a ledger.
Never guess between similar ledgers.
```
