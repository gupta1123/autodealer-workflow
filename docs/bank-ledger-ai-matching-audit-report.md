# Bank Ledger AI Matching Audit Report

Generated at: 2026-07-28T09:40:12.132Z

Model: `deepseek/deepseek-v4-pro`
Ledger file: `docs/tally-test-ledgers.md`
Prompt source: `apps/api/src/lib/bank-statement-ledger-matching.ts`
Ledger count: 30
Result: 27/29 passed

## Summary

| Case | Expected | Actual | Status | Reason |
|---|---|---|---|---|
| `sahil-tra-close-match` | close_match [Sahil Transport, Sahil Transport And Suppliers] | close_match [Sahil Transport And Suppliers, Sahil Transport] | PASS | Narration 'SAHIL TRA' suggests party root 'Sahil' and partial descriptor 'TRA' matching transport. Multiple existing ledgers fit: 'Sahil Transport' and 'Sahil Transport And Suppliers'. No single ledger is clearly unique. |
| `sahil-transp-close-match` | close_match [Sahil Transport, Sahil Transport And Suppliers] | close_match [Sahil Transport And Suppliers, Sahil Transport] | PASS | Narration 'SAHIL TRANSP' matches transport descriptor but two ledgers exist: 'Sahil Transport' and 'Sahil Transport And Suppliers'. Cannot determine which one uniquely. |
| `sahil-ste-direct-match` | direct_match -> Sahil Steel Suppliers | direct_match -> Sahil Steel Suppliers | PASS | Narration contains 'SAHIL STE', which uniquely matches 'Sahil Steel Suppliers' after removing bank noise. Descriptor 'STE' matches 'Steel', and no other Sahil ledger has that descriptor. |
| `sahil-root-close-match` | close_match [Sahil Transport, Sahil Transport And Suppliers, Sahil Steel Suppliers] | close_match [Sahil Transport And Suppliers, Sahil Steel Suppliers, Sahil Transport] | PASS | Narration only says 'SAHIL' without descriptor. Multiple Sahil ledgers exist with different business types. Cannot determine which one without additional context. |
| `sahil-sup-close-match` | close_match [Sahil Transport And Suppliers, Sahil Steel Suppliers] | close_match [Sahil Transport And Suppliers, Sahil Steel Suppliers, Sahil Transport] | FAIL | Narration 'SAHIL SUP' has party root 'Sahil' and partial descriptor 'SUP'. 'SUP' could match Suppliers, Transport And Suppliers, or Steel Suppliers. Three ledgers share the root 'Sahil' and have descriptors that could fit the partial token. Cannot safely choose one. |
| `kamal-trad-close-match` | close_match [Kamal Traders, Kamla Traders, Kamaal Traders, Kamal Trading Co] | close_match [Kamal Traders, Kamla Traders, Kamaal Traders, Kamal Trading Co] | PASS | Narration receipt from 'Kamal TRAD' (trading descriptor evident). Ledgers with same trading descriptor and near root: 'Kamal Traders', 'Kamla Traders', 'Kamaal Traders', 'Kamal Trading Co' share the party root 'Kamal' or OCR/spelling variants. Multiple plausible ledgers exist; cannot safely select one. |
| `kamal-root-close-match` | close_match [Kamal Traders, Kamla Traders, Kamaal Traders, Kamal Trading Co, Kamal Steel, Kamal Metal, Kamal Enterprises] | close_match [Kamal Traders, Kamla Traders, Kamaal Traders, Kamal Trading Co, Kamal Steel, Kamal Metal, Kamal Enterprises] | PASS | Narration only contains party root 'Kamal' without descriptor. Multiple ledgers share the root 'Kamal' or near spelling variants with different descriptors (Traders, Steel, Metal, Enterprises, etc.). Cannot determine which one is correct. |
| `kamla-traders-ocr-close-match` | close_match [Kamla Traders, Kamal Traders] | close_match [Kamla Traders, Kamal Traders, Kamaal Traders, Kamal Trading Co] | FAIL | Narration 'KAMLA TRADERS' matches trading descriptor. Multiple ledgers with similar party roots (Kamla, Kamal, Kamaal) and trading descriptor exist, creating an OCR/spelling collision. |
| `kamal-ste-direct-match` | direct_match -> Kamal Steel | direct_match -> Kamal Steel | PASS | Narration 'NEFT RECEIPT FROM KAMAL STE' contains party root 'Kamal' and descriptor 'STE' which uniquely identifies 'Kamal Steel' among other 'Kamal' ledgers. No collision with same-descriptor near-duplicates. |
| `kamal-metal-direct-match` | direct_match -> Kamal Metal | direct_match -> Kamal Metal | PASS | Narration 'KAMAL MET' clearly refers to 'Kamal Metal' ledger, which is the only ledger with matching party root and descriptor. |
| `kamal-enterprise-direct-match` | direct_match -> Kamal Enterprises | direct_match -> Kamal Enterprises | PASS | Narration 'KAMAL ENTERPRISE' matches ledger 'Kamal Enterprises' after case normalization and singular/plural handling. Party root 'Kamal' and enterprise descriptor are unique among existing ledgers. |
| `ambika-root-close-match` | close_match [Ambika Traders Malegaon Baramati Pune, Ambika Steel, Ambika Trading Co] | close_match [Ambika Traders Malegaon Baramati Pune, Ambika Steel, Ambika Trading Co] | PASS | Narration contains only 'Ambika' without any business descriptor. Multiple ledgers with root 'Ambika' exist (Ambika Traders Malegaon Baramati Pune, Ambika Steel, Ambika Trading Co). No descriptor to select one, so close match. |
| `ambika-trad-close-match` | close_match [Ambika Traders Malegaon Baramati Pune, Ambika Trading Co] | close_match [Ambika Traders Malegaon Baramati Pune, Ambika Trading Co] | PASS | Narration mentions AMBIKA TRAD, which matches two existing ledgers with the Ambika root and a trading descriptor: 'Ambika Traders Malegaon Baramati Pune' and 'Ambika Trading Co'. Unable to select one safely. |
| `ambika-steel-direct-match` | direct_match -> Ambika Steel | direct_match -> Ambika Steel | PASS | Narration explicitly states 'Ambika Steel', which is an exact existing ledger. No other ledger with root 'Ambika' has a steel descriptor. |
| `sarvagny-ocr-close-match` | close_match [Sargvny Traders, Sarvagny Traders] | close_match [Sargvny Traders, Sarvagny Traders] | PASS | Narration matches 'Sargvny Traders' exactly, but 'Sarvagny Traders' is a near OCR/spelling variant with the same trading descriptor; cannot safely choose one. |
| `sarang-traders-direct-match` | direct_match -> Sarang Traders | direct_match -> Sarang Traders | PASS | Narration contains 'SARANG TRADERS' which exactly matches the existing ledger 'Sarang Traders'. No other similar ledgers exist. |
| `manibhadra-ocr-close-match` | close_match [Manibhaddar Steel And Cement Company, Manibhadra Steel Cement Co] | close_match [Manibhaddar Steel And Cement Company, Manibhadra Steel Cement Co] | PASS | Two ledgers share the same party root and descriptor: Manibhadra Steel Cement Co and Manibhaddar Steel And Cement Company. The narration is ambiguous between them. |
| `jindal-root-close-match` | close_match [Jai Bhagwan Banarasidas Jindal, Bangarsidas R Jindal] | close_match [Jai Bhagwan Banarasidas Jindal, Bangarsidas R Jindal] | PASS | Narration contains only 'JINDAL', which matches multiple ledgers: Jai Bhagwan Banarasidas Jindal and Bangarsidas R Jindal. Unable to distinguish without additional descriptor. |
| `axis-bank-root-close-match` | close_match [Axis Bank WCDL A/c 92108044607205, Axis Bank OD Account] | close_match [Axis Bank WCDL A/c 92108044607205, Axis Bank OD Account] | PASS | Narration only mentions 'Axis Bank' without account subtype or number; two bank ledgers exist with Axis root. |
| `axis-account-direct-match` | direct_match -> Axis Bank WCDL A/c 92108044607205 | direct_match -> Axis Bank WCDL A/c 92108044607205 | PASS | Unique match with exact account number in narration. |
| `interest-credit-direct-match` | direct_match -> Interest Credit | direct_match -> Interest Credit | PASS | Exact match for interest credit transaction |
| `bank-charges-direct-match` | direct_match -> Bank Charges | direct_match -> Bank Charges | PASS | Narration explicitly mentions bank charges, and exactly one ledger 'Bank Charges' exists. |
| `cash-deposit-direct-match` | direct_match -> Cash | direct_match -> Cash | PASS | Narration is 'CASH DEPOSIT' and counterparty is 'Cash'. The existing ledger 'Cash' is a direct and unique match. |
| `office-supplies-direct-match` | direct_match -> Office Supplies | direct_match -> Office Supplies | PASS | Exact match with unique ledger 'Office Supplies'. No competing ledgers share the same root. |
| `transport-vendor-direct-match` | direct_match -> Transport Vendor | direct_match -> Transport Vendor | PASS | Exact match found: 'Transport Vendor' in tallyLedgers and no collision exists. |
| `generic-upi-suspense` | suspense | suspense | PASS | Generic UPI payment reference without identifiable party name |
| `sahil-tra-reject-wrong-saved-mapping` | close_match [Sahil Transport, Sahil Transport And Suppliers] | close_match [Sahil Transport And Suppliers, Sahil Transport] | PASS | Narration has 'Sahil TRA', which is a partial descriptor matching transport-related ledgers. Existing ledgers include 'Sahil Transport' and 'Sahil Transport And Suppliers', both sharing the same root and transport descriptor. The partial token 'TRA' matches both. 'Sahil Steel Suppliers' from saved mapping has a different descriptor (Steel) and is rejected. Two plausible transport ledgers exist, so close_match with suspense. |
| `reference-only-ignore-saved-mapping` | suspense | suspense | PASS | Narration contains only NEFT reference number, no identifiable party or category. |
| `reference-only-suspense` | suspense | suspense | PASS | Narration contains only a NEFT reference number; no party or category identifiable. |

