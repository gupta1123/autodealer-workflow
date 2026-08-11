# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:48:53.439Z

Model: `deepseek/deepseek-v4-pro`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 89
Batch size: 6
Result: 24/25 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `close-balaji-root` | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Shree Balaji Traders, Balaji TMT Depot Pune, Balaji TMT Depot Nashik, Shree Balaji Roadlines, Shree Balaji Transport, Balaji Steel Transport Services] | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Shree Balaji Traders, Balaji TMT Depot Pune, Balaji TMT Depot Nashik, Shree Balaji Roadlines, Shree Balaji Transport, Balaji Steel Transport Services] | PASS | Multiple ledgers contain 'Balaji', no unique match. |
| `close-balaji-steel-root` | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Balaji Steel Transport Services] | close_match [Shree Balaji Steels Pvt Ltd, Shree Balaji Steel Traders, Balaji Steel Transport Services] | PASS | Multiple ledgers contain 'Balaji Steel', no unique match. |
| `close-balaji-depot-no-location` | close_match [Balaji TMT Depot Pune, Balaji TMT Depot Nashik] | close_match [Balaji TMT Depot Pune, Balaji TMT Depot Nashik] | PASS | Multiple locations for Balaji TMT Depot, no unique match. |
| `close-ganesh-steel-no-location` | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | PASS | Multiple locations for Ganesh Steel, no unique match. |
| `close-mahavir-ocr-collision` | close_match [Mahavir Steel Traders, Mahaveer Steel Traders] | close_match [Mahavir Steel Traders, Mahaveer Steel Traders] | PASS | Spelling variants of Mahavir Steel Traders exist, no unique match. |
| `close-bharat-root-spelling` | close_match [Bharat Steels, Bharat Steel Corporation, Bharath Steel Suppliers] | close_match [Bharat Steels, Bharat Steel Corporation, Bharath Steel Suppliers] | PASS | Multiple ledgers named Bharat Steels and variants, no unique match. |
| `close-sahyadri-ocr-collision` | close_match [Sahyadri Steel Distributors, Sahydri Steel Distributors] | close_match [Sahyadri Steel Distributors, Sahydri Steel Distributors] | PASS | Collision between Sahyadri and Sahydri steel distributors |
| `close-jsw-root` | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | PASS | Ambiguous JSW Steel entity |
| `close-jindal-root` | close_match [Jindal Steel And Power Limited, Jindal Stainless Limited] | close_match [Jindal Steel And Power Limited, Jindal Stainless Limited] | PASS | Generic Jindal reference |
| `close-tata-steel-root` | close_match [Tata Steel Limited, Tata Steel Downstream Products Limited] | close_match [Tata Steel Limited, Tata Steel Downstream Products Limited] | PASS | Ambiguous Tata Steel entity |
| `close-shakti-root-cross-group` | close_match [Shakti TMT Dealers, Shakti Scrap Traders, Shakti Sponge Iron Suppliers, Shakti Ferro Alloys] | close_match [Shakti TMT Dealers, Shakti Scrap Traders, Shakti Sponge Iron Suppliers, Shakti Ferro Alloys] | PASS | Generic Shakti reference with multiple matching ledgers |
| `close-om-root` | close_match [Om Engineering Works, Om Fabricators, Om Electricals] | close_match [Om Engineering Works, Om Fabricators, Om Electricals] | PASS | Generic Om reference with multiple matching ledgers |
| `close-manibhadra-ocr` | close_match [Manibhadra Steel Cement Co, Manibhaddar Steel And Cement Company] | close_match [Manibhadra Steel Cement Co, Manibhaddar Steel And Cement Company] | PASS | Description matches two similar ledger names; cannot safely choose one. |
| `close-sai-root` | close_match [Sai Industrial Gases, Sai Enterprises] | close_match [Sai Industrial Gases, Sai Enterprises] | PASS | Description only says SAI, which collides with two existing ledgers. |
| `close-hpcl-fuel` | close_match [HPCL Diesel Depot, HPCL Industrial Fuel] | close_match [HPCL Diesel Depot, HPCL Industrial Fuel] | PASS | HPCL FUEL PAYMENT could refer to either HPCL ledger. |
| `close-pune-crane` | close_match [Pune Crane Services, Pune Crane And Transport Services] | close_match [Pune Crane Services, Pune Crane And Transport Services] | PASS | PUNE CRANE collides with two similar ledger names. |
| `close-metro-root` | close_match [Metro Weighbridge, Metro Industrial Services] | close_match [Metro Weighbridge, Metro Industrial Services] | PASS | METRO SERVICES could match either Metro ledger. |
| `close-freight-direction` | close_match [Freight Inward, Freight Outward] | close_match [Freight Inward, Freight Outward] | PASS | FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible. |
| `close-gst-generic` | close_match [GST Payable, CGST Payable, SGST Payable, IGST Payable] | close_match [GST Payable, CGST Payable, SGST Payable, IGST Payable] | PASS | Generic GST payment does not specify which GST ledger; multiple possible. |
| `close-tds-generic` | close_match [TDS Payable 194C, TDS Payable 194Q] | close_match [TDS Payable 194C, TDS Payable 194Q] | PASS | TDS payment challan 281 does not specify section; both TDS payables are plausible. |
| `close-interest-debit-generic` | close_match [Interest On OD, Interest On WCDL, Term Loan Interest] | close_match [Interest On OD, Interest On WCDL, Term Loan Interest] | PASS | Interest debited by bank without specifying loan type; multiple interest ledgers possible. |
| `close-hdfc-transfer-no-account` | close_match [HDFC Bank Current Account 1234, HDFC Bank OD Account 7788] | close_match [HDFC Bank Current Account 1234, HDFC Bank OD Account 7788] | PASS | Fund transfer to HDFC Bank but does not specify which account. |
| `close-axis-transfer-no-account` | close_match [Axis Bank WCDL A/c 92108044607205, Axis Bank OD Account] | close_match [Axis Bank WCDL A/c 92108044607205, Axis Bank OD Account] | PASS | Transfer to Axis Bank but account not specified; multiple Axis accounts exist. |
| `close-employee-middle-initial` | close_match [Rahul Patil, Rahul P Patil] | close_match [Rahul Patil, Rahul P Patil] | PASS | Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger. |
| `close-payroll-bulk` | close_match [Salary Payable, Wages Payable] | suspense | FAIL | Description 'SALARY WAGES BULK PAYMENT JULY' does not identify a specific employee or distinguish between Salary Payable and Wages Payable. No single ledger is clearly correct. |

