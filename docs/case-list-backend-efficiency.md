# All Cases backend optimization — local verification

## Database prerequisite

Read-only inspection of Kalika (`ktpaupxmlbtpjgvigmpb`) found missing
`packet_cases.deleted_at` and `packet_cases.search_text`. The API therefore uses
the compatibility path: fetch all owner rows, filter and paginate in memory.

Apply `supabase/migrations/20260904125720_case_list_query_indexes.sql` manually
to **Kalika only**, off-peak. It is transactional, preserves legacy recycle-bin
metadata, adds generated search text and active/deleted pagination + trigram
indexes. Lock acquisition times out after five seconds. It changes no RLS
policies or grants. No hosted migration was applied by this task.

## Code changes

- Project only list-required JSON metadata; preserve existing list presentation.
- Forward request cancellation to database requests, including compatibility reads.
- Validate cursors and bind them to scope/sort; honor oldest/name ordering and ties.
- Recognize missing search columns specifically, not arbitrary database errors.
- Expose query mode in existing slow-request logs, without search/customer content.
- Preserve exact page counts and legacy compatibility; no unbounded new cache.

## Verification

- API TypeScript check: passed.
- `node --test apps/api/src/lib/case-list-query.test.mjs`: four tests passed.
- Read-only hosted PostgREST projection probe: passed.
- Disposable PostgreSQL 17 database, 10,000 synthetic cases: migration applied
  twice, all records preserved, 1,000 legacy recycled records retained.
- EXPLAIN ANALYZE used active-owner pagination and trigram search indexes.
  Synthetic SQL execution: first ten rows 0.038 ms; selective search 0.169 ms.
  These exclude API authentication, network, exact counts and rendering, and are
  not production performance predictions.
- Latest-ten-row metadata sample: 38,454 bytes full versus 18,793 bytes needed
  by the list. This is metadata only, not the whole HTTP response.

Reproduce SQL tests only against a **fresh disposable database**:
`psql -v ON_ERROR_STOP=1 -d <disposable-db> -f scripts/fixtures/case-list-efficiency.sql`

## Remaining scope

The main improvement needs the manual migration. Afterwards measure actual API
Server-Timing and verify queryMode=database-pagination. Network/auth latency is
separate from SQL execution. Existing numbered pages still request exact counts
and use offsets; cursor requests avoid counts. Deep offsets can still be costly.

Frontend category/reconciliation/status controls still filter their current page;
this backend change does not fix their global-filter semantics or frontend cache.
A follow-up must move those derived filters to a server-wide contract and wire
the frontend, rather than claim this entire page is now fully optimized.

No deployment, GitHub push or installer change was made.