## Details

### sahil-tra-close-match

Description: `NEFT RECEIPT FROM SAHIL TRA`
Counterparty: `Sahil TRA`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sahil Transport",
    "Sahil Transport And Suppliers"
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
        "Sahil Transport And Suppliers",
        "Sahil Transport"
      ],
      "confidence": 0,
      "bankPartyRoot": "Sahil",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'SAHIL TRA' suggests party root 'Sahil' and partial descriptor 'TRA' matching transport. Multiple existing ledgers fit: 'Sahil Transport' and 'Sahil Transport And Suppliers'. No single ledger is clearly unique."
    }
  ]
}
```

### sahil-transp-close-match

Description: `NEFT RECEIPT FROM SAHIL TRANSP`
Counterparty: `Sahil TRANSP`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sahil Transport",
    "Sahil Transport And Suppliers"
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
        "Sahil Transport And Suppliers",
        "Sahil Transport"
      ],
      "confidence": 0,
      "bankPartyRoot": "Sahil",
      "ledgerPartyRoot": null,
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'SAHIL TRANSP' matches transport descriptor but two ledgers exist: 'Sahil Transport' and 'Sahil Transport And Suppliers'. Cannot determine which one uniquely."
    }
  ]
}
```

### sahil-ste-direct-match

Description: `NEFT RECEIPT FROM SAHIL STE`
Counterparty: `Sahil STE`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Sahil Steel Suppliers",
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
      "ledgerName": "Sahil Steel Suppliers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "Sahil",
      "ledgerPartyRoot": "Sahil",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration contains 'SAHIL STE', which uniquely matches 'Sahil Steel Suppliers' after removing bank noise. Descriptor 'STE' matches 'Steel', and no other Sahil ledger has that descriptor."
    }
  ]
}
```

### sahil-root-close-match

Description: `NEFT RECEIPT FROM SAHIL`
Counterparty: `Sahil`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sahil Transport",
    "Sahil Transport And Suppliers",
    "Sahil Steel Suppliers"
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
        "Sahil Transport And Suppliers",
        "Sahil Steel Suppliers",
        "Sahil Transport"
      ],
      "confidence": 0,
      "bankPartyRoot": "Sahil",
      "ledgerPartyRoot": "Sahil",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration only says 'SAHIL' without descriptor. Multiple Sahil ledgers exist with different business types. Cannot determine which one without additional context."
    }
  ]
}
```

