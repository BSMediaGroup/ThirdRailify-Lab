CREATE TABLE lab_schema (version INTEGER PRIMARY KEY);
INSERT INTO lab_schema VALUES (1);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1, write_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX projects_owner ON projects(owner_id, deleted_at, updated_at DESC);
CREATE TABLE files (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT REFERENCES projects(id),
  object_key TEXT NOT NULL UNIQUE, metadata TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','deleting','deleted')),
  created_at TEXT NOT NULL
);
CREATE INDEX files_owner ON files(owner_id,status);
CREATE TABLE project_files (
  project_id TEXT NOT NULL REFERENCES projects(id), file_id TEXT NOT NULL REFERENCES files(id),
  PRIMARY KEY(project_id,file_id)
);
CREATE TRIGGER protect_project_file BEFORE INSERT ON project_files
WHEN NOT EXISTS (SELECT 1 FROM files f JOIN projects p ON p.id=NEW.project_id WHERE f.id=NEW.file_id AND f.owner_id=p.owner_id AND f.status='ready' AND p.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'file_unavailable'); END;
CREATE TABLE preferences (owner_id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),
  request_id TEXT NOT NULL, input_hash TEXT NOT NULL, snapshot TEXT NOT NULL,
  provider TEXT NOT NULL, provider_id TEXT UNIQUE, webhook_nonce TEXT NOT NULL,
  status TEXT NOT NULL, phase TEXT NOT NULL, outputs TEXT NOT NULL DEFAULT '[]',
  assets TEXT NOT NULL DEFAULT '[]', metrics TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  UNIQUE(owner_id,request_id)
);
CREATE INDEX jobs_recovery ON jobs(status,next_at,lease_until);
CREATE INDEX jobs_owner ON jobs(owner_id,created_at DESC);
CREATE TABLE job_files (job_id TEXT REFERENCES jobs(id), file_id TEXT REFERENCES files(id), PRIMARY KEY(job_id,file_id));
CREATE TRIGGER protect_job_file BEFORE INSERT ON job_files
WHEN NOT EXISTS (SELECT 1 FROM files f JOIN jobs j ON j.id=NEW.job_id JOIN projects p ON p.id=j.project_id WHERE f.id=NEW.file_id AND f.owner_id=j.owner_id AND f.status='ready' AND p.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'file_unavailable'); END;
CREATE TABLE webhook_receipts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), body_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE provider_cleanup (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, provider TEXT NOT NULL, file_id TEXT,
  state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, error TEXT
);
CREATE TABLE provider_status (provider TEXT PRIMARY KEY, state TEXT NOT NULL, checked_at TEXT NOT NULL, actor_id TEXT NOT NULL);
CREATE TABLE rate_limits (subject TEXT NOT NULL, category TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(subject,category,window));
CREATE TABLE research_runs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),
  provider TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX research_owner ON research_runs(owner_id,project_id,created_at DESC);
