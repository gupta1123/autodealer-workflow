# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:02:22.620Z

Model: `deepseek/deepseek-v4-flash`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 1089
Batch size: 25
Result: 23/26 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `stress-generated-0001` | direct_match -> TMT Load Test Party 0001 | direct_match -> TMT Load Test Party 0001 | PASS | Exact match with counterparty name and credit transaction aligns with Sundry Debtors group. |
| `stress-generated-0002` | direct_match -> TMT Load Test Party 0002 | direct_match -> TMT Load Test Party 0002 | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Creditors group. |
| `stress-generated-0010` | direct_match -> TMT Load Test Party 0010 | direct_match -> TMT Load Test Party 0010 | PASS | Exact match with counterparty name and credit transaction aligns with Sundry Creditors group. |
| `stress-generated-0099` | direct_match -> TMT Load Test Party 0099 | direct_match -> TMT Load Test Party 0099 | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Debtors group. |
| `stress-generated-0100` | direct_match -> TMT Load Test Party 0100 | direct_match -> TMT Load Test Party 0100 | PASS | Exact match with counterparty name and credit transaction aligns with Sundry Creditors group. |
| `stress-generated-0250` | direct_match -> TMT Load Test Party 0250 | direct_match -> TMT Load Test Party 0250 | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Creditors group. |
| `stress-generated-0500` | direct_match -> TMT Load Test Party 0500 | direct_match -> TMT Load Test Party 0500 | PASS | Exact match with counterparty name and credit transaction aligns with Sundry Creditors group. |
| `stress-generated-0750` | direct_match -> TMT Load Test Party 0750 | direct_match -> TMT Load Test Party 0750 | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Creditors group. |
| `stress-generated-0999` | direct_match -> TMT Load Test Party 0999 | direct_match -> TMT Load Test Party 0999 | PASS | Exact match with counterparty name and credit transaction aligns with Sundry Debtors group. |
| `stress-generated-1000` | direct_match -> TMT Load Test Party 1000 | direct_match -> TMT Load Test Party 1000 | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Creditors group. |
| `stress-core-customer` | direct_match -> Shree Balaji Steels Pvt Ltd | direct_match -> Shree Balaji Steels Pvt Ltd | PASS | Exact match with counterparty name and credit transaction aligns with Sundry Debtors group. |
| `stress-core-supplier` | direct_match -> JSW Steel Limited | direct_match -> JSW Steel Limited | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Creditors group. |
| `stress-core-transporter` | direct_match -> Shree Balaji Roadlines | direct_match -> Shree Balaji Roadlines | PASS | Exact match with counterparty name and debit transaction aligns with Sundry Creditors group. |
| `stress-core-statutory` | direct_match -> TDS Payable 194Q | direct_match -> TDS Payable 194Q | PASS | Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger. |
| `stress-core-bank-account` | direct_match -> Axis Bank WCDL A/c 92108044607205 | direct_match -> Axis Bank WCDL A/c 92108044607205 | PASS | Narration matches the exact account number in the Axis Bank WCDL ledger. |
| `stress-suspense-ref-1` | suspense | suspense | PASS | No identifiable party or category; only a reference number. |
| `stress-suspense-ref-2` | suspense | suspense | PASS | No identifiable party or category; only a reference number. |
| `stress-suspense-ref-3` | suspense | suspense | PASS | No identifiable party or category; only a reference number and IFSC code. |
| `stress-suspense-ref-4` | suspense | suspense | PASS | No identifiable party or category; only a partial account number. |
| `stress-suspense-ref-5` | suspense | suspense | PASS | No identifiable party or category; only a UTR number. |
| `stress-close-ganesh` | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | PASS | Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location. |
| `stress-close-jsw` | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | direct_match -> JSW Steel Limited | FAIL | Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors. |
| `stress-close-hdfc` | close_match [HDFC Bank Current Account 1234, HDFC Bank OD Account 7788] | suspense | FAIL | Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear. |
| `stress-close-tds` | close_match [TDS Payable 194C, TDS Payable 194Q] | suspense | FAIL | Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q). |
| `stress-close-manibhadra` | close_match [Manibhadra Steel Cement Co, Manibhaddar Steel And Cement Company] | close_match [Manibhadra Steel Cement Co, Manibhaddar Steel And Cement Company] | PASS | Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which. |
| `stress-boundary-row-26` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Exact match with ledger name |

## Details

### stress-generated-0001

Description: `NEFT TMT LOAD TEST PARTY 0001`
Counterparty: `TMT Load Test Party 0001`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0001",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0002

Description: `RTGS TMT LOAD TEST PARTY 0002`
Counterparty: `TMT Load Test Party 0002`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0002",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0010

Description: `IMPS TMT LOAD TEST PARTY 0010`
Counterparty: `TMT Load Test Party 0010`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0010",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0099

Description: `NEFT TMT LOAD TEST PARTY 0099`
Counterparty: `TMT Load Test Party 0099`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0099",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0100

Description: `RTGS TMT LOAD TEST PARTY 0100`
Counterparty: `TMT Load Test Party 0100`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0100",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0250

Description: `NEFT TMT LOAD TEST PARTY 0250`
Counterparty: `TMT Load Test Party 0250`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0250",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0500

Description: `RTGS TMT LOAD TEST PARTY 0500`
Counterparty: `TMT Load Test Party 0500`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0500",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0750

Description: `IMPS TMT LOAD TEST PARTY 0750`
Counterparty: `TMT Load Test Party 0750`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0750",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-0999

Description: `NEFT TMT LOAD TEST PARTY 0999`
Counterparty: `TMT Load Test Party 0999`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 0999",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-generated-1000

