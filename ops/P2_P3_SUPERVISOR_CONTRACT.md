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
6. Observe user-started visual QC with read-only `GET /api/cinema/batch/visual-qc/latest-public`.
7. Observe user-started sampled motion QC with read-only `GET /api/cinema/batch/motion-qc/latest-public`.
8. Score technical readiness (9/9 clips, valid frame/video objects, plausible byte size, 6-second metadata, video content type and role metadata).
9. Stop and report on mismatch or failure.
10. Expose read-only P2 health/status/technical/visual/motion quality through the P3 Worker.

## Prohibited automation
P3/CI must never call paid-generation or paid-QC start endpoints automatically, including:
- `POST /api/cinema/generate`
- `POST /api/cinema/batch/start`
- `POST /api/cinema/batch/visual-qc/start`
- `POST /api/cinema/batch/motion-qc/start`

P3/CI also must not automatically regenerate a clip. Visual review, sampled-motion review, and regeneration remain separate explicit cost/approval gates.

P3 must not replace P2's existing `deploy-cloudflare.yml` pipeline. It is a supervisor, not a second deployment owner.

## Cinema quality ladder
1. **Technical QC — automatic/read-only/zero-cost.** Validate the 9 stored pilot clips and metadata. Required technical score: 100/100 before the pilot is treated as technically healthy.
2. **Visual QC — explicit gated step.** Inspect the generated Cinema reference frame for each clip: face, hands/limbs, pet form, room geometry, lighting, camera perspective, and visible artifacts.
3. **Sampled motion QC — explicit gated step.** For each 6-second clip, the P2 mobile client samples four ordered checkpoints (early, two middle, late), builds a 2×2 contact sheet, then the server AI compares identity, pet, anatomy, room, lighting, camera, motion plausibility, morphing and loop-return stability. P3 observes only the public result.
4. **Regeneration candidate — assessment only.** A failed scored clip can be marked as a candidate, but P3 does not regenerate it automatically. Unscored clips are not candidates.
5. **Paid regeneration — approval/budget gated.** Only the required clip should be regenerated, preserving already-good clips.
