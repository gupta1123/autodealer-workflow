# Workflow Deployment Remotes Guide

This document records the local repositories and remotes found on this machine for Kalika, Polaad, and Gajkesari, plus the deployment commands for Heroku and Netlify.

## Quick Rules

- Deploy backend/worker with the `heroku` remote for that project.
- Deploy frontend either by pushing to the GitHub repo connected to Netlify, or by using Netlify CLI directly.
- Push source code to the team `nyx-solutions-team` GitHub remote separately from deploy remotes.
- Before any deploy, run `git status --short --branch` and confirm you are in the intended project folder.
- Do not commit `node_modules`, `.next`, `.env`, `.local-data`, temporary test outputs, or copied duplicate project folders.

## Kalika

Local repo:

```bash
cd /Users/shilpakambale/Desktop/Projects/June-26/workflows/autodealer-workflow
```

Configured remotes:

```text
heroku        https://git.heroku.com/autodealer-workflow.git
heroku-worker https://git.heroku.com/autodealer-worker.git
origin        https://github.com/gupta1123/autodealer-workflow.git
nyx-kalika    https://github.com/nyx-solutions-team/kalika-workflow.git
```

Heroku backend app:

```text
autodealer-workflow
```

Heroku worker app/remote:

```text
autodealer-worker
```

Netlify config:

```text
Build command: npm run build:web
Publish: apps/web/.next
Node: 24
NPM: 11
```

Backend/worker deploy:

```bash
npm run typecheck:api
npm run build:api
git push heroku <local-branch>:main
heroku logs --tail --app autodealer-workflow
```

Frontend deploy through GitHub/Netlify:

```bash
npm run typecheck:web
npm run build:web
git push origin <local-branch>:main
```

Frontend deploy directly to Netlify:

```bash
npm run typecheck:web
npm run build:web
npx netlify-cli deploy --build --prod
```

Team NYX source-code push:

```bash
git push nyx-kalika <local-branch>:main
```

If using a token instead of an existing remote auth session:

```bash
read -s GITHUB_TOKEN
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/nyx-solutions-team/kalika-workflow.git" <local-branch>:main
unset GITHUB_TOKEN
```

## Polaad

Local repo:

```bash
cd /Users/shilpakambale/Desktop/Projects/June-26/Polaad-workflow
```

Configured remotes found:

```text
heroku https://git.heroku.com/polaad-workflow.git
```

Frontend GitHub/Netlify deploy repo:

```text
https://github.com/gupta1123/Polad-workflow
```

No GitHub remote was configured in this local Polaad repo when checked. No team `nyx-solutions-team` Polaad remote was found locally, so confirm the exact team repo before pushing source code.

Heroku backend app:

```text
polaad-workflow
```

Netlify config:

```text
Build command: npm run build:web
Publish: apps/polaad-web/.next
Node: 24
NPM: 11
```

Backend/worker deploy:

```bash
npm run typecheck:api
npm run build:api
git push heroku <local-branch>:main
heroku logs --tail --app polaad-workflow
```

Frontend deploy directly to Netlify:

```bash
npm run typecheck:web
npm run build:web
npx netlify-cli deploy --build --prod
```

Frontend deploy through GitHub/Netlify:

```bash
npm run typecheck:web
npm run build:web
read -s GITHUB_TOKEN
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/gupta1123/Polad-workflow.git" <local-branch>:main
unset GITHUB_TOKEN
```

Team NYX source-code push:

```bash
# Add this only after confirming the exact team repo URL.
git remote add nyx-polaad https://github.com/nyx-solutions-team/<CONFIRM-POLAAD-REPO>.git
git push nyx-polaad <local-branch>:main
```

Token form after the repo URL is confirmed:

```bash
read -s GITHUB_TOKEN
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/nyx-solutions-team/<CONFIRM-POLAAD-REPO>.git" <local-branch>:main
unset GITHUB_TOKEN
```

## Gajkesari

Local repo:

```bash
cd /Users/shilpakambale/Desktop/Projects/June-26/Gajkesari-workflow
```

Configured remotes found in this repo:

```text
heroku https://git.heroku.com/gajkesari-workflow.git
```

Additional older local repo with team remote:

```bash
cd /Users/shilpakambale/Desktop/Projects/Nov-25/gajkesari/gajkesari-api
```

```text
origin https://github.com/Shilpa0612/gajkesari.git
team   https://github.com/nyx-solutions-team/gajkesari-api.git
```

Heroku backend app:

```text
gajkesari-workflow
```

Netlify config:

```text
Build command: npm run build:web
Publish: apps/gajkesari-web/.next
Node: 24
NPM: 11
```

Backend/worker deploy:

```bash
npm run typecheck:api
npm run build:api
git push heroku <local-branch>:main
heroku logs --tail --app gajkesari-workflow
```

Frontend deploy directly to Netlify:

```bash
npm run typecheck:web
npm run build:web
npx netlify-cli deploy --build --prod
```

Team NYX source-code push:

If the June repo should push to the same team repo, add the remote:

```bash
git remote add team https://github.com/nyx-solutions-team/gajkesari-api.git
git push team <local-branch>:main
```

Token form:

```bash
read -s GITHUB_TOKEN
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/nyx-solutions-team/gajkesari-api.git" <local-branch>:main
unset GITHUB_TOKEN
```

## Pre-Deploy Checklist

Run from the relevant local repo:

```bash
git status --short --branch
git remote -v
git log --oneline --decorate -5
```

For backend changes:

```bash
npm run typecheck:api
npm run build:api
```

For frontend changes:

```bash
npm run typecheck:web
npm run build:web
```

For lockfile/package changes, especially before Heroku:

```bash
npx -y npm@11.18.0 install --package-lock-only
git add package-lock.json
```

## Token Safety

Use `read -s GITHUB_TOKEN` instead of pasting tokens directly into the command line. If a token appears in the terminal, chat, screenshot, or a file, revoke it and create a new one.

For fine-grained GitHub tokens, use:

```text
Repository access: selected repo only
Permissions: Contents = Read and write
```
