PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS academy_targets (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  segment TEXT NOT NULL,
  program TEXT CHECK (program IS NULL OR program IN ('MUEM','NOPIGOM','BOTH')),
  capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  active_students INTEGER NOT NULL DEFAULT 0 CHECK (active_students >= 0),
  desired_new_students INTEGER NOT NULL DEFAULT 0 CHECK (desired_new_students >= 0),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);
CREATE INDEX IF NOT EXISTS idx_targets_academy_active ON academy_targets(academy_id,is_active,priority DESC);

CREATE TABLE IF NOT EXISTS lead_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','CONTACTED','CONSULTED','TRIAL','ENROLLED','LOST','NOTE')),
  channel TEXT,
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_time ON lead_events(lead_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS campaign_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  content_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('PUBLISHED','INQUIRY','CONSULTATION','TRIAL','ENROLLMENT')),
  source TEXT,
  lead_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES recruitment_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign_type ON campaign_events(campaign_id,event_type,occurred_at DESC);

CREATE TABLE IF NOT EXISTS daily_briefings (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  briefing_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academy_id,briefing_date),
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);