### sahil-sup-close-match

Description: `NEFT RECEIPT FROM SAHIL SUP`
Counterparty: `Sahil SUP`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sahil Transport And Suppliers",
    "Sahil Steel Suppliers"
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
        "Sahil Transport And Suppliers",
        "Sahil Steel Suppliers",
        "Sahil Transport"
      ],
      "confidence": 0,
      "bankPartyRoot": "Sahil",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'SAHIL SUP' has party root 'Sahil' and partial descriptor 'SUP'. 'SUP' could match Suppliers, Transport And Suppliers, or Steel Suppliers. Three ledgers share the root 'Sahil' and have descriptors that could fit the partial token. Cannot safely choose one."
    }
  ]
}
```

### kamal-trad-close-match

Description: `NEFT RECEIPT FROM KAMAL TRAD`
Counterparty: `Kamal TRAD`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Kamal Traders",
    "Kamla Traders",
    "Kamaal Traders",
    "Kamal Trading Co"
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
        "Kamal Traders",
        "Kamla Traders",
        "Kamaal Traders",
        "Kamal Trading Co"
      ],
      "confidence": 0,
      "bankPartyRoot": "kamal",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration receipt from 'Kamal TRAD' (trading descriptor evident). Ledgers with same trading descriptor and near root: 'Kamal Traders', 'Kamla Traders', 'Kamaal Traders', 'Kamal Trading Co' share the party root 'Kamal' or OCR/spelling variants. Multiple plausible ledgers exist; cannot safely select one."
    }
  ]
}
```

