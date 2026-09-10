# P3 Automation Hub V0.1

P3 is the reusable automation/deployment hub for P1 (K Stella Way), P2 (My Life Room), and future projects.

## V0.1 goal
Prove the deployment channel before building major automation features.

Pipeline:
Checkout -> dependency install -> syntax/security/self-test -> Preflight -> Wrangler dry-run -> Cloudflare deploy -> real workers.dev E2E with retry.

## Safety defaults
- Existing Workers are never modified by default.
- New projects use dedicated Workers.
- One error triggers same-family inspection and then a full rerun from the beginning.
- Deploy success text is not enough; the live URL must pass `/health` and `/preflight`.
- D1/R2/Workers AI are added only after this minimal Worker deploys successfully.

## Required GitHub repository secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Never commit these values to the repository.

## Health endpoints
- `GET /health`
- `GET /healthz`
- `GET /preflight`
