-- ============================================================
-- Keel — Initial Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- STRATEGIC TIERS
-- Three-tier hierarchy: vision → annual → operational
-- Self-referencing: annual items link to vision, initiatives link to operational categories
-- ============================================================
CREATE TABLE strategic_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_type     TEXT NOT NULL CHECK (tier_type IN ('vision', 'annual', 'operational')),
  name          TEXT NOT NULL,
  description   TEXT,
  parent_id     UUID REFERENCES strategic_tiers(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  year          INTEGER,           -- for annual priorities (e.g. 2026)
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the Keel vision goal
INSERT INTO strategic_tiers (tier_type, name, description, year, sort_order) VALUES
  ('vision', '$30M Digital Revenue by 2030', 'Transform the division so that the majority of revenue and income shifts to digital products and services.', NULL, 0);

-- Seed operational categories
INSERT INTO strategic_tiers (tier_type, name, sort_order) VALUES
  ('operational', 'Sales', 0),
  ('operational', 'Business Development', 1),
  ('operational', 'Relationships', 2),
  ('operational', 'Culture', 3);

-- ============================================================
-- TASK CLASSIFICATIONS
-- LLM-inferred or user-overridden alignment for each Teamwork task
-- ============================================================
CREATE TABLE task_classifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teamwork_task_id      TEXT NOT NULL UNIQUE,
  teamwork_project_id   TEXT NOT NULL DEFAULT '1412815',
  strategic_tier_id     UUID REFERENCES strategic_tiers(id) ON DELETE SET NULL,
  task_type             TEXT CHECK (task_type IN ('sales', 'business_development', 'relationships', 'culture', 'strategic', 'admin', 'other')),
  inferred_by           TEXT NOT NULL DEFAULT 'llm' CHECK (inferred_by IN ('llm', 'user')),
  llm_reasoning         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRIORITY SESSIONS
-- Each CPR session: mode, tasks surfaced, LLM reasoning
-- ============================================================
CREATE TABLE priority_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode              TEXT CHECK (mode IN ('deep_work', 'knock_things_off', 'tight_on_time')),
  teamwork_delta    JSONB,   -- snapshot of new/changed tasks since last session
  llm_context       TEXT,   -- full strategic context sent to LLM
  llm_reasoning     TEXT,   -- LLM's reasoning for the day's priorities
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

-- ============================================================
-- SESSION TASKS
-- The ordered priority list within a session
-- ============================================================
CREATE TABLE session_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES priority_sessions(id) ON DELETE CASCADE,
  teamwork_task_id      TEXT NOT NULL,
  task_title            TEXT NOT NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  completed_at          TIMESTAMPTZ,
  completed_in_keel     BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BLOCKING STATES
-- Tracks why a task is blocked and auto-created follow-up subtask
-- ============================================================
CREATE TABLE blocking_states (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teamwork_task_id      TEXT NOT NULL,
  block_type            TEXT NOT NULL CHECK (block_type IN ('waiting_client', 'waiting_person', 'external')),
  reason                TEXT NOT NULL,
  waiting_on            TEXT,             -- who/what we're waiting on
  follow_up_date        DATE,
  follow_up_task_id     TEXT,             -- Teamwork subtask ID auto-created
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- COMPLETIONS
-- Immutable log of completed tasks — feeds Reflect mode
-- ============================================================
CREATE TABLE completions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teamwork_task_id      TEXT NOT NULL,
  task_title            TEXT NOT NULL,
  strategic_tier_id     UUID REFERENCES strategic_tiers(id) ON DELETE SET NULL,
  task_type             TEXT,
  session_id            UUID REFERENCES priority_sessions(id) ON DELETE SET NULL,
  week_number           INTEGER,
  year                  INTEGER,
  completed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRIORITY STATE
-- The persisted priority list — only changes during active sessions
-- ============================================================
CREATE TABLE priority_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teamwork_task_id      TEXT NOT NULL UNIQUE,
  task_title            TEXT NOT NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_visible            BOOLEAN NOT NULL DEFAULT true,
  last_session_id       UUID REFERENCES priority_sessions(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_task_classifications_teamwork_id ON task_classifications(teamwork_task_id);
CREATE INDEX idx_session_tasks_session_id ON session_tasks(session_id);
CREATE INDEX idx_session_tasks_teamwork_id ON session_tasks(teamwork_task_id);
CREATE INDEX idx_blocking_states_teamwork_id ON blocking_states(teamwork_task_id);
CREATE INDEX idx_blocking_states_unresolved ON blocking_states(teamwork_task_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_completions_week ON completions(year, week_number);
CREATE INDEX idx_completions_tier ON completions(strategic_tier_id);
CREATE INDEX idx_priority_state_order ON priority_state(sort_order) WHERE is_visible = true;
CREATE INDEX idx_strategic_tiers_type ON strategic_tiers(tier_type);
CREATE INDEX idx_strategic_tiers_active ON strategic_tiers(is_active) WHERE is_active = true;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_strategic_tiers_updated_at
  BEFORE UPDATE ON strategic_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_task_classifications_updated_at
  BEFORE UPDATE ON task_classifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_blocking_states_updated_at
  BEFORE UPDATE ON blocking_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_priority_state_updated_at
  BEFORE UPDATE ON priority_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