### kamal-root-close-match

Description: `NEFT RECEIPT FROM KAMAL`
Counterparty: `Kamal`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Kamal Traders",
    "Kamla Traders",
    "Kamaal Traders",
    "Kamal Trading Co",
    "Kamal Steel",
    "Kamal Metal",
    "Kamal Enterprises"
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
        "Kamal Traders",
        "Kamla Traders",
        "Kamaal Traders",
        "Kamal Trading Co",
        "Kamal Steel",
        "Kamal Metal",
        "Kamal Enterprises"
      ],
      "confidence": 0,
      "bankPartyRoot": "Kamal",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration only contains party root 'Kamal' without descriptor. Multiple ledgers share the root 'Kamal' or near spelling variants with different descriptors (Traders, Steel, Metal, Enterprises, etc.). Cannot determine which one is correct."
    }
  ]
}
```

### kamla-traders-ocr-close-match

Description: `NEFT RECEIPT FROM KAMLA TRADERS`
Counterparty: `Kamla Traders`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Kamla Traders",
    "Kamal Traders"
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
        "Kamla Traders",
        "Kamal Traders",
        "Kamaal Traders",
        "Kamal Trading Co"
      ],
      "confidence": 0,
      "bankPartyRoot": "kamla traders",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'KAMLA TRADERS' matches trading descriptor. Multiple ledgers with similar party roots (Kamla, Kamal, Kamaal) and trading descriptor exist, creating an OCR/spelling collision."
    }
  ]
}
```

### kamal-ste-direct-match

Description: `NEFT RECEIPT FROM KAMAL STE`
Counterparty: `Kamal STE`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Kamal Steel",
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
      "ledgerName": "Kamal Steel",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "kamal",
      "ledgerPartyRoot": "kamal",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'NEFT RECEIPT FROM KAMAL STE' contains party root 'Kamal' and descriptor 'STE' which uniquely identifies 'Kamal Steel' among other 'Kamal' ledgers. No collision with same-descriptor near-duplicates."
    }
  ]
}
```

### kamal-metal-direct-match

Description: `NEFT RECEIPT FROM KAMAL MET`
Counterparty: `Kamal MET`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Kamal Metal",
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
      "ledgerName": "Kamal Metal",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "Kamal Metal",
      "ledgerPartyRoot": "Kamal Metal",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'KAMAL MET' clearly refers to 'Kamal Metal' ledger, which is the only ledger with matching party root and descriptor."
    }
  ]
}
```

### kamal-enterprise-direct-match