## Details

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
      "reason": "Multiple ledgers contain 'Balaji', no unique match."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers contain 'Balaji Steel', no unique match."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Balaji TMT Depot, no unique match."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Ganesh Steel, no unique match."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Mahavir Steel Traders",
        "Mahaveer Steel Traders"
      ],
      "confidence": 0,
      "reason": "Spelling variants of Mahavir Steel Traders exist, no unique match."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Bharat Steels",
        "Bharat Steel Corporation",
        "Bharath Steel Suppliers"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers named Bharat Steels and variants, no unique match."
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
      "reason": "Multiple ledgers contain 'Balaji', no unique match."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers contain 'Balaji Steel', no unique match."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Balaji TMT Depot, no unique match."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Ganesh Steel, no unique match."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Mahavir Steel Traders",
        "Mahaveer Steel Traders"
      ],
      "confidence": 0,
      "reason": "Spelling variants of Mahavir Steel Traders exist, no unique match."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Bharat Steels",
        "Bharat Steel Corporation",
        "Bharath Steel Suppliers"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers named Bharat Steels and variants, no unique match."
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
      "reason": "Multiple ledgers contain 'Balaji', no unique match."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers contain 'Balaji Steel', no unique match."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Balaji TMT Depot, no unique match."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Ganesh Steel, no unique match."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Mahavir Steel Traders",
        "Mahaveer Steel Traders"
      ],
      "confidence": 0,
      "reason": "Spelling variants of Mahavir Steel Traders exist, no unique match."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Bharat Steels",
        "Bharat Steel Corporation",
        "Bharath Steel Suppliers"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers named Bharat Steels and variants, no unique match."
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
      "reason": "Multiple ledgers contain 'Balaji', no unique match."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers contain 'Balaji Steel', no unique match."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Balaji TMT Depot, no unique match."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Ganesh Steel, no unique match."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Mahavir Steel Traders",
        "Mahaveer Steel Traders"
      ],
      "confidence": 0,
      "reason": "Spelling variants of Mahavir Steel Traders exist, no unique match."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Bharat Steels",
        "Bharat Steel Corporation",
        "Bharath Steel Suppliers"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers named Bharat Steels and variants, no unique match."
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
      "reason": "Multiple ledgers contain 'Balaji', no unique match."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers contain 'Balaji Steel', no unique match."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Balaji TMT Depot, no unique match."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Ganesh Steel, no unique match."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Mahavir Steel Traders",
        "Mahaveer Steel Traders"
      ],
      "confidence": 0,
      "reason": "Spelling variants of Mahavir Steel Traders exist, no unique match."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Bharat Steels",
        "Bharat Steel Corporation",
        "Bharath Steel Suppliers"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers named Bharat Steels and variants, no unique match."
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
      "reason": "Multiple ledgers contain 'Balaji', no unique match."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shree Balaji Steels Pvt Ltd",
        "Shree Balaji Steel Traders",
        "Balaji Steel Transport Services"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers contain 'Balaji Steel', no unique match."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Balaji TMT Depot Pune",
        "Balaji TMT Depot Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Balaji TMT Depot, no unique match."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "Multiple locations for Ganesh Steel, no unique match."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Mahavir Steel Traders",
        "Mahaveer Steel Traders"
      ],
      "confidence": 0,
      "reason": "Spelling variants of Mahavir Steel Traders exist, no unique match."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Bharat Steels",
        "Bharat Steel Corporation",
        "Bharath Steel Suppliers"
      ],
      "confidence": 0,
      "reason": "Multiple ledgers named Bharat Steels and variants, no unique match."
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sahyadri Steel Distributors",
        "Sahydri Steel Distributors"
      ],
      "confidence": 0,
      "reason": "Collision between Sahyadri and Sahydri steel distributors"
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
      "reason": "Ambiguous JSW Steel entity"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "Generic Jindal reference"
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Limited",
        "Tata Steel Downstream Products Limited"
      ],
      "confidence": 0,
      "reason": "Ambiguous Tata Steel entity"
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shakti TMT Dealers",
        "Shakti Scrap Traders",
        "Shakti Sponge Iron Suppliers",
        "Shakti Ferro Alloys"
      ],
      "confidence": 0,
      "reason": "Generic Shakti reference with multiple matching ledgers"
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Om Engineering Works",
        "Om Fabricators",
        "Om Electricals"
      ],
      "confidence": 0,
      "reason": "Generic Om reference with multiple matching ledgers"
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sahyadri Steel Distributors",
        "Sahydri Steel Distributors"
      ],
      "confidence": 0,
      "reason": "Collision between Sahyadri and Sahydri steel distributors"
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
      "reason": "Ambiguous JSW Steel entity"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "Generic Jindal reference"
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Limited",
        "Tata Steel Downstream Products Limited"
      ],
      "confidence": 0,
      "reason": "Ambiguous Tata Steel entity"
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shakti TMT Dealers",
        "Shakti Scrap Traders",
        "Shakti Sponge Iron Suppliers",
        "Shakti Ferro Alloys"
      ],
      "confidence": 0,
      "reason": "Generic Shakti reference with multiple matching ledgers"
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Om Engineering Works",
        "Om Fabricators",
        "Om Electricals"
      ],
      "confidence": 0,
      "reason": "Generic Om reference with multiple matching ledgers"
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sahyadri Steel Distributors",
        "Sahydri Steel Distributors"
      ],
      "confidence": 0,
      "reason": "Collision between Sahyadri and Sahydri steel distributors"
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
      "reason": "Ambiguous JSW Steel entity"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "Generic Jindal reference"
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Limited",
        "Tata Steel Downstream Products Limited"
      ],
      "confidence": 0,
      "reason": "Ambiguous Tata Steel entity"
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shakti TMT Dealers",
        "Shakti Scrap Traders",
        "Shakti Sponge Iron Suppliers",
        "Shakti Ferro Alloys"
      ],
      "confidence": 0,
      "reason": "Generic Shakti reference with multiple matching ledgers"
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Om Engineering Works",
        "Om Fabricators",
        "Om Electricals"
      ],
      "confidence": 0,
      "reason": "Generic Om reference with multiple matching ledgers"
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sahyadri Steel Distributors",
        "Sahydri Steel Distributors"
      ],
      "confidence": 0,
      "reason": "Collision between Sahyadri and Sahydri steel distributors"
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
      "reason": "Ambiguous JSW Steel entity"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "Generic Jindal reference"
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Limited",
        "Tata Steel Downstream Products Limited"
      ],
      "confidence": 0,
      "reason": "Ambiguous Tata Steel entity"
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shakti TMT Dealers",
        "Shakti Scrap Traders",
        "Shakti Sponge Iron Suppliers",
        "Shakti Ferro Alloys"
      ],
      "confidence": 0,
      "reason": "Generic Shakti reference with multiple matching ledgers"
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Om Engineering Works",
        "Om Fabricators",
        "Om Electricals"
      ],
      "confidence": 0,
      "reason": "Generic Om reference with multiple matching ledgers"
    }
  ]
}
```

### close-shakti-root-cross-group

Description: `NEFT SHAKTI`
Counterparty: `Shakti`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Shakti TMT Dealers",
    "Shakti Scrap Traders",
    "Shakti Sponge Iron Suppliers",
    "Shakti Ferro Alloys"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sahyadri Steel Distributors",
        "Sahydri Steel Distributors"
      ],
      "confidence": 0,
      "reason": "Collision between Sahyadri and Sahydri steel distributors"
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
      "reason": "Ambiguous JSW Steel entity"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "Generic Jindal reference"
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Limited",
        "Tata Steel Downstream Products Limited"
      ],
      "confidence": 0,
      "reason": "Ambiguous Tata Steel entity"
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shakti TMT Dealers",
        "Shakti Scrap Traders",
        "Shakti Sponge Iron Suppliers",
        "Shakti Ferro Alloys"
      ],
      "confidence": 0,
      "reason": "Generic Shakti reference with multiple matching ledgers"
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Om Engineering Works",
        "Om Fabricators",
        "Om Electricals"
      ],
      "confidence": 0,
      "reason": "Generic Om reference with multiple matching ledgers"
    }
  ]
}
```

