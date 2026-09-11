# Purchase voucher large-catalogue validation

Measured on the Kalika development machine on 8 September 2026 with Node's high-resolution timer. The benchmark executes the production search and ranking functions in `apps/web/src/lib/purchase-master-performance.ts`.

| Catalogue | Ledger index | Stock index | Open p95 | Keyboard search p95 | Ledger ranking p95 | Stock ranking p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 masters | 10.93 ms | 6.68 ms | 0.09 ms | 0.73 ms | 11.20 ms | 11.41 ms |
| 50,000 masters | 57.12 ms | 39.17 ms | 0.02 ms | 2.59 ms | 28.41 ms | 47.38 ms |

The immutable search index is built once per catalogue array and shared by every combobox. Dropdown rendering is capped at 120 options. Role and item rankings keep only the best eight candidates without sorting the complete catalogue, and edit-time results are cached. Every measured initial preparation and warm interaction remained below the 100 ms target.

Re-run with:

```powershell
npm run test:purchase-master-performance
```