Description: `NEFT RECEIPT FROM KAMAL ENTERPRISE`
Counterparty: `Kamal Enterprise`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Kamal Enterprises",
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
      "ledgerName": "Kamal Enterprises",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "kamal",
      "ledgerPartyRoot": "kamal",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration 'KAMAL ENTERPRISE' matches ledger 'Kamal Enterprises' after case normalization and singular/plural handling. Party root 'Kamal' and enterprise descriptor are unique among existing ledgers."
    }
  ]
}
```

### ambika-root-close-match

Description: `NEFT RECEIPT FROM AMBIKA`
Counterparty: `Ambika`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Ambika Traders Malegaon Baramati Pune",
    "Ambika Steel",
    "Ambika Trading Co"
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
        "Ambika Traders Malegaon Baramati Pune",
        "Ambika Steel",
        "Ambika Trading Co"
      ],
      "confidence": 0,
      "bankPartyRoot": "ambika",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration contains only 'Ambika' without any business descriptor. Multiple ledgers with root 'Ambika' exist (Ambika Traders Malegaon Baramati Pune, Ambika Steel, Ambika Trading Co). No descriptor to select one, so close match."
    }
  ]
}
```

### ambika-trad-close-match

Description: `NEFT RECEIPT FROM AMBIKA TRAD`
Counterparty: `Ambika TRAD`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Ambika Traders Malegaon Baramati Pune",
    "Ambika Trading Co"
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
        "Ambika Traders Malegaon Baramati Pune",
        "Ambika Trading Co"
      ],
      "confidence": 0,
      "bankPartyRoot": "Ambika",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration mentions AMBIKA TRAD, which matches two existing ledgers with the Ambika root and a trading descriptor: 'Ambika Traders Malegaon Baramati Pune' and 'Ambika Trading Co'. Unable to select one safely."
    }
  ]
}
```

### ambika-steel-direct-match

Description: `NEFT RECEIPT FROM AMBIKA STEEL`
Counterparty: `Ambika Steel`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Ambika Steel",
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
      "ledgerName": "Ambika Steel",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "bankPartyRoot": "Ambika Steel",
      "ledgerPartyRoot": "Ambika Steel",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration explicitly states 'Ambika Steel', which is an exact existing ledger. No other ledger with root 'Ambika' has a steel descriptor."
    }
  ]
}
```

### sarvagny-ocr-close-match

Description: `NEFT RECEIPT FROM SARGVNY TRADERS`
Counterparty: `Sargvny Traders`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sargvny Traders",
    "Sarvagny Traders"
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
        "Sargvny Traders",
        "Sarvagny Traders"
      ],
      "confidence": 0,
      "bankPartyRoot": "sargvny traders",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration matches 'Sargvny Traders' exactly, but 'Sarvagny Traders' is a near OCR/spelling variant with the same trading descriptor; cannot safely choose one."
    }
  ]
}
```

### sarang-traders-direct-match

Description: `NEFT RECEIPT FROM SARANG TRADERS`
Counterparty: `Sarang Traders`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Sarang Traders",
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
      "ledgerName": "Sarang Traders",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "sarang traders",
      "ledgerPartyRoot": "sarang traders",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration contains 'SARANG TRADERS' which exactly matches the existing ledger 'Sarang Traders'. No other similar ledgers exist."
    }
  ]
}
```

### manibhadra-ocr-close-match

Description: `NEFT RECEIPT FROM MANIBHADRA STEEL CEMENT`
Counterparty: `Manibhadra Steel Cement`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Manibhaddar Steel And Cement Company",
    "Manibhadra Steel Cement Co"
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
        "Manibhaddar Steel And Cement Company",
        "Manibhadra Steel Cement Co"
      ],
      "confidence": 0,
      "bankPartyRoot": "manibhadra steel cement",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Two ledgers share the same party root and descriptor: Manibhadra Steel Cement Co and Manibhaddar Steel And Cement Company. The narration is ambiguous between them."
    }
  ]
}
```

### jindal-root-close-match

Description: `NEFT RECEIPT FROM JINDAL`
Counterparty: `Jindal`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Jai Bhagwan Banarasidas Jindal",
    "Bangarsidas R Jindal"
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
        "Jai Bhagwan Banarasidas Jindal",
        "Bangarsidas R Jindal"
      ],
      "confidence": 0,
      "bankPartyRoot": "Jindal",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration contains only 'JINDAL', which matches multiple ledgers: Jai Bhagwan Banarasidas Jindal and Bangarsidas R Jindal. Unable to distinguish without additional descriptor."
    }
  ]
}
```