### close-om-root

Description: `IMPS TO OM`
Counterparty: `Om`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Om Engineering Works",
    "Om Fabricators",
    "Om Electricals"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sahyadri Steel Distributors",
        "Sahydri Steel Distributors"
      ],
      "confidence": 0,
      "reason": "Collision between Sahyadri and Sahydri steel distributors"
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
      "reason": "Ambiguous JSW Steel entity"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Jindal Steel And Power Limited",
        "Jindal Stainless Limited"
      ],
      "confidence": 0,
      "reason": "Generic Jindal reference"
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Tata Steel Limited",
        "Tata Steel Downstream Products Limited"
      ],
      "confidence": 0,
      "reason": "Ambiguous Tata Steel entity"
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Shakti TMT Dealers",
        "Shakti Scrap Traders",
        "Shakti Sponge Iron Suppliers",
        "Shakti Ferro Alloys"
      ],
      "confidence": 0,
      "reason": "Generic Shakti reference with multiple matching ledgers"
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Om Engineering Works",
        "Om Fabricators",
        "Om Electricals"
      ],
      "confidence": 0,
      "reason": "Generic Om reference with multiple matching ledgers"
    }
  ]
}
```

### close-manibhadra-ocr

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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Description matches two similar ledger names; cannot safely choose one."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sai Industrial Gases",
        "Sai Enterprises"
      ],
      "confidence": 0,
      "reason": "Description only says SAI, which collides with two existing ledgers."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HPCL Diesel Depot",
        "HPCL Industrial Fuel"
      ],
      "confidence": 0,
      "reason": "HPCL FUEL PAYMENT could refer to either HPCL ledger."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Pune Crane Services",
        "Pune Crane And Transport Services"
      ],
      "confidence": 0,
      "reason": "PUNE CRANE collides with two similar ledger names."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Metro Weighbridge",
        "Metro Industrial Services"
      ],
      "confidence": 0,
      "reason": "METRO SERVICES could match either Metro ledger."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Freight Inward",
        "Freight Outward"
      ],
      "confidence": 0,
      "reason": "FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible."
    }
  ]
}
```

