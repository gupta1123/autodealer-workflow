# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:51:07.628Z

Model: `deepseek/deepseek-v4-pro`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 89
Batch size: 6
Result: 20/26 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `direct-customer-exact` | direct_match -> Shree Balaji Steels Pvt Ltd | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `direct-customer-legal-suffix-omitted` | direct_match -> Shree Balaji Steels Pvt Ltd | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `direct-customer-location-pune` | direct_match -> Balaji TMT Depot Pune | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `direct-customer-joined-name` | direct_match -> Rajesh Trading Company | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `direct-supplier-jsw-full` | direct_match -> JSW Steel Limited | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `direct-supplier-tata-downstream` | direct_match -> Tata Steel Downstream Products Limited | ERROR: OpenRouter returned an empty message | FAIL | OpenRouter returned an empty message |
| `direct-scrap-supplier` | direct_match -> Shakti Scrap Traders | direct_match -> Shakti Scrap Traders | PASS | Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root. |
| `direct-sponge-iron-supplier` | direct_match -> Shakti Sponge Iron Suppliers | direct_match -> Shakti Sponge Iron Suppliers | PASS | Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root. |
| `direct-ferro-alloys-supplier` | direct_match -> Shakti Ferro Alloys | direct_match -> Shakti Ferro Alloys | PASS | Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root. |
| `direct-roadlines-vendor` | direct_match -> Shree Balaji Roadlines | direct_match -> Shree Balaji Roadlines | PASS | Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root. |
| `direct-transport-vendor` | direct_match -> Shree Balaji Transport | direct_match -> Shree Balaji Transport | PASS | Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root. |
| `direct-engineering-vendor` | direct_match -> Om Engineering Works | direct_match -> Om Engineering Works | PASS | Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root. |
| `direct-electrical-vendor` | direct_match -> Om Electricals | direct_match -> Om Electricals | PASS | Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'. |
| `direct-oxygen-vendor` | direct_match -> National Oxygen Suppliers | direct_match -> National Oxygen Suppliers | PASS | Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger. |
| `direct-electricity-named-party` | direct_match -> Maharashtra State Electricity Distribution Co Ltd | direct_match -> Maharashtra State Electricity Distribution Co Ltd | PASS | MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger. |
| `direct-tds-194q` | direct_match -> TDS Payable 194Q | direct_match -> TDS Payable 194Q | PASS | Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger. |
| `direct-pf-payment` | direct_match -> PF Payable | direct_match -> PF Payable | PASS | Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger. |
| `direct-employee-unique` | direct_match -> Suresh Jadhav | direct_match -> Suresh Jadhav | PASS | Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger. |
| `direct-axis-account-number` | direct_match -> Axis Bank WCDL A/c 92108044607205 | direct_match -> Axis Bank WCDL A/c 92108044607205 | PASS | Transfer to Axis WCDL account with matching account number |
| `direct-hdfc-od-account-number` | direct_match -> HDFC Bank OD Account 7788 | direct_match -> HDFC Bank OD Account 7788 | PASS | Fund transfer to HDFC OD account 7788 |
| `direct-cash-deposit` | direct_match -> Cash | direct_match -> Cash | PASS | Cash deposit by self |
| `direct-office-supplies` | direct_match -> Office Supplies | direct_match -> Office Supplies | PASS | Office supplies stationery purchase |
| `direct-customer-refund-direction` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Refund to Rajesh Trading Company |
| `direct-supplier-refund-direction` | direct_match -> National Oxygen Suppliers | direct_match -> National Oxygen Suppliers | PASS | Refund from National Oxygen Suppliers |
| `direct-interest-credit` | direct_match -> Interest Credit | direct_match -> Interest Credit | PASS | Interest credited by bank maps to Interest Credit ledger. |
| `direct-bank-charges` | direct_match -> Bank Charges | direct_match -> Bank Charges | PASS | Bank service charges excluding GST maps to Bank Charges ledger. |

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
  "error": "OpenRouter returned an empty message"
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
  "error": "OpenRouter returned an empty message"
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
  "error": "OpenRouter returned an empty message"
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
  "error": "OpenRouter returned an empty message"
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
  "error": "OpenRouter returned an empty message"
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
  "error": "OpenRouter returned an empty message"
}
```

### direct-scrap-supplier

Description: `RTGS SHAKTI SCRAP TRADERS SCRAP PURCHASE`
Counterparty: `Shakti Scrap Traders`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shakti Scrap Traders",
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
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root."
    }
  ]
}
```