Description: `RTGS TMT LOAD TEST PARTY 1000`
Counterparty: `TMT Load Test Party 1000`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TMT Load Test Party 1000",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-core-customer

Description: `NEFT SHREE BALAJI STEELS PVT LTD`
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-core-supplier

Description: `RTGS JSW STEEL LIMITED`
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-core-transporter

Description: `NEFT SHREE BALAJI ROADLINES`
Counterparty: `Shree Balaji Roadlines`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shree Balaji Roadlines",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-core-statutory

Description: `OLTAS TDS SECTION 194Q`
Counterparty: ``

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "TDS Payable 194Q",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-core-bank-account

Description: `TRANSFER AXIS WCDL 92108044607205`
Counterparty: `Axis WCDL 92108044607205`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Axis Bank WCDL A/c 92108044607205",
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-suspense-ref-1

Description: `NEFT REF 81000001`
Counterparty: ``

Expected:

```json
{
  "matchType": "suspense",
  "ledgerName": null,
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-suspense-ref-2

Description: `UPI 81000002`
Counterparty: ``

Expected:

```json
{
  "matchType": "suspense",
  "ledgerName": null,
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-suspense-ref-3

Description: `IMPS REF 81000003 IFSC HDFC0001`
Counterparty: ``

Expected:

```json
{
  "matchType": "suspense",
  "ledgerName": null,
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-suspense-ref-4

Description: `TRANSFER A/C XX8104`
Counterparty: ``

Expected:

```json
{
  "matchType": "suspense",
  "ledgerName": null,
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-suspense-ref-5

Description: `NEFT UTR 81000005`
Counterparty: ``

Expected:

```json
{
  "matchType": "suspense",
  "ledgerName": null,
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-close-ganesh

Description: `NEFT GANESH STEEL`
Counterparty: `Ganesh Steel`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Ganesh Steel Pune",
    "Ganesh Steel Nashik"
  ]
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-close-jsw

Description: `RTGS JSW STEEL`
Counterparty: `JSW Steel`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "JSW Steel Limited",
    "JSW Steel Coated Products Limited"
  ]
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-close-hdfc

Description: `TRANSFER TO HDFC BANK`
Counterparty: `HDFC Bank`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "HDFC Bank Current Account 1234",
    "HDFC Bank OD Account 7788"
  ]
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-close-tds

Description: `OLTAS TDS PAYMENT`
Counterparty: ``

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "TDS Payable 194C",
    "TDS Payable 194Q"
  ]
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-close-manibhadra

Description: `NEFT MANIBHADRA STEEL CEMENT`
Counterparty: `Manibhadra Steel Cement`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Manibhadra Steel Cement Co",
    "Manibhaddar Steel And Cement Company"
  ]
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
      "ledgerName": "TMT Load Test Party 0001",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and credit transaction aligns with Sundry Debtors group."
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 12,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match with counterparty name and debit transaction aligns with Sundry Creditors group."
    },
    {
      "index": 13,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration explicitly states TDS Section 194Q, matching the TDS Payable 194Q ledger."
    },
    {
      "index": 14,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration matches the exact account number in the Axis Bank WCDL ledger."
    },
    {
      "index": 15,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 16,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number."
    },
    {
      "index": 17,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a reference number and IFSC code."
    },
    {
      "index": 18,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a partial account number."
    },
    {
      "index": 19,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No identifiable party or category; only a UTR number."
    },
    {
      "index": 20,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Ganesh Steel' matches two existing ledgers; cannot determine which location."
    },
    {
      "index": 21,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Counterparty name 'JSW Steel' is a clear shortened form of 'JSW Steel Limited', and the debit transaction aligns with Sundry Creditors."
    },
    {
      "index": 22,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank; multiple HDFC bank ledgers exist, and purpose is unclear."
    },
    {
      "index": 23,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration 'OLTAS TDS PAYMENT' is generic; multiple TDS ledgers exist (194C, 194Q)."
    },
    {
      "index": 24,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Counterparty name 'Manibhadra Steel Cement' matches two similar ledgers; cannot determine which."
    }
  ]
}
```

### stress-boundary-row-26

Description: `NEFT RAJESH TRADING COMPANY`
Counterparty: `Rajesh Trading Company`

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
      "confidence": 1,
      "reason": "Exact match with ledger name"
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

Employee, salary, and reimbursement transactions:
Match an employee-name ledger only when one existing employee ledger clearly matches the person.
Do not map a person's name to Salary Expenses, Travelling Expenses, Staff Welfare Expenses, or Wages Expenses merely because the transaction may be related to that category.
If narration says salary but both Salary Expenses and Wages Expenses are plausible, use close_match or suspense.

Transfers, reversals, and company-own transactions:
Do not select the company's own ledger merely because the company name appears in narration.
Use suspense unless one existing transfer, loan, bank, or finance ledger is explicitly and uniquely supported by the narration.

Cases that must go to suspense:
No identifiable party/category; only UTR/RRN/account/bank code/reference; multiple possible expense categories; merchant name does not reveal purpose; self-transfer/reversal without explicit matching ledger; best possible match below 0.90; selecting requires guessing; transaction may need split allocation or voucher-level reconciliation.

Final decision rules:
Use direct_match when exactly one ledger is clearly best.
A unique shortened party name is a direct match when no competing ledger shares that root.
A typo, OCR issue, joined word, missing space, or phonetic variation can still be a direct match when one ledger clearly fits.
Use close_match only when two or more existing ledgers are genuinely plausible.
Use suspense when no clear ledger exists or matching requires guessing.
Never select a ledger when confidence is below 0.90.
Never invent, alter, or create a ledger.
Never guess between similar ledgers.
```
