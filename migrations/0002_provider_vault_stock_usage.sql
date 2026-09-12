PRAGMA foreign_keys = ON;

UPDATE lab_schema SET version = 2 WHERE version = 1;

CREATE TABLE provider_key_profiles (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('replicate','openai','xai','pexels','pixabay','unsplash')),
  label TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  fingerprint TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  verification_status TEXT NOT NULL DEFAULT 'saved' CHECK (verification_status IN ('saved','verified','rejected','unavailable')),
  verified_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX provider_key_profiles_fingerprint
  ON provider_key_profiles(provider, fingerprint) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX provider_key_profiles_default
  ON provider_key_profiles(provider) WHERE is_default = 1 AND enabled = 1 AND deleted_at IS NULL;

CREATE TABLE provider_profile_preferences (
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  profile_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, provider, model)
);

CREATE TABLE provider_usage_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  job_id TEXT,
  conversation_id TEXT,
  provider TEXT NOT NULL,
  key_profile_id TEXT,
  key_fingerprint TEXT,
  model TEXT,
  operation TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT NOT NULL,
  provider_request_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  reasoning_tokens INTEGER,
  generated_outputs INTEGER,
  search_count INTEGER,
  tool_calls INTEGER,
  provider_cost_micros INTEGER,
  estimated_cost_micros INTEGER,
  cost_state TEXT NOT NULL DEFAULT 'unknown' CHECK (cost_state IN ('actual','estimated','unknown')),
  cache_status TEXT CHECK (cache_status IN ('hit','miss','not_applicable')),
  rate_limit_limit INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_reset TEXT,
  safe_metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX provider_usage_owner_time ON provider_usage_events(owner_id, started_at DESC);
CREATE INDEX provider_usage_provider_time ON provider_usage_events(provider, started_at DESC);

CREATE TABLE stock_search_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'pixabay'),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX stock_search_cache_expiry ON stock_search_cache(expires_at);

CREATE TABLE stock_references (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  provider TEXT NOT NULL CHECK (provider IN ('google','pexels','pixabay','unsplash')),
  provider_id TEXT,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  image_url TEXT NOT NULL,
  creator_name TEXT,
  creator_url TEXT,
  attribution_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX stock_references_owner_project ON stock_references(owner_id, project_id, created_at DESC);