### axis-bank-root-close-match

Description: `NEFT TRANSFER TO AXIS BANK`
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
        "Axis Bank WCDL A/c 92108044607205",
        "Axis Bank OD Account"
      ],
      "confidence": 0,
      "bankPartyRoot": "Axis Bank",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration only mentions 'Axis Bank' without account subtype or number; two bank ledgers exist with Axis root."
    }
  ]
}
```

### axis-account-direct-match

Description: `NEFT TRANSFER TO AXIS BANK WCDL A/C 92108044607205`
Counterparty: `Axis Bank WCDL A/c 92108044607205`

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
      "bankPartyRoot": "Axis Bank WCDL A/c 92108044607205",
      "ledgerPartyRoot": "Axis Bank WCDL A/c 92108044607205",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Unique match with exact account number in narration."
    }
  ]
}
```

### interest-credit-direct-match

Description: `INTEREST CREDIT`
Counterparty: `Interest Credit`

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
      "confidence": 0.99,
      "bankPartyRoot": "Interest Credit",
      "ledgerPartyRoot": "Interest Credit",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Exact match for interest credit transaction"
    }
  ]
}
```

### bank-charges-direct-match

Description: `BANK CHARGES GST FOR NEFT`
Counterparty: `Bank Charges GST`

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
      "ledgerName": "Bank Charges",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "bankPartyRoot": null,
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration explicitly mentions bank charges, and exactly one ledger 'Bank Charges' exists."
    }
  ]
}
```

### cash-deposit-direct-match

Description: `CASH DEPOSIT`
Counterparty: `Cash`

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
      "ledgerName": "Cash",
      "candidateLedgerNames": [],
      "confidence": 0.99,
      "bankPartyRoot": "cash",
      "ledgerPartyRoot": "cash",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Narration is 'CASH DEPOSIT' and counterparty is 'Cash'. The existing ledger 'Cash' is a direct and unique match."
    }
  ]
}
```

### office-supplies-direct-match

Description: `UPI PAYMENT TO OFFICE SUPPLIES`
Counterparty: `Office Supplies`

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
      "ledgerName": "Office Supplies",
      "candidateLedgerNames": [],
      "confidence": 0.98,
      "bankPartyRoot": "Office Supplies",
      "ledgerPartyRoot": "Office Supplies",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Exact match with unique ledger 'Office Supplies'. No competing ledgers share the same root."
    }
  ]
}
```

### transport-vendor-direct-match

Description: `NEFT PAYMENT TO TRANSPORT VENDOR`
Counterparty: `Transport Vendor`

Expected:

```json
{
  "matchType": "direct_match",
  "ledgerName": "Transport Vendor",
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
      "ledgerName": "Transport Vendor",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "transport vendor",
      "ledgerPartyRoot": "transport vendor",
      "rootComparison": "same_root",
      "savedMappingDecision": "not_provided",
      "reason": "Exact match found: 'Transport Vendor' in tallyLedgers and no collision exists."
    }
  ]
}
```

### generic-upi-suspense

Description: `UPI PAYMENT 9188201001`
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
      "bankPartyRoot": null,
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Generic UPI payment reference without identifiable party name"
    }
  ]
}
```

### sahil-tra-reject-wrong-saved-mapping

Description: `NEFT RECEIPT FROM SAHIL TRA`
Counterparty: `Sahil TRA`

Expected:

```json
{
  "matchType": "close_match",
  "ledgerName": null,
  "candidateLedgerNames": [
    "Sahil Transport",
    "Sahil Transport And Suppliers"
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
        "Sahil Transport And Suppliers",
        "Sahil Transport"
      ],
      "confidence": 0,
      "bankPartyRoot": "sahil tra",
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "rejected",
      "reason": "Narration has 'Sahil TRA', which is a partial descriptor matching transport-related ledgers. Existing ledgers include 'Sahil Transport' and 'Sahil Transport And Suppliers', both sharing the same root and transport descriptor. The partial token 'TRA' matches both. 'Sahil Steel Suppliers' from saved mapping has a different descriptor (Steel) and is rejected. Two plausible transport ledgers exist, so close_match with suspense."
    }
  ]
}
```

### reference-only-ignore-saved-mapping

Description: `NEFT REF 928377001`
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
      "bankPartyRoot": null,
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "unclear",
      "reason": "Narration contains only NEFT reference number, no identifiable party or category."
    }
  ]
}
```