### close-sai-root

Description: `NEFT TO SAI`
Counterparty: `Sai`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sai Industrial Gases",
    "Sai Enterprises"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Description matches two similar ledger names; cannot safely choose one."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sai Industrial Gases",
        "Sai Enterprises"
      ],
      "confidence": 0,
      "reason": "Description only says SAI, which collides with two existing ledgers."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HPCL Diesel Depot",
        "HPCL Industrial Fuel"
      ],
      "confidence": 0,
      "reason": "HPCL FUEL PAYMENT could refer to either HPCL ledger."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Pune Crane Services",
        "Pune Crane And Transport Services"
      ],
      "confidence": 0,
      "reason": "PUNE CRANE collides with two similar ledger names."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Metro Weighbridge",
        "Metro Industrial Services"
      ],
      "confidence": 0,
      "reason": "METRO SERVICES could match either Metro ledger."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Freight Inward",
        "Freight Outward"
      ],
      "confidence": 0,
      "reason": "FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible."
    }
  ]
}
```

### close-hpcl-fuel

Description: `NEFT HPCL FUEL PAYMENT`
Counterparty: `HPCL`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "HPCL Diesel Depot",
    "HPCL Industrial Fuel"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Description matches two similar ledger names; cannot safely choose one."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sai Industrial Gases",
        "Sai Enterprises"
      ],
      "confidence": 0,
      "reason": "Description only says SAI, which collides with two existing ledgers."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HPCL Diesel Depot",
        "HPCL Industrial Fuel"
      ],
      "confidence": 0,
      "reason": "HPCL FUEL PAYMENT could refer to either HPCL ledger."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Pune Crane Services",
        "Pune Crane And Transport Services"
      ],
      "confidence": 0,
      "reason": "PUNE CRANE collides with two similar ledger names."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Metro Weighbridge",
        "Metro Industrial Services"
      ],
      "confidence": 0,
      "reason": "METRO SERVICES could match either Metro ledger."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Freight Inward",
        "Freight Outward"
      ],
      "confidence": 0,
      "reason": "FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible."
    }
  ]
}
```

