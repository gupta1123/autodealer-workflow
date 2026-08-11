# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:00:53.173Z

Model: `deepseek/deepseek-v4-flash`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 89
Batch size: 6
Result: 5/12 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `direct-interest-credit` | direct_match -> Interest Credit | direct_match -> Interest Credit | PASS | Bank interest credited. |
| `direct-bank-charges` | direct_match -> Bank Charges | direct_match -> Bank Charges | PASS | Bank service charges. |
| `close-balaji-root` | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Shree Balaji Traders, Balaji TMT Depot Pune, Balaji TMT Depot Nashik, Shree Balaji Roadlines, Shree Balaji Transport, Balaji Steel Transport Services] | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Shree Balaji Traders] | FAIL | NEFT from Balaji could be any of three Balaji debtors. |
| `close-balaji-steel-root` | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Balaji Steel Transport Services] | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders] | FAIL | Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders. |
| `close-balaji-depot-no-location` | close_match [Balaji TMT Depot Pune, Balaji TMT Depot Nashik] | close_match [Balaji TMT Depot Pune, Balaji TMT Depot Nashik] | PASS | Balaji TMT Depot could be either Pune or Nashik branch. |
| `close-ganesh-steel-no-location` | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | PASS | Ganesh Steel could be either Pune or Nashik branch. |
| `close-mahavir-ocr-collision` | close_match [Mahavir Steel Traders, Mahaveer Steel Traders] | direct_match -> Mahavir Steel Traders | FAIL | Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'. |
| `close-bharat-root-spelling` | close_match [Bharat Steels, Bharat Steel Corporation, Bharath Steel Suppliers] | direct_match -> Bharat Steels | FAIL | 'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely. |
| `close-sahyadri-ocr-collision` | close_match [Sahyadri Steel Distributors, Sahydri Steel Distributors] | direct_match -> Sahyadri Steel Distributors | FAIL | Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly. |
| `close-jsw-root` | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | direct_match -> JSW Steel Limited | FAIL | 'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary. |
| `close-jindal-root` | close_match [Jindal Steel And Power Limited, Jindal Stainless Limited] | close_match [Jindal Steel And Power Limited, Jindal Stainless Limited] | PASS | 'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible. |
| `close-tata-steel-root` | close_match [Tata Steel Limited, Tata Steel Downstream Products Limited] | direct_match -> Tata Steel Limited | FAIL | 'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment. |

## Details

### direct-interest-credit

Description: `INTEREST CREDITED BY BANK`
Counterparty: ``

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Interest Credit",
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
      "ledgerName": "Interest Credit",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank interest credited."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders"
      ],
      "confidence": 0,
      "reason": "NEFT from Balaji could be any of three Balaji debtors."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders"
      ],
      "confidence": 0,
      "reason": "Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Balaji TMT Depot could be either Pune or Nashik branch."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Ganesh Steel could be either Pune or Nashik branch."
    }
  ]
}
```

### direct-bank-charges

Description: `BANK SERVICE CHARGES EXCLUDING GST`
Counterparty: ``

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Bank Charges",
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
      "ledgerName": "Interest Credit",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank interest credited."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders"
      ],
      "confidence": 0,
      "reason": "NEFT from Balaji could be any of three Balaji debtors."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders"
      ],
      "confidence": 0,
      "reason": "Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Balaji TMT Depot could be either Pune or Nashik branch."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Ganesh Steel could be either Pune or Nashik branch."
    }
  ]
}
```

### close-balaji-root

Description: `NEFT FROM BALAJI`
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
      "ledgerName": "Interest Credit",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank interest credited."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders"
      ],
      "confidence": 0,
      "reason": "NEFT from Balaji could be any of three Balaji debtors."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders"
      ],
      "confidence": 0,
      "reason": "Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Balaji TMT Depot could be either Pune or Nashik branch."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Ganesh Steel could be either Pune or Nashik branch."
    }
  ]
}
```

### close-balaji-steel-root

Description: `RTGS BALAJI STEEL`
Counterparty: `Balaji Steel`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Shree Balaji Steels Pvt Ltd",
    "Shree Balaji Steel Traders",
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
      "ledgerName": "Interest Credit",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank interest credited."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders"
      ],
      "confidence": 0,
      "reason": "NEFT from Balaji could be any of three Balaji debtors."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders"
      ],
      "confidence": 0,
      "reason": "Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Balaji TMT Depot could be either Pune or Nashik branch."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Ganesh Steel could be either Pune or Nashik branch."
    }
  ]
}
```

