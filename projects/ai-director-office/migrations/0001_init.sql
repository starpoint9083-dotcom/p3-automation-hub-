PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS academies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  program TEXT NOT NULL CHECK (program IN ('MUEM','NOPIGOM','BOTH')),
  enrolled_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('LEAD','TRIAL','ACTIVE','PAUSED','LEFT')),
  parent_name TEXT,
  parent_contact TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);
CREATE INDEX IF NOT EXISTS idx_students_academy_status ON students(academy_id, status);

CREATE TABLE IF NOT EXISTS student_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  observed_on TEXT NOT NULL,
  attended INTEGER CHECK (attended IN (0,1)),
  homework_pct REAL CHECK (homework_pct IS NULL OR (homework_pct >= 0 AND homework_pct <= 100)),
  test_score REAL CHECK (test_score IS NULL OR (test_score >= 0 AND test_score <= 100)),
  listening_score REAL CHECK (listening_score IS NULL OR (listening_score >= 0 AND listening_score <= 100)),
  reading_score REAL CHECK (reading_score IS NULL OR (reading_score >= 0 AND reading_score <= 100)),
  writing_score REAL CHECK (writing_score IS NULL OR (writing_score >= 0 AND writing_score <= 100)),
  concentration_score REAL CHECK (concentration_score IS NULL OR (concentration_score >= 0 AND concentration_score <= 100)),
  teacher_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metrics_student_date ON student_metrics(student_id, observed_on DESC);

CREATE TABLE IF NOT EXISTS parent_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  contacted_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  summary TEXT,
  sentiment TEXT,
  next_action TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_parent_contacts_student_date ON parent_contacts(student_id, contacted_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  child_name TEXT NOT NULL,
  grade TEXT,
  english_experience TEXT,
  reading_level TEXT,
  goal TEXT,
  available_days TEXT,
  source TEXT,
  parent_name TEXT,
  parent_contact TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','CONSULTED','TRIAL','ENROLLED','LOST')),
  followup_due_at TEXT,
  last_contact_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);
CREATE INDEX IF NOT EXISTS idx_leads_academy_status_due ON leads(academy_id, status, followup_due_at);

CREATE TABLE IF NOT EXISTS risk_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  band TEXT NOT NULL CHECK (band IN ('GREEN','YELLOW','RED')),
  reasons_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_risk_student_created ON risk_snapshots(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_reports (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  report_text TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','SENT')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recruitment_campaigns (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  goal_students INTEGER NOT NULL,
  target_segment TEXT,
  channels_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RUNNING','DONE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  tracking_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PUBLISHED','ARCHIVED')),
  inquiries INTEGER NOT NULL DEFAULT 0,
  consultations INTEGER NOT NULL DEFAULT 0,
  enrollments INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES recruitment_campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  academy_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  title TEXT NOT NULL,
  detail TEXT,
  entity_type TEXT,
  entity_id TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE','DISMISSED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (academy_id) REFERENCES academies(id)
);
CREATE INDEX IF NOT EXISTS idx_action_academy_status_priority ON action_items(academy_id, status, priority DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
