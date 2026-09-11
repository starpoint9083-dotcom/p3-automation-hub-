# P3 Automation Hub

P3 is the reusable automation/deployment supervisor for P1 (K Stella Way), P2 (My Life Room), and future projects.

## Core pipeline
Checkout -> dependency install -> syntax/security/self-test -> Preflight -> Wrangler dry-run -> Cloudflare deploy -> real workers.dev E2E with retry.

## P2 integration: external supervisor
P2 keeps ownership of its existing GitHub/Cloudflare deployment pipeline. P3 does **not** replace it.

P3 supervises:
- current P2 `main` commit
- matching P2 `deploy-cloudflare.yml` result
- real P2 `/api/health`
- read-only Cinema `/api/cinema/batch/latest-public`
- P2 runtime status through P3 `/projects/p2/health` and `/projects/p2/cinema`

P3 safety rules for P2:
- never delete/rename/recreate the existing P2 Worker, D1, R2, or Cinema Workflow
- never silently change P2 bindings
- never auto-call paid Cinema generation endpoints
- stop/report on deployment or real-URL verification failure
- quality-gate expansion starts as non-destructive assessment; paid regeneration remains approval/budget gated

Protected P2 production resources are declared in `config/p2-my-life-room.json` and `ops/P2_P3_SUPERVISOR_CONTRACT.md`.

## P3 live endpoints
- `GET /health`
- `GET /healthz`
- `GET /preflight`
- `GET /projects`
- `GET /projects/p1`
- `GET /projects/p1/health`
- `GET /projects/p2`
- `GET /projects/p2/health`
- `GET /projects/p2/cinema`

## Safety defaults
- Existing Workers are never modified by default.
- Project-specific production pipelines remain authoritative unless explicitly migrated.
- One failure stops the current supervisor path and is reported; destructive auto-recovery is forbidden.
- Deploy success text is not enough; the live URL must pass verification.
- Secrets are never committed to the repository.

## Required GitHub repository secrets for P3 deployment
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
