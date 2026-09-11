PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS academy_profile (
  academy_id TEXT PRIMARY KEY,
  academy_name TEXT,
  neighborhood TEXT,
  consultation_cta TEXT,
  naver_blog_url TEXT,
  instagram_handle TEXT,
  daangn_profile TEXT,
  logo_asset_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);

CREATE TABLE IF NOT EXISTS promo_missions (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  goal_students INTEGER NOT NULL DEFAULT 1,
  target_segment TEXT,
  channels_json TEXT NOT NULL,
  needs_json TEXT NOT NULL,
  mission_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','APPROVED','RUNNING','DONE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);
CREATE INDEX IF NOT EXISTS idx_promo_missions_academy_created ON promo_missions(academy_id,created_at DESC);

CREATE TABLE IF NOT EXISTS promo_assets (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  mission_id TEXT,
  kind TEXT NOT NULL,
  purpose TEXT,
  channel TEXT,
  prompt TEXT,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','ARCHIVED','REJECTED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id),
  FOREIGN KEY (mission_id) REFERENCES promo_missions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_assets_academy_created ON promo_assets(academy_id,created_at DESC);

CREATE TABLE IF NOT EXISTS promo_posts (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  mission_id TEXT,
  campaign_id TEXT,
  channel TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  asset_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','APPROVED','PUBLISHED','FAILED')),
  scheduled_at TEXT,
  published_url TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id),
  FOREIGN KEY (mission_id) REFERENCES promo_missions(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES recruitment_campaigns(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_posts_academy_status ON promo_posts(academy_id,status,created_at DESC);
