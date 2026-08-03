# Tally Test Ledgers

Status: Reference note for local/manual testing.

## Core Bank Statement Test Ledgers

| Ledger name | Purpose |
|---|---|
| `Local Test Bank` | Test bank ledger used by sample bank statements. |
| `Suspense` | Fallback ledger when no safe counterparty match exists. |
| `Bharat Steels` | Counterparty ledger used in E2E checks. |
| `Office Supplies` | Expense/counterparty ledger used in E2E checks. |
| `Transport Vendor` | Counterparty ledger used in E2E checks. |

## AI Ledger Matching Edge-Case Ledgers

These are defined in `scripts/create-tally-test-ledgers.mjs`.

| Ledger name |
|---|
| `Kamal Traders` |
| `Kamla Traders` |
| `Kamaal Traders` |
| `Kamal Trading Co` |
| `Kamal Steel` |
| `Kamal Metal` |
| `Kamal Enterprises` |
| `Ambika Traders Malegaon Baramati Pune` |
| `Ambika Steel` |
| `Ambika Trading Co` |
| `Sargvny Traders` |
| `Sarvagny Traders` |
| `Sarang Traders` |
| `Sahil Transport And Suppliers` |
| `Sahil Steel Suppliers` |
| `Sahil Transport` |
| `Jai Bhagwan Banarasidas Jindal` |
| `Bangarsidas R Jindal` |
| `Manibhaddar Steel And Cement Company` |
| `Manibhadra Steel Cement Co` |
| `Axis Bank WCDL A/c 92108044607205` |
| `Axis Bank OD Account` |
| `Interest Credit` |
| `Bank Charges` |
| `Cash` |

## Generated Load-Test Ledgers

The ledger creation script can also generate bulk ledgers using this pattern:

| Pattern | Default count behavior |
|---|---|
| `AI Match Test Party 0001` |
| `AI Match Test Party 0002` |
| `AI Match Test Party 0003` |
| `...` |

By default, `scripts/create-tally-test-ledgers.mjs` targets `LEDGER_COUNT=1000`. It includes the edge-case ledgers first, then fills the remaining count with `AI Match Test Party ####` ledgers.

## Default Script Settings

| Setting | Default |
|---|---|
| Tally URL | `http://localhost:9000` |
| Group | `Sundry Debtors` |
| Ledger count | `1000` |
| Batch size | `100` |
| Prefix | `AI Match Test Party` |
| Edge cases | Included unless `INCLUDE_EDGE_CASES=0` |
| Dry run | Enabled unless `DRY_RUN=0` |
