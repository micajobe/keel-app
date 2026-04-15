-- Update mode enum: collapse three modes into two
-- deep_work stays; knock_things_off + tight_on_time → get_things_done

ALTER TABLE priority_sessions
  DROP CONSTRAINT IF EXISTS priority_sessions_mode_check;

-- Migrate any existing rows
UPDATE priority_sessions
  SET mode = 'get_things_done'
  WHERE mode IN ('knock_things_off', 'tight_on_time');

ALTER TABLE priority_sessions
  ADD CONSTRAINT priority_sessions_mode_check
  CHECK (mode IN ('deep_work', 'get_things_done'));