### reference-only-suspense

Description: `NEFT REF 928377001`
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
      "bankPartyRoot": null,
      "ledgerPartyRoot": null,
      "rootComparison": "unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Narration contains only a NEFT reference number; no party or category identifiable."
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
      "bankPartyRoot": "party root extracted from narration",
      "ledgerPartyRoot": "party root from selected ledger or null",
      "rootComparison": "same_root | different_root | unclear",
      "savedMappingDecision": "not_provided",
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

Generic party-root and descriptor rule:
Split the narration and ledger names into party-root tokens and meaningful descriptor tokens.
Party-root tokens identify the person/business name.
Descriptor tokens distinguish similar ledgers under the same root, such as trading, traders, steel, metal, transport, logistics, suppliers, enterprise, engineering, fabrication, construction, services, chemicals, hardware, fuel, bank, charges, interest, cash, and similar business/category words.
Do not ignore descriptors when more than one ledger has the same party root.
Use direct_match only if exactly one ledger matches the party root and all meaningful descriptor evidence visible in the narration.
Use close_match if two or more ledgers share the same party root and remain plausible because the narration has a shortened, incomplete, OCR-damaged, abbreviated, or ambiguous descriptor.
Use close_match, not suspense, when the narration has a distinctive party root and two or more current ledgers share that root but the narration has no descriptor to choose between them.
Use suspense only when the narration does not contain enough party-root or category evidence to identify any current ledgers safely.

Collision check before direct_match:
Before selecting any direct_match, find all ledgers that share the narration's party root.
Compare the narration's meaningful descriptor tokens with those ledgers.
Visible descriptor evidence narrows candidates. If the narration has a descriptor token that matches one descriptor family, include only ledgers under the same party root whose descriptors match that visible family. Do not include unrelated same-root descriptors only because they might be OCR mistakes.
If exactly one ledger remains, return direct_match.
If two or more ledgers remain, return close_match and include all plausible exact ledger names in candidateLedgerNames.
If no ledger remains, return suspense.
Never choose a ledger only because it has the highest similarity score when another ledger with the same root could also fit the shortened narration.
When returning close_match, candidateLedgerNames should include all ledgers that share the same descriptor family and have the same party root or a likely OCR/spelling variant of that root. Do not include only exact-root candidates if near-root spelling variants are also plausible.

OCR and spelling collision rule:
Even when one ledger name exactly matches the extracted text, check whether another ledger has the same descriptor and a very similar party root that could be an OCR/spelling variant.
If two ledgers differ only by likely OCR/spelling changes, missing letters, swapped adjacent letters, or small edit distance, return close_match with both exact ledger names.
Do not direct_match the exact text if the extracted party name could reasonably be an OCR variant of another existing ledger.
Exact text is not enough to direct_match when another current ledger has the same descriptor family and a party root differing only by one or two characters, inserted/missing letters, vowel changes, or swapped adjacent letters.
In that case, return close_match with the exact-text ledger and the near-duplicate ledger.

Partial and abbreviated token rule:
Shortened tokens are evidence, not exact proof.
A narration token can be a prefix of a ledger token, for example TRA can match traders, trading, transport, transporter, or travel; STE can match steel or steels; ENG can match engineering or engineers; SUP can match suppliers or supply; ENT can match enterprise or enterprises; FAB can match fabrication or fabricators.
For descriptor tokens, prefix matching must follow the actual token prefix after normalization. Do not treat a partial descriptor as matching an unrelated descriptor family. For example, STE can match Steel but must not match Transport; SUP can match Supplier/Supply but must not match Transport.
OCR/spelling collision checks apply mainly to party-root tokens. Do not use loose OCR assumptions to turn one business descriptor into an unrelated descriptor.
If a partial token matches multiple descriptor families or multiple ledgers under the same party root, return close_match.

