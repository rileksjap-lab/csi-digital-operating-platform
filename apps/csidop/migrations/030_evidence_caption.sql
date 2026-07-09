-- Migration 030: Add caption/description field to evidence_deliverable
-- Allows staff to add a brief description when uploading evidence

ALTER TABLE evidence_deliverable
  ADD COLUMN caption VARCHAR(500) NULL;
