PRAGMA foreign_keys = ON;

UPDATE lab_schema SET version = 3 WHERE version = 2;

ALTER TABLE provider_usage_events ADD COLUMN logical_request_id TEXT;
ALTER TABLE provider_usage_events ADD COLUMN served_model TEXT;
ALTER TABLE provider_usage_events ADD COLUMN input_text_tokens INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN input_image_tokens INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN cached_input_text_tokens INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN cached_input_image_tokens INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN image_output_tokens INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN cache_write_tokens INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN actual_cost_ticks INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN estimated_cost_nanos INTEGER;
ALTER TABLE provider_usage_events ADD COLUMN cost_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE provider_usage_events ADD COLUMN cost_basis TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE provider_usage_events ADD COLUMN pricing_rate_id TEXT;
ALTER TABLE provider_usage_events ADD COLUMN pricing_snapshot_json TEXT;
ALTER TABLE provider_usage_events ADD COLUMN coverage_reason TEXT;
ALTER TABLE provider_usage_events ADD COLUMN usage_category TEXT NOT NULL DEFAULT 'provider_operation';
ALTER TABLE provider_usage_events ADD COLUMN calculation_text TEXT;

CREATE INDEX provider_usage_logical_request ON provider_usage_events(owner_id, logical_request_id);
CREATE INDEX provider_usage_category_time ON provider_usage_events(owner_id, usage_category, started_at DESC);

UPDATE provider_usage_events
SET logical_request_id = COALESCE(job_id, conversation_id, provider_request_id, id),
    usage_category = CASE
      WHEN operation IN ('image_generation','research_chat') THEN 'inference'
      WHEN operation = 'model_discovery' THEN 'model_discovery'
      WHEN operation IN ('stock_search','image_search') THEN 'search'
      WHEN operation IN ('connection_test','download_tracking') THEN 'provider_admin'
      WHEN operation IN ('stock_result_used','image_result_used') THEN 'asset_use'
      ELSE 'provider_operation'
    END,
    cost_basis = CASE
      WHEN operation = 'model_discovery' OR provider = 'google' OR operation IN ('stock_result_used','image_result_used') THEN 'not_applicable'
      WHEN provider IN ('pexels','pixabay','unsplash') THEN 'free_or_nonbillable_when_proven'
      WHEN cost_state = 'actual' THEN 'actual_provider'
      WHEN cost_state = 'estimated' THEN 'estimated_catalog'
      ELSE 'unknown'
    END,
    coverage_reason = CASE
      WHEN operation = 'model_discovery' THEN 'Provider catalogue lookup; not an inference operation.'
      WHEN provider = 'google' THEN 'Google Standard Search Element activity is client-side Workshop activity, not JSON API billing.'
      WHEN operation IN ('stock_result_used','image_result_used') THEN 'Local asset-use event; no new provider inference request.'
      WHEN provider IN ('pexels','pixabay','unsplash') THEN 'Configured stock API publishes quota limits but no per-request monetary charge.'
      WHEN cost_state = 'actual' THEN 'Provider-reported monetary cost retained from the original response.'
      WHEN cost_state = 'estimated' THEN 'Legacy estimate retained at its originally stored amount.'
      ELSE 'Legacy operation has no retained authoritative pricing evidence.'
    END,
    actual_cost_ticks = CASE WHEN cost_state = 'actual' AND provider_cost_micros IS NOT NULL THEN provider_cost_micros * 10000 ELSE actual_cost_ticks END,
    estimated_cost_nanos = CASE WHEN cost_state = 'estimated' AND estimated_cost_micros IS NOT NULL THEN estimated_cost_micros * 1000 ELSE estimated_cost_nanos END;

-- The persisted job and provider prediction IDs prove that the historical
-- starting row is the same logical operation as the completed job. The output
-- array proves one delivered image; no output count is inferred from defaults.
UPDATE provider_usage_events
SET outcome = (SELECT status FROM jobs WHERE jobs.id = provider_usage_events.job_id),
    completed_at = (SELECT updated_at FROM jobs WHERE jobs.id = provider_usage_events.job_id),
    generated_outputs = (SELECT json_array_length(outputs) FROM jobs WHERE jobs.id = provider_usage_events.job_id),
    served_model = model,
    estimated_cost_micros = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN (SELECT json_array_length(outputs) * 3000 FROM jobs WHERE jobs.id = provider_usage_events.job_id) ELSE estimated_cost_micros END,
    estimated_cost_nanos = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN (SELECT json_array_length(outputs) * 3000000 FROM jobs WHERE jobs.id = provider_usage_events.job_id) ELSE estimated_cost_nanos END,
    cost_state = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN 'estimated' ELSE cost_state END,
    cost_basis = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN 'estimated_catalog' ELSE cost_basis END,
    pricing_rate_id = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN 'replicate-flux-schnell-output-2026-09-13' ELSE pricing_rate_id END,
    pricing_snapshot_json = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN '{"rateId":"replicate-flux-schnell-output-2026-09-13","canonicalModel":"black-forest-labs/flux-schnell","sourceUrl":"https://replicate.com/black-forest-labs/flux-schnell/api/schema","sourceCheckedAt":"2026-09-13","effectiveFrom":"2024-08-01","currency":"USD","billingUnit":"output image","formula":"fixed_output","outputRate":0.003}' ELSE pricing_snapshot_json END,
    coverage_reason = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN 'Backfilled from matching job/prediction and persisted one-item provider output array.' ELSE coverage_reason END,
    calculation_text = CASE WHEN model = 'black-forest-labs/flux-schnell' THEN '1 output × $0.003/image' ELSE calculation_text END
