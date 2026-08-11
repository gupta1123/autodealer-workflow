# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:49:33.819Z

Model: `deepseek/deepseek-v4-pro`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 89
Batch size: 6
Result: 9/15 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `bias-hallucinated-counterparty` | suspense | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `bias-conflict-roadlines-vs-steels` | close_match [Shree Balaji Roadlines, Shree Balaji Steels Pvt Ltd] | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `bias-wrong-category-bank-charge` | direct_match -> Om Engineering Works | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `bias-conflict-scrap-vs-sponge` | close_match [Shakti Scrap Traders, Shakti Sponge Iron Suppliers] | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `bias-wrong-category-transport` | direct_match -> Shree Balaji Steels Pvt Ltd | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `bias-bank-name-before-party` | direct_match -> Shree Balaji Steels Pvt Ltd | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `bias-invoice-reference-party-name` | direct_match -> Shree Balaji Roadlines | direct_match -> Shree Balaji Roadlines | PASS | Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger. |
| `bias-material-word-balaji` | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Shree Balaji Traders, Balaji TMT Depot Pune, Balaji TMT Depot Nashik, Shree Balaji Roadlines, Shree Balaji Transport, Balaji Steel Transport Services] | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Shree Balaji Traders, Balaji TMT Depot Pune, Balaji TMT Depot Nashik, Shree Balaji Roadlines, Shree Balaji Transport, Balaji Steel Transport Services] | PASS | Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root. |
| `bias-amount-small` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Exact match with existing ledger 'Rajesh Trading Company'. |
| `bias-amount-large` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Exact match with existing ledger 'Rajesh Trading Company'. |
| `bias-direction-credit` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Exact match with existing ledger 'Rajesh Trading Company'. |
| `bias-direction-debit` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Exact match with existing ledger 'Rajesh Trading Company'. |
| `bias-named-party-over-expense` | direct_match -> HPCL Industrial Fuel | direct_match -> HPCL Industrial Fuel | PASS | Exact match with HPCL Industrial Fuel ledger. |
| `bias-multiple-derived-fields-not-independent` | suspense | suspense | PASS | Raw description only contains bank reference, no party name. |
| `bias-conflict-transport-vs-roadlines` | close_match [Shree Balaji Transport, Shree Balaji Roadlines] | close_match [Shree Balaji Transport, Shree Balaji Roadlines] | PASS | Raw description says Shree Balaji Transport but derived counterpartyName says Shree Balaji Roadlines; collision between ledgers. |

## Details

### bias-hallucinated-counterparty

Description: `NEFT REF 928377001`
Counterparty: `Shree Balaji Steels Pvt Ltd`

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
  "error": "OpenRouter returned an empty message"
}
```

### bias-conflict-roadlines-vs-steels

Description: `NEFT TO SHREE BALAJI ROADLINES LR 811`
Counterparty: `Shree Balaji Steels Pvt Ltd`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Shree Balaji Roadlines",
    "Shree Balaji Steels Pvt Ltd"
  ]
}
```

Actual:

```json
{
  "error": "OpenRouter returned an empty message"
}
```

### bias-wrong-category-bank-charge

Description: `RTGS OM ENGINEERING WORKS ROLL REPAIR`
Counterparty: `Om Engineering Works`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Om Engineering Works",
  "candidateLedgerNames": []
}
```

Actual:

```json
{
  "error": "OpenRouter returned an empty message"
}
```

### bias-conflict-scrap-vs-sponge

Description: `RTGS SHAKTI SCRAP TRADERS`
Counterparty: `Shakti Sponge Iron Suppliers`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Shakti Scrap Traders",
    "Shakti Sponge Iron Suppliers"
  ]
}
```

Actual:

```json
{
  "error": "OpenRouter returned an empty message"
}
```

### bias-wrong-category-transport

Description: `NEFT CR SHREE BALAJI STEELS PVT LTD`
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
  "error": "OpenRouter returned an empty message"
}
```

### bias-bank-name-before-party

Description: `NEFT FROM HDFC BANK A/C 9281 SHREE BALAJI STEELS PVT LTD`
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
  "error": "OpenRouter returned an empty message"
}
```

