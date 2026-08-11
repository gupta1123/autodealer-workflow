# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T17:20:38.428Z

Model: `deepseek/deepseek-v4-flash-0731`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 89
Batch size: 12
Result: 13/13 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `direct-customer-exact` | direct_match -> Shree Balaji Steels Pvt Ltd | direct_match -> Shree Balaji Steels Pvt Ltd | PASS | Exact ledger match for Shree Balaji Steels Pvt Ltd |
| `direct-customer-legal-suffix-omitted` | direct_match -> Shree Balaji Steels Pvt Ltd | direct_match -> Shree Balaji Steels Pvt Ltd | PASS | Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix |
| `direct-customer-location-pune` | direct_match -> Balaji TMT Depot Pune | direct_match -> Balaji TMT Depot Pune | PASS | Exact ledger match for Balaji TMT Depot Pune |
| `direct-customer-joined-name` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | RajeshTradingCompany normalizes to Rajesh Trading Company |
| `direct-supplier-jsw-full` | direct_match -> JSW Steel Limited | direct_match -> JSW Steel Limited | PASS | Exact ledger match for JSW Steel Limited |
| `direct-supplier-tata-downstream` | direct_match -> Tata Steel Downstream Products Limited | direct_match -> Tata Steel Downstream Products Limited | PASS | Exact ledger match for Tata Steel Downstream Products Ltd |
| `direct-scrap-supplier` | direct_match -> Shakti Scrap Traders | direct_match -> Shakti Scrap Traders | PASS | Exact ledger match for Shakti Scrap Traders |
| `direct-sponge-iron-supplier` | direct_match -> Shakti Sponge Iron Suppliers | direct_match -> Shakti Sponge Iron Suppliers | PASS | Exact ledger match for Shakti Sponge Iron Suppliers |
| `direct-ferro-alloys-supplier` | direct_match -> Shakti Ferro Alloys | direct_match -> Shakti Ferro Alloys | PASS | Exact ledger match for Shakti Ferro Alloys |
| `direct-roadlines-vendor` | direct_match -> Shree Balaji Roadlines | direct_match -> Shree Balaji Roadlines | PASS | Exact ledger match for Shree Balaji Roadlines |
| `direct-transport-vendor` | direct_match -> Shree Balaji Transport | direct_match -> Shree Balaji Transport | PASS | Exact ledger match for Shree Balaji Transport |
| `direct-engineering-vendor` | direct_match -> Om Engineering Works | direct_match -> Om Engineering Works | PASS | Exact ledger match for Om Engineering Works |
| `direct-customer-refund-direction` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Narration explicitly identifies Rajesh Trading Company, and an exact matching ledger exists. |

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
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
    }
  ]
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Steels Pvt Ltd"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Shree Balaji Steels matches Shree Balaji Steels Pvt Ltd ignoring legal suffix"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Balaji TMT Depot Pune",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Balaji TMT Depot Pune"
    },
    {
      "index": 3,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "RajeshTradingCompany normalizes to Rajesh Trading Company"
    },
    {
      "index": 4,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for JSW Steel Limited"
    },
    {
      "index": 5,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Tata Steel Downstream Products Limited",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Tata Steel Downstream Products Ltd"
    },
    {
      "index": 6,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Scrap Traders",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Scrap Traders"
    },
    {
      "index": 7,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Sponge Iron Suppliers",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Sponge Iron Suppliers"
    },
    {
      "index": 8,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shakti Ferro Alloys",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shakti Ferro Alloys"
    },
    {
      "index": 9,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Roadlines"
    },
    {
      "index": 10,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Transport",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Shree Balaji Transport"
    },
    {
      "index": 11,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Om Engineering Works",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Exact ledger match for Om Engineering Works"
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
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Narration explicitly identifies Rajesh Trading Company, and an exact matching ledger exists."
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