### close-balaji-depot-no-location

Description: `NEFT BALAJI TMT DEPOT`
Counterparty: `Balaji TMT Depot`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Balaji TMT Depot Pune",
    "Balaji TMT Depot Nashik"
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
      "ledgerName": "Interest Credit",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank interest credited."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders"
      ],
      "confidence": 0,
      "reason": "NEFT from Balaji could be any of three Balaji debtors."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders"
      ],
      "confidence": 0,
      "reason": "Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Balaji TMT Depot could be either Pune or Nashik branch."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Ganesh Steel could be either Pune or Nashik branch."
    }
  ]
}
```

### close-ganesh-steel-no-location

Description: `RTGS FROM GANESH STEEL`
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
      "ledgerName": "Interest Credit",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank interest credited."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Shree Balaji Traders"
      ],
      "confidence": 0,
      "reason": "NEFT from Balaji could be any of three Balaji debtors."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders"
      ],
      "confidence": 0,
      "reason": "Balaji Steel could be either Shree Balaji Steels Pvt Ltd or Shree Balaji Steel Traders."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Balaji TMT Depot could be either Pune or Nashik branch."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Ganesh Steel could be either Pune or Nashik branch."
    }
  ]
}
```

### close-mahavir-ocr-collision

Description: `NEFT FROM MAHAVIR STEEL TRADERS`
Counterparty: `Mahavir Steel Traders`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Mahavir Steel Traders",
    "Mahaveer Steel Traders"
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
      "ledgerName": "Mahavir Steel Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bharat Steels",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Sahyadri Steel Distributors",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment."
    }
  ]
}
```

### close-bharat-root-spelling

Description: `NEFT BHARAT STEEL`
Counterparty: `Bharat Steel`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Bharat Steels",
    "Bharat Steel Corporation",
    "Bharath Steel Suppliers"
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
      "ledgerName": "Mahavir Steel Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bharat Steels",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Sahyadri Steel Distributors",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment."
    }
  ]
}
```

### close-sahyadri-ocr-collision

Description: `RTGS SAHYADRI STEEL DISTRIBUTORS`
Counterparty: `Sahyadri Steel Distributors`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sahyadri Steel Distributors",
    "Sahydri Steel Distributors"
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
      "ledgerName": "Mahavir Steel Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bharat Steels",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Sahyadri Steel Distributors",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment."
    }
  ]
}
```

### close-jsw-root

Description: `RTGS TO JSW STEEL`
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
      "ledgerName": "Mahavir Steel Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bharat Steels",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Sahyadri Steel Distributors",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment."
    }
  ]
}
```

### close-jindal-root

Description: `NEFT JINDAL`
Counterparty: `Jindal`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Jindal Steel And Power Limited",
    "Jindal Stainless Limited"
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
      "ledgerName": "Mahavir Steel Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bharat Steels",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Sahyadri Steel Distributors",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment."
    }
  ]
}
```

### close-tata-steel-root

Description: `RTGS TATA STEEL`
Counterparty: `Tata Steel`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Tata Steel Limited",
    "Tata Steel Downstream Products Limited"
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
      "ledgerName": "Mahavir Steel Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'MAHAVIR STEEL TRADERS' in description corresponds directly to the ledger 'Mahavir Steel Traders'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bharat Steels",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'BHARAT STEEL' is a clear shortened form of 'Bharat Steels' (common spelling variation). No other ledger matches as closely."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Sahyadri Steel Distributors",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact match: 'SAHYADRI STEEL DISTRIBUTORS' matches the ledger exactly."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'JSW STEEL' is the common short name for 'JSW Steel Limited'. The other JSW ledger is a distinct product subsidiary."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "'JINDAL' alone does not distinguish between Jindal Steel And Power Limited and Jindal Stainless Limited. Both are plausible."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "'TATA STEEL' is the common name for 'Tata Steel Limited'. The other Tata Steel ledger is a downstream subsidiary and less likely for a bulk material payment."
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
