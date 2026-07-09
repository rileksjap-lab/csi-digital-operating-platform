-- Migration 031: Track who actually logged an effort entry
-- Effort can be logged "on behalf of" a colleague — the entry is recorded
-- under that colleague's StaffId, but until now there was no record of who
-- actually typed it in. Nullable: NULL means the owner logged it themselves.

ALTER TABLE effort_log
  ADD COLUMN loggedby UUID NULL REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN effort_log.loggedby IS 'Staff who actually submitted this entry, if different from StaffId (on-behalf-of logging). NULL when the owner logged it themselves.';