Bank account ambiguity rule:
For bank, loan, OD, WCDL, CC, cash-credit, and account-number ledgers, the bank name alone is not enough for direct_match when more than one ledger shares that bank root.
Use direct_match for these ledgers only when the narration visibly includes the unique account subtype or account number, such as WCDL, OD, CC, or the account number itself.
If the narration says only "Axis Bank" and ledgers include "Axis Bank WCDL A/c 92108044607205" and "Axis Bank OD Account", use close_match with both ledgers.
If the narration says "Axis Bank WCDL A/c 92108044607205", use direct_match for "Axis Bank WCDL A/c 92108044607205".

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
Treat Trader, Traders, Trading, and Trade as the same trading descriptor when the party root is otherwise the same.
If the narration says "Kamal Trading" and ledgers include "Kamal Traders" and "Kamal Steel", prefer "Kamal Traders" because the root and trading descriptor align.
If the narration says only "Kamal" and ledgers include "Kamal Traders" and "Kamal Steel", use close_match because the descriptor is missing and both ledgers share the root.
If the narration says "Kamal TRAD" and ledgers include "Kamal Traders", "Kamla Traders", "Kamaal Traders", "Kamal Trading Co", and "Kamal Steel", use close_match with the trading-related exact-root and near-root ledgers, not "Kamal Steel".
If the narration says "Kamla Traders" and ledgers include "Kamla Traders" and "Kamal Traders", use close_match with both ledgers even though "Kamla Traders" is an exact text match, because "Kamla" and "Kamal" are near OCR/spelling variants with the same descriptor.
If the narration says "Sahil TRA" or "Sahil TRANSP" and ledgers include "Sahil Transport", "Sahil Transport And Suppliers", and "Sahil Steel Suppliers", use close_match with the transport-related ledgers, not "Sahil Steel Suppliers".
If the narration says "Ambika" and ledgers include "Ambika Steel" and "Ambika Trading Co", use close_match because the descriptor is missing.
If the narration says "Ambika TRAD" and ledgers include "Ambika Traders Malegaon Baramati Pune", "Ambika Trading Co", and "Ambika Steel", use close_match with the trading-related ledgers only, not "Ambika Steel".
If the narration says "Sargvny Traders" and ledgers include "Sargvny Traders" and "Sarvagny Traders", use close_match because they are OCR/spelling variants with the same trading descriptor.
If the narration says "Manibhadra Steel Cement" and ledgers include "Manibhadra Steel Cement Co" and "Manibhaddar Steel And Cement Company", use close_match with both ledgers because the party roots are near OCR/spelling variants and the descriptors align.
If the narration says "Kamal STE" and ledgers include "Kamal Traders" and "Kamal Steel", use direct_match for "Kamal Steel" because the descriptor uniquely identifies it.
If the narration contains only bank reference numbers, UTRs, RRN, account codes, or a generic payment mode, use suspense with no candidates.
A named party ledger is preferred over a generic expense-category ledger when both are available.
Never confuse different party roots based only on one shared word, partial string, or loose phonetic resemblance.

Party-root validation:
For every row, extract the bankPartyRoot from the narration after removing bank-system noise and legal suffixes.
For any selected ledger, extract ledgerPartyRoot from the ledger name.
Use direct_match only when bankPartyRoot and ledgerPartyRoot are the same party root or a safe spelling/OCR variant of the same party root.
Generic business words such as traders, trading, steel, metal, transport, enterprise, company, industries, services, supplier, customer, payment, receipt, and private limited are not party roots by themselves.
Names with different roots must not be matched even when one descriptor or one generic word overlaps.

Saved mapping hint:
The user input may include savedMapping. This is historical context only, not an automatic match.
First evaluate the bank narration against current tallyLedgers using the direct_match, close_match, and suspense rules above.
Use savedMapping only when no safer current-ledger match exists, the saved mapping ledger exists in tallyLedgers, and the saved mapping passes the same party-root validation.
If savedMapping points to a different party root, set savedMappingDecision to "rejected" and do not select it.
If savedMapping is selected after validation, set savedMappingDecision to "used".
If savedMapping is absent, set savedMappingDecision to "not_provided".
If savedMapping is present but not needed, set savedMappingDecision to "ignored".
If savedMapping cannot be validated, set savedMappingDecision to "unclear" and use close_match or suspense.

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