### direct-sponge-iron-supplier

Description: `NEFT TO SHAKTI SPONGE IRON SUPPLIERS`
Counterparty: `Shakti Sponge Iron Suppliers`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shakti Sponge Iron Suppliers",
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
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root."
    }
  ]
}
```

### direct-ferro-alloys-supplier

Description: `RTGS SHAKTI FERRO ALLOYS`
Counterparty: `Shakti Ferro Alloys`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shakti Ferro Alloys",
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
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root."
    }
  ]
}
```

### direct-roadlines-vendor

Description: `NEFT TO SHREE BALAJI ROADLINES FREIGHT LR 882`
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
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root."
    }
  ]
}
```

### direct-transport-vendor

Description: `NEFT SHREE BALAJI TRANSPORT VEHICLE MH12AB7788`
Counterparty: `Shree Balaji Transport`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Shree Balaji Transport",
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
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root."
    }
  ]
}
```

### direct-engineering-vendor

Description: `RTGS OM ENGINEERING WORKS ROLLING MILL REPAIR`
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
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SCRAP TRADERS' which uniquely matches the existing ledger 'Shakti Scrap Traders'. No other ledger shares this root."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI SPONGE IRON SUPPLIERS' which uniquely matches the existing ledger 'Shakti Sponge Iron Suppliers'. No other ledger shares this root."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHAKTI FERRO ALLOYS' which uniquely matches the existing ledger 'Shakti Ferro Alloys'. No other ledger shares this root."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI ROADLINES' which uniquely matches the existing ledger 'Shree Balaji Roadlines'. No other ledger shares this root."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'SHREE BALAJI TRANSPORT' which uniquely matches the existing ledger 'Shree Balaji Transport'. No other ledger shares this root."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description contains 'OM ENGINEERING WORKS' which uniquely matches the existing ledger 'Om Engineering Works'. No other ledger shares this root."
    }
  ]
}
```

### direct-electrical-vendor

Description: `NEFT OM ELECTRICALS PANEL REPAIR`
Counterparty: `Om Electricals`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Om Electricals",
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
      "ledgerName": "Om Electricals",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "PF Payable",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Suresh Jadhav",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger."
    }
  ]
}
```

### direct-oxygen-vendor

Description: `IMPS NATIONAL OXYGEN SUPPLIERS CYLINDER`
Counterparty: `National Oxygen Suppliers`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "National Oxygen Suppliers",
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
      "ledgerName": "Om Electricals",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "PF Payable",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Suresh Jadhav",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger."
    }
  ]
}
```

### direct-electricity-named-party

Description: `MSEDCL HT CONSUMER 170019009881 BILL PAYMENT`
Counterparty: `MSEDCL`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
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
      "ledgerName": "Om Electricals",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "PF Payable",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Suresh Jadhav",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger."
    }
  ]
}
```

### direct-tds-194q

Description: `OLTAS TDS PAYMENT SECTION 194Q CHALLAN 281`
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
      "ledgerName": "Om Electricals",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "PF Payable",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Suresh Jadhav",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger."
    }
  ]
}
```

### direct-pf-payment

Description: `EPFO TRRN 240881 PF CONTRIBUTION`
Counterparty: ``

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "PF Payable",
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
      "ledgerName": "Om Electricals",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "PF Payable",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Suresh Jadhav",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger."
    }
  ]
}
```

### direct-employee-unique