WHERE provider = 'replicate'
  AND operation = 'image_generation'
  AND job_id IN (SELECT id FROM jobs WHERE provider_id = provider_usage_events.provider_request_id AND status = 'succeeded' AND json_valid(outputs) AND json_array_length(outputs) > 0);

-- Pre-ledger xAI operations retain exact provider ticks in their source rows.
INSERT INTO provider_usage_events(
  id,idempotency_key,owner_id,project_id,job_id,provider,key_profile_id,model,operation,
  started_at,completed_at,outcome,provider_request_id,generated_outputs,
  provider_cost_micros,cost_state,safe_metadata_json,logical_request_id,served_model,
  actual_cost_ticks,cost_currency,cost_basis,coverage_reason,usage_category,calculation_text
)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
  'job:'||j.id||':provider',j.owner_id,j.project_id,j.id,j.provider,
  json_extract(j.snapshot,'$.profileId'),json_extract(j.snapshot,'$.model'),'image_generation',
  j.created_at,j.updated_at,j.status,j.provider_id,json_array_length(j.assets),
  CAST((CAST(json_extract(j.metrics,'$.cost_in_usd_ticks') AS INTEGER)+5000)/10000 AS INTEGER),'actual',
  json_object('backfillSource','jobs.metrics','evidence','cost_in_usd_ticks'),j.id,
  COALESCE(json_extract(j.metrics,'$.model'),json_extract(j.snapshot,'$.model')),
  CAST(json_extract(j.metrics,'$.cost_in_usd_ticks') AS INTEGER),'USD','actual_provider',
  'Backfilled exact provider-reported xAI cost ticks from the persisted paid response usage.',
  'inference',printf('%d provider ticks / 10000000000 ticks/USD',CAST(json_extract(j.metrics,'$.cost_in_usd_ticks') AS INTEGER))
FROM jobs j
WHERE j.provider='xai' AND j.status='succeeded' AND json_valid(j.metrics)
  AND CAST(json_extract(j.metrics,'$.cost_in_usd_ticks') AS INTEGER) >= 0
ON CONFLICT(idempotency_key) DO NOTHING;

INSERT INTO provider_usage_events(
  id,idempotency_key,owner_id,project_id,conversation_id,provider,model,operation,
  started_at,completed_at,outcome,input_tokens,output_tokens,cached_tokens,reasoning_tokens,tool_calls,
  provider_cost_micros,cost_state,safe_metadata_json,logical_request_id,served_model,
  actual_cost_ticks,cost_currency,cost_basis,coverage_reason,usage_category,calculation_text
)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
  'chat:'||r.id,r.owner_id,r.project_id,r.id,r.provider,r.model,'research_chat',
  r.created_at,r.updated_at,CASE WHEN r.status='completed' THEN 'succeeded' ELSE r.status END,
  CAST(json_extract(r.metadata,'$.usage.input_tokens') AS INTEGER),
  CAST(json_extract(r.metadata,'$.usage.output_tokens') AS INTEGER),
  CAST(json_extract(r.metadata,'$.usage.input_tokens_details.cached_tokens') AS INTEGER),
  CAST(json_extract(r.metadata,'$.usage.output_tokens_details.reasoning_tokens') AS INTEGER),
  json_array_length(json_extract(r.metadata,'$.tools')),
  CAST((CAST(json_extract(r.metadata,'$.usage.cost_in_usd_ticks') AS INTEGER)+5000)/10000 AS INTEGER),'actual',
  json_object('backfillSource','research_runs.metadata.usage','evidence','cost_in_usd_ticks'),r.id,r.model,
  CAST(json_extract(r.metadata,'$.usage.cost_in_usd_ticks') AS INTEGER),'USD','actual_provider',
  'Backfilled exact provider-reported xAI cost ticks from the persisted response usage.',
  'inference',printf('%d provider ticks / 10000000000 ticks/USD',CAST(json_extract(r.metadata,'$.usage.cost_in_usd_ticks') AS INTEGER))
FROM research_runs r
WHERE r.provider='xai' AND r.status='completed' AND json_valid(r.metadata)
  AND CAST(json_extract(r.metadata,'$.usage.cost_in_usd_ticks') AS INTEGER) >= 0
ON CONFLICT(idempotency_key) DO NOTHING;