### close-pune-crane

Description: `RTGS PUNE CRANE`
Counterparty: `Pune Crane`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Pune Crane Services",
    "Pune Crane And Transport Services"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Description matches two similar ledger names; cannot safely choose one."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sai Industrial Gases",
        "Sai Enterprises"
      ],
      "confidence": 0,
      "reason": "Description only says SAI, which collides with two existing ledgers."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HPCL Diesel Depot",
        "HPCL Industrial Fuel"
      ],
      "confidence": 0,
      "reason": "HPCL FUEL PAYMENT could refer to either HPCL ledger."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Pune Crane Services",
        "Pune Crane And Transport Services"
      ],
      "confidence": 0,
      "reason": "PUNE CRANE collides with two similar ledger names."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Metro Weighbridge",
        "Metro Industrial Services"
      ],
      "confidence": 0,
      "reason": "METRO SERVICES could match either Metro ledger."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Freight Inward",
        "Freight Outward"
      ],
      "confidence": 0,
      "reason": "FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible."
    }
  ]
}
```

### close-metro-root

Description: `IMPS METRO SERVICES`
Counterparty: `Metro`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Metro Weighbridge",
    "Metro Industrial Services"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Description matches two similar ledger names; cannot safely choose one."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sai Industrial Gases",
        "Sai Enterprises"
      ],
      "confidence": 0,
      "reason": "Description only says SAI, which collides with two existing ledgers."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HPCL Diesel Depot",
        "HPCL Industrial Fuel"
      ],
      "confidence": 0,
      "reason": "HPCL FUEL PAYMENT could refer to either HPCL ledger."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Pune Crane Services",
        "Pune Crane And Transport Services"
      ],
      "confidence": 0,
      "reason": "PUNE CRANE collides with two similar ledger names."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Metro Weighbridge",
        "Metro Industrial Services"
      ],
      "confidence": 0,
      "reason": "METRO SERVICES could match either Metro ledger."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Freight Inward",
        "Freight Outward"
      ],
      "confidence": 0,
      "reason": "FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible."
    }
  ]
}
```