Description: `IMPS SALARY SURESH JADHAV JULY`
Counterparty: `Suresh Jadhav`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Suresh Jadhav",
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
      "ledgerName": "Om Electricals",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'OM ELECTRICALS' which uniquely matches the existing ledger 'Om Electricals'."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description clearly names 'NATIONAL OXYGEN SUPPLIERS', exactly matching the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Maharashtra State Electricity Distribution Co Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "MSEDCL is the well-known abbreviation for the state electricity board, matching the existing utility ledger."
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description explicitly states 'SECTION 194Q', which directly corresponds to the only 194Q TDS payable ledger."
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "PF Payable",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "reason": "Description contains 'EPFO ... PF CONTRIBUTION', directly matching the statutory PF payable ledger."
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Suresh Jadhav",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description names 'SURESH JADHAV' as the salary recipient, uniquely matching the employee's ledger."
    }
  ]
}
```

### direct-axis-account-number

Description: `TRANSFER TO AXIS WCDL ACCOUNT 92108044607205`
Counterparty: `Axis Bank WCDL Account 92108044607205`

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
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Transfer to Axis WCDL account with matching account number"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "HDFC Bank OD Account 7788",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Fund transfer to HDFC OD account 7788"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Cash deposit by self"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Office supplies stationery purchase"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund to Rajesh Trading Company"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund from National Oxygen Suppliers"
    }
  ]
}
```

### direct-hdfc-od-account-number

Description: `FUND TRANSFER HDFC OD 7788`
Counterparty: `HDFC OD 7788`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "HDFC Bank OD Account 7788",
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
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Transfer to Axis WCDL account with matching account number"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "HDFC Bank OD Account 7788",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Fund transfer to HDFC OD account 7788"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Cash deposit by self"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Office supplies stationery purchase"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund to Rajesh Trading Company"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund from National Oxygen Suppliers"
    }
  ]
}
```

### direct-cash-deposit

Description: `CASH DEPOSIT BY SELF`
Counterparty: ``

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Cash",
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
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Transfer to Axis WCDL account with matching account number"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "HDFC Bank OD Account 7788",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Fund transfer to HDFC OD account 7788"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Cash deposit by self"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Office supplies stationery purchase"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund to Rajesh Trading Company"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund from National Oxygen Suppliers"
    }
  ]
}
```

### direct-office-supplies

Description: `OFFICE SUPPLIES STATIONERY PURCHASE`
Counterparty: ``

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Office Supplies",
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
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Transfer to Axis WCDL account with matching account number"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "HDFC Bank OD Account 7788",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Fund transfer to HDFC OD account 7788"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Cash deposit by self"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Office supplies stationery purchase"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund to Rajesh Trading Company"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund from National Oxygen Suppliers"
    }
  ]
}
```

### direct-customer-refund-direction

Description: `NEFT REFUND TO RAJESH TRADING COMPANY`
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
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Transfer to Axis WCDL account with matching account number"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "HDFC Bank OD Account 7788",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Fund transfer to HDFC OD account 7788"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Cash deposit by self"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Office supplies stationery purchase"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund to Rajesh Trading Company"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund from National Oxygen Suppliers"
    }
  ]
}
```

### direct-supplier-refund-direction

Description: `NEFT REFUND FROM NATIONAL OXYGEN SUPPLIERS`
Counterparty: `National Oxygen Suppliers`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "National Oxygen Suppliers",
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
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Transfer to Axis WCDL account with matching account number"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "HDFC Bank OD Account 7788",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Fund transfer to HDFC OD account 7788"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Cash deposit by self"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Office supplies stationery purchase"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund to Rajesh Trading Company"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "National Oxygen Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Refund from National Oxygen Suppliers"
    }
  ]
}
```

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
      "reason": "Interest credited by bank maps to Interest Credit ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges excluding GST maps to Bank Charges ledger."
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
      "reason": "Interest credited by bank maps to Interest Credit ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Bank service charges excluding GST maps to Bank Charges ledger."
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
