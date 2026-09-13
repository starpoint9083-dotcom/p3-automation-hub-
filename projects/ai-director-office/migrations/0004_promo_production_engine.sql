PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS promo_production_runs (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  mission_id TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','PAUSED','DONE','FAILED')),
  total_items INTEGER NOT NULL DEFAULT 0,
  done_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id),
  FOREIGN KEY (mission_id) REFERENCES promo_missions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_runs_academy_status ON promo_production_runs(academy_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS promo_production_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  academy_id TEXT NOT NULL,
  mission_id TEXT,
  item_type TEXT NOT NULL CHECK (item_type IN ('IMAGE','POST','SHORTS_SCRIPT','REELS_SCRIPT','BLOG','DAANGN')),
  channel TEXT,
  purpose TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','READY','FAILED','CANCELLED')),
  result_ref TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_retry_at TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES promo_production_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (academy_id) REFERENCES academies(id),
  FOREIGN KEY (mission_id) REFERENCES promo_missions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_items_run_status ON promo_production_items(run_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_promo_items_retry ON promo_production_items(status,next_retry_at);

ALTER TABLE promo_assets ADD COLUMN reuse_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_assets ADD COLUMN last_used_at TEXT;
ALTER TABLE promo_assets ADD COLUMN source_type TEXT NOT NULL DEFAULT 'GENERATED';
ALTER TABLE promo_assets ADD COLUMN target_segment TEXT;
CREATE INDEX IF NOT EXISTS idx_promo_assets_reuse ON promo_assets(academy_id,status,channel,purpose,last_used_at DESC);
