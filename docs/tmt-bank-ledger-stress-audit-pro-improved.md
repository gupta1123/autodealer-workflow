# Bank Ledger AI Matching Audit Report

Generated at: 2026-08-04T18:06:06.179Z

Model: `deepseek/deepseek-v4-pro`
Ledger file: `scripts\fixtures\tmt-bank-ledgers.json`
Prompt source: `apps\api\src\lib\bank-statement-ledger-matching.ts`
Ledger count: 1089
Batch size: 3
Result: 26/26 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `stress-generated-0001` | direct_match -> TMT Load Test Party 0001 | direct_match -> TMT Load Test Party 0001 | PASS | Narration exactly matches existing ledger. |
| `stress-generated-0002` | direct_match -> TMT Load Test Party 0002 | direct_match -> TMT Load Test Party 0002 | PASS | Narration exactly matches existing ledger. |
| `stress-generated-0010` | direct_match -> TMT Load Test Party 0010 | direct_match -> TMT Load Test Party 0010 | PASS | Narration exactly matches existing ledger. |
| `stress-generated-0099` | direct_match -> TMT Load Test Party 0099 | direct_match -> TMT Load Test Party 0099 | PASS | Exact match between narration and ledger name |
| `stress-generated-0100` | direct_match -> TMT Load Test Party 0100 | direct_match -> TMT Load Test Party 0100 | PASS | Exact match between narration and ledger name |
| `stress-generated-0250` | direct_match -> TMT Load Test Party 0250 | direct_match -> TMT Load Test Party 0250 | PASS | Exact match between narration and ledger name |
| `stress-generated-0500` | direct_match -> TMT Load Test Party 0500 | direct_match -> TMT Load Test Party 0500 | PASS | Description explicitly names TMT LOAD TEST PARTY 0500, which exactly matches the existing ledger. |
| `stress-generated-0750` | direct_match -> TMT Load Test Party 0750 | direct_match -> TMT Load Test Party 0750 | PASS | Description explicitly names TMT LOAD TEST PARTY 0750, which exactly matches the existing ledger. |
| `stress-generated-0999` | direct_match -> TMT Load Test Party 0999 | direct_match -> TMT Load Test Party 0999 | PASS | Description explicitly names TMT LOAD TEST PARTY 0999, which exactly matches the existing ledger. |
| `stress-generated-1000` | direct_match -> TMT Load Test Party 1000 | direct_match -> TMT Load Test Party 1000 | PASS | Description 'RTGS TMT LOAD TEST PARTY 1000' exactly matches the full name of ledger 'TMT Load Test Party 1000' after removing RTGS noise. No other ledger shares this exact number. |
| `stress-core-customer` | direct_match -> Shree Balaji Steels Pvt Ltd | direct_match -> Shree Balaji Steels Pvt Ltd | PASS | Description 'NEFT SHREE BALAJI STEELS PVT LTD' matches ledger 'Shree Balaji Steels Pvt Ltd' exactly after removing NEFT noise. No collision exists with other Balaji ledgers carrying distinct descriptors or suffixes. |
| `stress-core-supplier` | direct_match -> JSW Steel Limited | direct_match -> JSW Steel Limited | PASS | Description 'RTGS JSW STEEL LIMITED' matches ledger 'JSW Steel Limited' exactly after removing RTGS noise. The unique suffix 'Limited' distinguishes it from 'JSW Steel Coated Products Limited' and other JSW entries. |
| `stress-core-transporter` | direct_match -> Shree Balaji Roadlines | direct_match -> Shree Balaji Roadlines | PASS | Description 'NEFT SHREE BALAJI ROADLINES' matches exactly the existing ledger 'Shree Balaji Roadlines'. No other ledger shares the complete party root with 'Roadlines' descriptor. Collision check passed. |
| `stress-core-statutory` | direct_match -> TDS Payable 194Q | direct_match -> TDS Payable 194Q | PASS | Description explicitly states 'OLTAS TDS SECTION 194Q', uniquely identifying the existing ledger 'TDS Payable 194Q'. No other TDS section collides for 194Q. |
| `stress-core-bank-account` | direct_match -> Axis Bank WCDL A/c 92108044607205 | direct_match -> Axis Bank WCDL A/c 92108044607205 | PASS | Description 'TRANSFER AXIS WCDL 92108044607205' uniquely identifies the loan account 'Axis Bank WCDL A/c 92108044607205' via explicit WCDL abbreviation and matching account number. No other Axis ledger shares the WCDL loan type with identical digits. |
| `stress-suspense-ref-1` | suspense | suspense | PASS | Narration contains only bank reference NEFT REF 81000001, no identifiable party or purpose. |
| `stress-suspense-ref-2` | suspense | suspense | PASS | Narration contains only UPI 81000002, no identifiable party or purpose. |
| `stress-suspense-ref-3` | suspense | suspense | PASS | Narration contains only IMPS REF 81000003 IFSC HDFC0001, no identifiable party or purpose. |
| `stress-suspense-ref-4` | suspense | suspense | PASS | No matching ledger for transfer to account XX8104 |
| `stress-suspense-ref-5` | suspense | suspense | PASS | Only UTR number, no identifiable party or purpose |
| `stress-close-ganesh` | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | close_match [Ganesh Steel Pune, Ganesh Steel Nashik] | PASS | GANESH STEEL matches two distinct location-based ledgers |
| `stress-close-jsw` | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | close_match [JSW Steel Limited, JSW Steel Coated Products Limited] | PASS | Description 'JSW STEEL' collides with both JSW Steel Limited and JSW Steel Coated Products Limited; no unique identifier available. |
| `stress-close-hdfc` | close_match [HDFC Bank Current Account 1234, HDFC Bank OD Account 7788] | close_match [HDFC Bank Current Account 1234, HDFC Bank OD Account 7788] | PASS | Transfer to HDFC Bank without account number or type collides with both HDFC Bank Current Account 1234 and HDFC Bank OD Account 7788. |
| `stress-close-tds` | close_match [TDS Payable 194C, TDS Payable 194Q] | close_match [TDS Payable 194C, TDS Payable 194Q] | PASS | Generic OLTAS TDS PAYMENT does not identify section; both TDS Payable 194C and TDS Payable 194Q are plausible. |
| `stress-close-manibhadra` | close_match [Manibhadra Steel Cement Co, Manibhaddar Steel And Cement Company] | close_match [Manibhadra Steel Cement Co, Manibhaddar Steel And Cement Company] | PASS | Collision between Manibhadra Steel Cement Co and Manibhaddar Steel And Cement Company; both plausible for MANIBHADRA STEEL CEMENT. |
| `stress-boundary-row-26` | direct_match -> Rajesh Trading Company | direct_match -> Rajesh Trading Company | PASS | Description exactly matches existing ledger Rajesh Trading Company, no collision. |

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
      "reason": "Narration exactly matches existing ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration exactly matches existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration exactly matches existing ledger."
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
      "reason": "Narration exactly matches existing ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration exactly matches existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration exactly matches existing ledger."
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
      "reason": "Narration exactly matches existing ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0002",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration exactly matches existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0010",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Narration exactly matches existing ledger."
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
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
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
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
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
      "ledgerName": "TMT Load Test Party 0099",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0100",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0250",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Exact match between narration and ledger name"
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
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0500, which exactly matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0750, which exactly matches the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0999, which exactly matches the existing ledger."
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
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0500, which exactly matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0750, which exactly matches the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0999, which exactly matches the existing ledger."
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
      "ledgerName": "TMT Load Test Party 0500",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0500, which exactly matches the existing ledger."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0750",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0750, which exactly matches the existing ledger."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TMT Load Test Party 0999",
      "candidateLedgerNames": [],
      "confidence": 1,
      "reason": "Description explicitly names TMT LOAD TEST PARTY 0999, which exactly matches the existing ledger."
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
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'RTGS TMT LOAD TEST PARTY 1000' exactly matches the full name of ledger 'TMT Load Test Party 1000' after removing RTGS noise. No other ledger shares this exact number."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'NEFT SHREE BALAJI STEELS PVT LTD' matches ledger 'Shree Balaji Steels Pvt Ltd' exactly after removing NEFT noise. No collision exists with other Balaji ledgers carrying distinct descriptors or suffixes."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'RTGS JSW STEEL LIMITED' matches ledger 'JSW Steel Limited' exactly after removing RTGS noise. The unique suffix 'Limited' distinguishes it from 'JSW Steel Coated Products Limited' and other JSW entries."
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
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'RTGS TMT LOAD TEST PARTY 1000' exactly matches the full name of ledger 'TMT Load Test Party 1000' after removing RTGS noise. No other ledger shares this exact number."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'NEFT SHREE BALAJI STEELS PVT LTD' matches ledger 'Shree Balaji Steels Pvt Ltd' exactly after removing NEFT noise. No collision exists with other Balaji ledgers carrying distinct descriptors or suffixes."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'RTGS JSW STEEL LIMITED' matches ledger 'JSW Steel Limited' exactly after removing RTGS noise. The unique suffix 'Limited' distinguishes it from 'JSW Steel Coated Products Limited' and other JSW entries."
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
      "ledgerName": "TMT Load Test Party 1000",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'RTGS TMT LOAD TEST PARTY 1000' exactly matches the full name of ledger 'TMT Load Test Party 1000' after removing RTGS noise. No other ledger shares this exact number."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Shree Balaji Steels Pvt Ltd",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'NEFT SHREE BALAJI STEELS PVT LTD' matches ledger 'Shree Balaji Steels Pvt Ltd' exactly after removing NEFT noise. No collision exists with other Balaji ledgers carrying distinct descriptors or suffixes."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "JSW Steel Limited",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'RTGS JSW STEEL LIMITED' matches ledger 'JSW Steel Limited' exactly after removing RTGS noise. The unique suffix 'Limited' distinguishes it from 'JSW Steel Coated Products Limited' and other JSW entries."
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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description 'NEFT SHREE BALAJI ROADLINES' matches exactly the existing ledger 'Shree Balaji Roadlines'. No other ledger shares the complete party root with 'Roadlines' descriptor. Collision check passed."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.97,
      "reason": "Description explicitly states 'OLTAS TDS SECTION 194Q', uniquely identifying the existing ledger 'TDS Payable 194Q'. No other TDS section collides for 194Q."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'TRANSFER AXIS WCDL 92108044607205' uniquely identifies the loan account 'Axis Bank WCDL A/c 92108044607205' via explicit WCDL abbreviation and matching account number. No other Axis ledger shares the WCDL loan type with identical digits."
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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description 'NEFT SHREE BALAJI ROADLINES' matches exactly the existing ledger 'Shree Balaji Roadlines'. No other ledger shares the complete party root with 'Roadlines' descriptor. Collision check passed."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.97,
      "reason": "Description explicitly states 'OLTAS TDS SECTION 194Q', uniquely identifying the existing ledger 'TDS Payable 194Q'. No other TDS section collides for 194Q."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'TRANSFER AXIS WCDL 92108044607205' uniquely identifies the loan account 'Axis Bank WCDL A/c 92108044607205' via explicit WCDL abbreviation and matching account number. No other Axis ledger shares the WCDL loan type with identical digits."
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
      "ledgerName": "Shree Balaji Roadlines",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "reason": "Description 'NEFT SHREE BALAJI ROADLINES' matches exactly the existing ledger 'Shree Balaji Roadlines'. No other ledger shares the complete party root with 'Roadlines' descriptor. Collision check passed."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "TDS Payable 194Q",
      "candidateLedgerNames": [],
      "confidence": 0.97,
      "reason": "Description explicitly states 'OLTAS TDS SECTION 194Q', uniquely identifying the existing ledger 'TDS Payable 194Q'. No other TDS section collides for 194Q."
    },
    {
      "index": 2,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Axis Bank WCDL A/c 92108044607205",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description 'TRANSFER AXIS WCDL 92108044607205' uniquely identifies the loan account 'Axis Bank WCDL A/c 92108044607205' via explicit WCDL abbreviation and matching account number. No other Axis ledger shares the WCDL loan type with identical digits."
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
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only bank reference NEFT REF 81000001, no identifiable party or purpose."
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only UPI 81000002, no identifiable party or purpose."
    },
    {
      "index": 2,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only IMPS REF 81000003 IFSC HDFC0001, no identifiable party or purpose."
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
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only bank reference NEFT REF 81000001, no identifiable party or purpose."
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only UPI 81000002, no identifiable party or purpose."
    },
    {
      "index": 2,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only IMPS REF 81000003 IFSC HDFC0001, no identifiable party or purpose."
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
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only bank reference NEFT REF 81000001, no identifiable party or purpose."
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only UPI 81000002, no identifiable party or purpose."
    },
    {
      "index": 2,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Narration contains only IMPS REF 81000003 IFSC HDFC0001, no identifiable party or purpose."
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
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No matching ledger for transfer to account XX8104"
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Only UTR number, no identifiable party or purpose"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "GANESH STEEL matches two distinct location-based ledgers"
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
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No matching ledger for transfer to account XX8104"
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Only UTR number, no identifiable party or purpose"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "GANESH STEEL matches two distinct location-based ledgers"
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
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "No matching ledger for transfer to account XX8104"
    },
    {
      "index": 1,
      "matchType": "suspense",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [],
      "confidence": 0,
      "reason": "Only UTR number, no identifiable party or purpose"
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Ganesh Steel Pune",
        "Ganesh Steel Nashik"
      ],
      "confidence": 0,
      "reason": "GANESH STEEL matches two distinct location-based ledgers"
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "JSW Steel Limited",
        "JSW Steel Coated Products Limited"
      ],
      "confidence": 0,
      "reason": "Description 'JSW STEEL' collides with both JSW Steel Limited and JSW Steel Coated Products Limited; no unique identifier available."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank without account number or type collides with both HDFC Bank Current Account 1234 and HDFC Bank OD Account 7788."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "Generic OLTAS TDS PAYMENT does not identify section; both TDS Payable 194C and TDS Payable 194Q are plausible."
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "JSW Steel Limited",
        "JSW Steel Coated Products Limited"
      ],
      "confidence": 0,
      "reason": "Description 'JSW STEEL' collides with both JSW Steel Limited and JSW Steel Coated Products Limited; no unique identifier available."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank without account number or type collides with both HDFC Bank Current Account 1234 and HDFC Bank OD Account 7788."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "Generic OLTAS TDS PAYMENT does not identify section; both TDS Payable 194C and TDS Payable 194Q are plausible."
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "JSW Steel Limited",
        "JSW Steel Coated Products Limited"
      ],
      "confidence": 0,
      "reason": "Description 'JSW STEEL' collides with both JSW Steel Limited and JSW Steel Coated Products Limited; no unique identifier available."
    },
    {
      "index": 1,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "HDFC Bank Current Account 1234",
        "HDFC Bank OD Account 7788"
      ],
      "confidence": 0,
      "reason": "Transfer to HDFC Bank without account number or type collides with both HDFC Bank Current Account 1234 and HDFC Bank OD Account 7788."
    },
    {
      "index": 2,
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "TDS Payable 194C",
        "TDS Payable 194Q"
      ],
      "confidence": 0,
      "reason": "Generic OLTAS TDS PAYMENT does not identify section; both TDS Payable 194C and TDS Payable 194Q are plausible."
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Collision between Manibhadra Steel Cement Co and Manibhaddar Steel And Cement Company; both plausible for MANIBHADRA STEEL CEMENT."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description exactly matches existing ledger Rajesh Trading Company, no collision."
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
      "matchType": "close_match",
      "action": "use_suspense",
      "ledgerName": null,
      "candidateLedgerNames": [
        "Manibhadra Steel Cement Co",
        "Manibhaddar Steel And Cement Company"
      ],
      "confidence": 0,
      "reason": "Collision between Manibhadra Steel Cement Co and Manibhaddar Steel And Cement Company; both plausible for MANIBHADRA STEEL CEMENT."
    },
    {
      "index": 1,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Rajesh Trading Company",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "reason": "Description exactly matches existing ledger Rajesh Trading Company, no collision."
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
An exact textual match does not override a spelling/OCR-twin collision or a conflict with counterpartyName. However, a narration that supplies one complete ledger identity, including its distinctive descriptors or its stated terminal legal suffix, may directly match that ledger when the only alternative merely extends a shorter root into a different product, division, or entity name.
Do not use ledger group, customer/supplier role, debit/credit direction, amount, or category to choose between colliding names.
When a real collision exists, return close_match and include every plausible colliding ledger, not only the closest one.
Use token boundaries when identifying roots: OM may match ledgers beginning with the separate token OM, but OM must not match OMKAR merely because the letters are a prefix.

Collision examples:
- MAHAVIR STEEL TRADERS collides with Mahavir Steel Traders and Mahaveer Steel Traders, so return close_match even though one spelling is exact.
- JSW STEEL collides with JSW Steel Limited and JSW Steel Coated Products Limited, but the complete name JSW STEEL LIMITED directly matches JSW Steel Limited.
- TATA STEEL collides with Tata Steel Limited and Tata Steel Downstream Products Limited, but TATA STEEL DOWNSTREAM PRODUCTS LIMITED directly matches the downstream-products ledger.
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
