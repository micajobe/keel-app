-- Add LLM-generated fields to priority_state so we can serve
-- the deep-work list from cache without re-calling the LLM.

ALTER TABLE priority_state
  ADD COLUMN reasoning        TEXT,
  ADD COLUMN task_type        TEXT,
  ADD COLUMN strategic_tier   TEXT,
  ADD COLUMN estimated_duration TEXT,
  ADD COLUMN day_briefing     TEXT;