### close-freight-direction

Description: `FREIGHT CHARGES PAYMENT`
Counterparty: ``

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Freight Inward",
    "Freight Outward"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Description matches two similar ledger names; cannot safely choose one."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Sai Industrial Gases",
        "Sai Enterprises"
      ],
      "confidence": 0,
      "reason": "Description only says SAI, which collides with two existing ledgers."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HPCL Diesel Depot",
        "HPCL Industrial Fuel"
      ],
      "confidence": 0,
      "reason": "HPCL FUEL PAYMENT could refer to either HPCL ledger."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Pune Crane Services",
        "Pune Crane And Transport Services"
      ],
      "confidence": 0,
      "reason": "PUNE CRANE collides with two similar ledger names."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Metro Weighbridge",
        "Metro Industrial Services"
      ],
      "confidence": 0,
      "reason": "METRO SERVICES could match either Metro ledger."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Freight Inward",
        "Freight Outward"
      ],
      "confidence": 0,
      "reason": "FREIGHT CHARGES PAYMENT does not specify inward or outward; both ledgers are plausible."
    }
  ]
}
```

### close-gst-generic

Description: `GST PAYMENT CPIN 2408810091`
Counterparty: ``

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "GST Payable",
    "CGST Payable",
    "SGST Payable",
    "IGST Payable"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "GST Payable",
        "CGST Payable",
        "SGST Payable",
        "IGST Payable"
      ],
      "confidence": 0,
      "reason": "Generic GST payment does not specify which GST ledger; multiple possible."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "TDS payment challan 281 does not specify section; both TDS payables are plausible."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Interest On OD",
        "Interest On WCDL",
        "Term Loan Interest"
      ],
      "confidence": 0,
      "reason": "Interest debited by bank without specifying loan type; multiple interest ledgers possible."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Fund transfer to HDFC Bank but does not specify which account."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "reason": "Transfer to Axis Bank but account not specified; multiple Axis accounts exist."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Rahul Patil",
        "Rahul P Patil"
      ],
      "confidence": 0,
      "reason": "Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger."
    }
  ]
}
```

### close-tds-generic

Description: `OLTAS TDS PAYMENT CHALLAN 281`
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "GST Payable",
        "CGST Payable",
        "SGST Payable",
        "IGST Payable"
      ],
      "confidence": 0,
      "reason": "Generic GST payment does not specify which GST ledger; multiple possible."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "TDS payment challan 281 does not specify section; both TDS payables are plausible."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Interest On OD",
        "Interest On WCDL",
        "Term Loan Interest"
      ],
      "confidence": 0,
      "reason": "Interest debited by bank without specifying loan type; multiple interest ledgers possible."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Fund transfer to HDFC Bank but does not specify which account."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "reason": "Transfer to Axis Bank but account not specified; multiple Axis accounts exist."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Rahul Patil",
        "Rahul P Patil"
      ],
      "confidence": 0,
      "reason": "Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger."
    }
  ]
}
```

### close-interest-debit-generic

Description: `INTEREST DEBITED BY BANK`
Counterparty: ``

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Interest On OD",
    "Interest On WCDL",
    "Term Loan Interest"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "GST Payable",
        "CGST Payable",
        "SGST Payable",
        "IGST Payable"
      ],
      "confidence": 0,
      "reason": "Generic GST payment does not specify which GST ledger; multiple possible."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "TDS payment challan 281 does not specify section; both TDS payables are plausible."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Interest On OD",
        "Interest On WCDL",
        "Term Loan Interest"
      ],
      "confidence": 0,
      "reason": "Interest debited by bank without specifying loan type; multiple interest ledgers possible."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Fund transfer to HDFC Bank but does not specify which account."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "reason": "Transfer to Axis Bank but account not specified; multiple Axis accounts exist."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Rahul Patil",
        "Rahul P Patil"
      ],
      "confidence": 0,
      "reason": "Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger."
    }
  ]
}
```

