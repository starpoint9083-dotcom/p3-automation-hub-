PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS promo_video_projects (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  post_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('YOUTUBE','INSTAGRAM')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLAN_READY','TTS_READY','RENDERING','READY','FAILED')),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  plan_json TEXT NOT NULL DEFAULT '{}',
  narration_text TEXT,
  narration_object_key TEXT,
  narration_mime_type TEXT,
  video_object_key TEXT,
  video_mime_type TEXT,
  safe_zone_json TEXT NOT NULL DEFAULT '{}',
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id),
  FOREIGN KEY (mission_id) REFERENCES promo_missions(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES promo_posts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_video_projects_academy_created ON promo_video_projects(academy_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_video_projects_mission_channel ON promo_video_projects(mission_id,channel,created_at DESC);
