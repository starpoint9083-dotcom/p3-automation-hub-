# P2 ↔ P3 Supervisor Contract

P3 supervises P2 from the outside. P2 remains the owner of its build, tests, Cloudflare deployment, D1 migrations, R2 assets, Workers AI binding, and Cinema Workflow.

## P2 protected production resources
- Worker: `my-life-room-v13-live-0910`
- D1: `my-life-room-v13` (`DB`)
- R2: `my-life-room-assets-v13` (`AVATAR_ASSETS`)
- Workers AI binding: `AI`
- Workflow: `my-life-room-cinema-v23` (`CINEMA_WORKFLOW`, class `CinemaBatchWorkflow`)
- Static assets binding: `ASSETS`

P3 must never delete, rename, recreate, or silently rebind these resources.

## P3 allowed responsibilities
1. Observe P2 `main` and its existing deployment workflow.
2. Verify that the deployment for the current `main` commit completed successfully.
3. Verify the real P2 URL with `GET /api/health`.
4. Verify Cinema background status with read-only `GET /api/cinema/batch/latest-public`.
5. Stop and report on mismatch or failure.
6. Expose read-only P2 health/status through the P3 Worker.

## Prohibited automation
P3/CI must never call paid-generation endpoints automatically, including:
- `POST /api/cinema/generate`
- `POST /api/cinema/batch/start`

P3 must not replace P2's existing `deploy-cloudflare.yml` pipeline. It is a supervisor, not a second deployment owner.

## Future quality gate
Cinema quality checks may be added as non-destructive assessment first: technical validity → sampled-frame visual checks → continuity score → regeneration candidate. Paid regeneration stays approval/budget gated.
