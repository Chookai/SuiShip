-- Store full field comparisons and baseline status in validation_runs
-- so the GET endpoint can return them without re-running validation.
ALTER TABLE validation_runs ADD COLUMN field_comparisons_json TEXT;
ALTER TABLE validation_runs ADD COLUMN baseline_status TEXT;
ALTER TABLE validation_runs ADD COLUMN memory_trace_json TEXT;
