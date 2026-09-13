# K-YouTube Free ↔ P3 Supervisor Contract

## Purpose
P3 supervises the public availability of K-YouTube Free without taking destructive control of the current AppDeploy-owned application.

## Current production target
- App: `k-youtube-free-r0zsy7`
- Public URL: `https://k-youtube-free-r0zsy7.v2.appdeploy.ai/`
- Mode: external supervisor

## Free-only rule
P3 must not call or provision paid translation, dubbing, or TTS services for this module.

Allowed now:
- YouTube official embed playback
- Korean-caption preference where YouTube exposes captions
- existing Korean audio track where YouTube exposes one
- device/browser Korean TTS assistance
- public URL availability verification

Not allowed automatically:
- paid translation API
- paid dubbing API
- paid TTS API
- paid AI generation triggered by CI

## Safety
- Never delete, rename, or replace the existing AppDeploy app automatically.
- Never migrate deployment ownership silently.
- A future GitHub + Cloudflare migration must be explicit and must first prove a new minimal deployment path before feature migration.
- Verification failure uses retry-then-report; destructive recovery is forbidden.
- Deployment success text is insufficient. The real public URL must return the expected application shell.

## Verification
`scripts/supervise-k-youtube-free.mjs` validates:
1. strict HTTPS allowlist for the configured host
2. free-only policy lock
3. live HTTP response
4. expected application HTML markers
5. retry behavior for propagation/transient failures

GitHub Actions workflow: `.github/workflows/k-youtube-free-supervisor.yml`.