### bias-invoice-reference-party-name

Description: `RTGS SHREE BALAJI ROADLINES INV JSW 8821`
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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders",
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik",
        "Shree Balaji Roadlines",
        "Shree Balaji Transport",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    }
  ]
}
```

### bias-material-word-balaji

Description: `MATERIAL PAYMENT TO BALAJI`
Counterparty: `Balaji`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Shree Balaji Steels Pvt Ltd",
    "Shree Balaji Steel Traders",
    "Shree Balaji Traders",
    "Balaji TMT Depot Pune",
    "Balaji TMT Depot Nashik",
    "Shree Balaji Roadlines",
    "Shree Balaji Transport",
    "Balaji Steel Transport Services"
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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders",
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik",
        "Shree Balaji Roadlines",
        "Shree Balaji Transport",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    }
  ]
}
```

### bias-amount-small

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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders",
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik",
        "Shree Balaji Roadlines",
        "Shree Balaji Transport",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    }
  ]
}
```

### bias-amount-large

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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders",
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik",
        "Shree Balaji Roadlines",
        "Shree Balaji Transport",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    }
  ]
}
```

### bias-direction-credit

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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders",
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik",
        "Shree Balaji Roadlines",
        "Shree Balaji Transport",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    }
  ]
}
```

### bias-direction-debit

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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains the exact party name 'Shree Balaji Roadlines', which uniquely matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders",
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik",
        "Shree Balaji Roadlines",
        "Shree Balaji Transport",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Description mentions only 'BALAJI' without distinguishing descriptor; multiple ledgers contain the Balaji party root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Exact match with existing ledger 'Rajesh Trading Company'."
    }
  ]
}
```

### bias-named-party-over-expense

Description: `NEFT HPCL INDUSTRIAL FUEL`
Counterparty: `HPCL Industrial Fuel`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "HPCL Industrial Fuel",
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
      "ledgerName": "HPCL Industrial Fuel",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match with HPCL Industrial Fuel ledger."
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Raw description only contains bank reference, no party name."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Transport",
        "Shree Balaji Roadlines"
      ],
      "confidence": 0,
      "reason": "Raw description says Shree Balaji Transport but derived counterpartyName says Shree Balaji Roadlines; collision between ledgers."
    }
  ]
}
```

### bias-multiple-derived-fields-not-independent

Description: `NEFT REF 8821001`
Counterparty: `Bharat Steels`

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
      "ledgerName": "HPCL Industrial Fuel",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match with HPCL Industrial Fuel ledger."
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Raw description only contains bank reference, no party name."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Transport",
        "Shree Balaji Roadlines"
      ],
      "confidence": 0,
      "reason": "Raw description says Shree Balaji Transport but derived counterpartyName says Shree Balaji Roadlines; collision between ledgers."
    }
  ]
}
```

### bias-conflict-transport-vs-roadlines

Description: `NEFT TO SHREE BALAJI TRANSPORT`
Counterparty: `Shree Balaji Roadlines`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Shree Balaji Transport",
    "Shree Balaji Roadlines"
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
      "ledgerName": "HPCL Industrial Fuel",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match with HPCL Industrial Fuel ledger."
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Raw description only contains bank reference, no party name."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Transport",
        "Shree Balaji Roadlines"
      ],
      "confidence": 0,
      "reason": "Raw description says Shree Balaji Transport but derived counterpartyName says Shree Balaji Roadlines; collision between ledgers."
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
If narration says salary but both Salary Expenses and Wages Expenses are plausible, use close_match or suspense.

Transfers, reversals, and company-own transactions:
Do not select the company's own ledger merely because the company name appears in narration.
Use suspense unless one existing transfer, loan, bank, or finance ledger is explicitly and uniquely supported by the narration.
Reversal and cheque-return narrations do not prove which original party ledger should be posted. If the named root is ambiguous, return suspense with no candidates rather than close_match.

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
