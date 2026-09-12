PRAGMA foreign_keys = ON;

UPDATE lab_schema SET version = 4 WHERE version = 3;

-- A short deploy window can pair schema 3 with the prior application bundle.
-- Reclassify only operation types whose non-inference semantics are proven;
-- never touch an inference/generation row or manufacture cost evidence.
UPDATE provider_usage_events
SET usage_category = CASE
      WHEN operation = 'model_discovery' THEN 'model_discovery'
      WHEN operation IN ('stock_search','image_search') THEN 'search'
      WHEN operation IN ('stock_result_used','image_result_used') THEN 'asset_use'
      ELSE 'provider_admin'
    END,
    cost_basis = CASE
      WHEN operation = 'model_discovery' OR provider = 'google' OR operation IN ('stock_result_used','image_result_used') THEN 'not_applicable'
      ELSE 'free_or_nonbillable_when_proven'
    END,
    coverage_reason = CASE
      WHEN operation = 'model_discovery' THEN 'Provider catalogue lookup; not an inference operation.'
      WHEN provider = 'google' THEN 'Google Standard Search Element activity is client-side Workshop activity, not JSON API billing.'
      WHEN operation IN ('stock_result_used','image_result_used') THEN 'Local asset-use event; no new provider inference request.'
      ELSE 'Configured stock API publishes quota limits but no per-request monetary charge.'
    END,
    calculation_text = CASE
      WHEN operation = 'model_discovery' OR operation IN ('stock_result_used','image_result_used') THEN 'No provider inference request was submitted.'
      WHEN provider = 'google' THEN 'Local activity only; no provider monetary calculation.'
      ELSE 'Quota-counted API request; no monetary rate reported.'
    END
WHERE cost_basis = 'unknown'
  AND (operation = 'model_discovery' OR provider = 'google' OR operation IN ('stock_result_used','image_result_used') OR provider IN ('pexels','pixabay','unsplash'));
