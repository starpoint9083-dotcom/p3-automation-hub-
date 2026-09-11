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
5. Verify the privacy-safe zero-cost Cinema technical manifest with `GET /api/cinema/batch/quality-public`.
6. Score technical readiness (9/9 clips, valid frame/video objects, plausible byte size, 6-second metadata, video content type and role metadata).
7. Stop and report on mismatch or failure.
8. Expose read-only P2 health/status/technical-quality through the P3 Worker.

## Prohibited automation
P3/CI must never call paid-generation endpoints automatically, including:
- `POST /api/cinema/generate`
- `POST /api/cinema/batch/start`

P3/CI also must not start paid visual-AI quality analysis or automatically regenerate a clip. Visual review and regeneration remain a separate explicit cost/approval gate.

P3 must not replace P2's existing `deploy-cloudflare.yml` pipeline. It is a supervisor, not a second deployment owner.

## Cinema quality ladder
1. **Technical QC — automatic/read-only/zero-cost.** Validate the 9 stored pilot clips and metadata. Required technical score: 100/100 before the pilot is treated as technically healthy.
2. **Visual QC — explicit gated step.** Face consistency, hands/limbs, pet count/form, room continuity, camera motion, morphing/flicker. This may require AI/video-frame analysis and therefore must not run from CI without explicit approval.
3. **Regeneration candidate — assessment only.** A failed visual clip can be marked as a candidate, but P3 does not regenerate it automatically.
4. **Paid regeneration — approval/budget gated.** Only the required clip should be regenerated, preserving already-good clips.
