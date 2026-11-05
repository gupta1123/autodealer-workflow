# How We Work in This Project (Kalika)

Read this before changing, testing, or deploying anything. It is for people and for AI agents.
Written 2026-11-05. Items marked **(to set up)** are the agreed target, not what exists today.

## 1. What is deployed where

| Part | Folder | Where it runs | How it gets there |
|---|---|---|---|
| Web app | `apps/web` | Netlify | Auto-builds when `main` on GitHub is pushed. Build: `npm run build:web`. Publish dir: `apps/web/.next-build`. Node 24, npm 11. |
| API + worker | `apps/api` | Heroku app `autodealer-workflow` (web + worker dynos, see `Procfile`) | `git push heroku HEAD:main`. Heroku runs `heroku-postbuild` (`build:api`). |
| Tally connector (local agent) | `apps/tally-bridge`, `installer/` | Installed on each client PC | Tag `local-agent-v*` runs the GitHub Action `release-local-agent.yml` (beta or stable channel, staged rollout). |
| Database | `supabase/` | Supabase | Migrations are run by hand today. |

Remotes on this machine: `github` (`gupta1123/autodealer-workflow`) and `heroku`.
The older `docs/workflow-deployment-remotes-guide.md` is from another machine and partly out of date (it has the old Netlify publish path and remotes that are not set up here).

The website/API and the connector deploy separately. A website or API change does **not** need a new connector. Clients can be on different connector versions at the same time, so keep the API working with the last two connector versions.

## 2. Git rules

- Normal pushes, no pull requests, and no new CI. Commit, then push. Keep it simple. Checks are run by hand (section 5). The two GitHub workflows that already exist (`purchase-posting.yml` tests and `release-local-agent.yml` connector build) stay as they are; do not add more.
- `main` is production. Whatever is on `main` is what is (or is about to be) live. Aim to work from `main`, not from long-lived side branches like `codex/kalika-deploy`.
- Short-lived branches are fine for risky work. Merge, then delete them.
- Tag every production release so rollback is easy, for example `web-2026-11-05`, `api-v218`, `local-agent-v1.2.43`. A tag like `kalika-working-2026-09-30` is the known-good baseline.
- Do not keep dated backup branches. Use tags.
- Commit only what you mean to. Never `git add -A` blindly. Check `git status` first.
- Never commit: `.env*`, `node_modules`, `.next*`, client PDFs, `downloads/`, `outputs/`, logs, screenshots, zips.

## 3. Keep the folder clean

- Client documents and exports (failed-case PDFs, Tally exports) go **outside the repo** (for example `~/Kalika-Data/`), never inside it.
- Throwaway test scripts go in a scratch directory, not the repo root. If a script is useful long term, put it in `scripts/` or `ops/` and commit it on purpose.
- Delete `node_modules.broken-*`, stale `.next-*` folders, old zips and stray logs.
- `git status` should be empty, or show only the work you are doing right now.

## 4. Environments

- **Local:** your own Tally and a dev database. Test posting and parsing here first. Use a test company, never a client's. Never insert test vouchers into past dates of auto-renumber voucher types.
- **Staging (to set up):** a second Heroku app, a Netlify branch/preview deploy, and a separate Supabase project with test data. Everything is tried here before production.
- **Production:** deploys come only from `main`.

## 5. Making a change (the flow)

1. Make the change on `main` (or a short branch).
2. Test locally. Run the checks that match what you touched:
   - Web: `npm run typecheck:web` and `npm run build:web` (build catches lint errors that tsc misses).
   - API: `npm run typecheck:api` and `npm run build:api`.
   - Tally/purchase code: `npm run test:purchase-posting`, `npm run test:purchase-master-matching`, `npm run test:tally-bridge`.
3. Commit with a clear message.
4. Push `main` to GitHub (Netlify builds the web app from it).
5. If the API changed, push the same commit to Heroku: `git push heroku HEAD:main`, then check logs: `heroku logs --tail --app autodealer-workflow`.
6. Tag the release.
7. If the connector changed, make a separate connector release (beta first, then stable with staged rollout).

**Ask the owner before:** pushing to `main`, deploying to Heroku, or making any code change that has not been agreed. Netlify has a build limit, so batch web changes into one push and do not poll Netlify.

## 6. Database changes

- Every schema change is a migration file in `supabase/`, committed and applied in order. Do not make schema changes only by hand.
- One-off data fixes (for example editing a client's settings) are saved as a script with an undo file, then committed under `ops/` (to set up).

## 7. Rollback

- API: `heroku rollback --app autodealer-workflow`.
- Web: in Netlify, publish the previous deploy.
- Connector: ship the previous installer or version.
- Or go back to the last release tag.

## 8. Things that have bitten us (read these)

- **Tally:** large XML exports hang Tally. Use small, filtered queries. Past-dated inserts on auto-renumber voucher types renumber real invoices.
- **Posting uncertainty:** the connector waits only 30 seconds for Tally to import a purchase voucher. A timeout shows "not sure whether it is posted". Always verify in Tally (read-only) before re-sending, or you create duplicates.
- **Dev server:** do not run frontend `tsc` while `next dev` is running. It corrupts the `.next` cache. If you get 404s, delete `.next` and restart.
- **Workers:** "stopped for low memory" often leaves node workers running. Check before restarting.
- **Heroku:** the web dyno runs near its memory limit. Never print `heroku config` unfiltered (it contains secrets such as `WORKER_SECRET`).
- **AI provider:** OpenRouter credit limits can fail many analyses at once. Check the balance when many cases fail together.
- **Secrets:** if a token appears in chat, a terminal, a screenshot or a file, revoke it and create a new one.

## 9. For AI agents

- Investigate and test in a scratchpad. Ask before editing repo code.
- Read a file before editing it. Use the Edit tool, not patch scripts.
- Do not commit, push, or deploy unless asked.
- Do not commit `downloads/`, `outputs/` or any client data.
- Commit messages end with the attribution line given in your instructions.
- When unsure whether something is live, check the actual state (git, Heroku, Netlify, Supabase). Do not guess.

## 10. Cleanup and setup still to do

1. Gitignore: `downloads/`, `outputs/`, `.codex-run/`, `.next-*`, `*.stackdump`, screenshots, logs.
2. Commit the supplier invoice date change on its own (`purchase-posting.ts` and its test).
3. Decide on the unfinished connector and bank-statement work (`tally-bridge` parser/package files, `bank-statement-layout.mjs`).
4. Delete old `.broken` folders, zips and dated backup branches (tag first if needed).
5. Move to working from `main` instead of `codex/kalika-deploy`.
6. Create staging (Heroku app, Netlify preview, Supabase project).
7. Update `docs/workflow-deployment-remotes-guide.md` or fold it into this file.