### close-hdfc-transfer-no-account

Description: `FUND TRANSFER TO HDFC BANK`
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "GST Payable",
        "CGST Payable",
        "SGST Payable",
        "IGST Payable"
      ],
      "confidence": 0,
      "reason": "Generic GST payment does not specify which GST ledger; multiple possible."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "TDS payment challan 281 does not specify section; both TDS payables are plausible."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Interest On OD",
        "Interest On WCDL",
        "Term Loan Interest"
      ],
      "confidence": 0,
      "reason": "Interest debited by bank without specifying loan type; multiple interest ledgers possible."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Fund transfer to HDFC Bank but does not specify which account."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "reason": "Transfer to Axis Bank but account not specified; multiple Axis accounts exist."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Rahul Patil",
        "Rahul P Patil"
      ],
      "confidence": 0,
      "reason": "Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger."
    }
  ]
}
```

### close-axis-transfer-no-account

Description: `TRANSFER TO AXIS BANK`
Counterparty: `Axis Bank`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Axis Bank WCDL A/c 92108044607205",
    "Axis Bank OD Account"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "GST Payable",
        "CGST Payable",
        "SGST Payable",
        "IGST Payable"
      ],
      "confidence": 0,
      "reason": "Generic GST payment does not specify which GST ledger; multiple possible."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "TDS payment challan 281 does not specify section; both TDS payables are plausible."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Interest On OD",
        "Interest On WCDL",
        "Term Loan Interest"
      ],
      "confidence": 0,
      "reason": "Interest debited by bank without specifying loan type; multiple interest ledgers possible."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Fund transfer to HDFC Bank but does not specify which account."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "reason": "Transfer to Axis Bank but account not specified; multiple Axis accounts exist."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Rahul Patil",
        "Rahul P Patil"
      ],
      "confidence": 0,
      "reason": "Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger."
    }
  ]
}
```

### close-employee-middle-initial

Description: `IMPS SALARY RAHUL PATIL JULY`
Counterparty: `Rahul Patil`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Rahul Patil",
    "Rahul P Patil"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "GST Payable",
        "CGST Payable",
        "SGST Payable",
        "IGST Payable"
      ],
      "confidence": 0,
      "reason": "Generic GST payment does not specify which GST ledger; multiple possible."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "TDS payment challan 281 does not specify section; both TDS payables are plausible."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Interest On OD",
        "Interest On WCDL",
        "Term Loan Interest"
      ],
      "confidence": 0,
      "reason": "Interest debited by bank without specifying loan type; multiple interest ledgers possible."
    },
    {
      "index": 3,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Fund transfer to HDFC Bank but does not specify which account."
    },
    {
      "index": 4,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "reason": "Transfer to Axis Bank but account not specified; multiple Axis accounts exist."
    },
    {
      "index": 5,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Rahul Patil",
        "Rahul P Patil"
      ],
      "confidence": 0,
      "reason": "Rahul Patil payment could refer to either Rahul Patil or Rahul P Patil ledger."
    }
  ]
}
```

### close-payroll-bulk

Description: `SALARY WAGES BULK PAYMENT JULY`
Counterparty: ``

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Salary Payable",
    "Wages Payable"
  ]
}
```

Actual:

```json
{
  "matches": [
    {
      "index": 0,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Description 'SALARY WAGES BULK PAYMENT JULY' does not identify a specific employee or distinguish between Salary Payable and Wages Payable. No single ledger is clearly correct."
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
