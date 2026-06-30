-- Migration 028: Add event date/time to announcements
ALTER TABLE announcement ADD COLUMN eventdate TIMESTAMPTZ;
