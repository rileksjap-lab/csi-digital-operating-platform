-- Migration 027: Announcement Board
-- HOD/SM can post department-wide announcements pinned to dashboard

CREATE TABLE announcement (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200)  NOT NULL,
  body        TEXT          NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  priority    VARCHAR(20)   NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('normal', 'important', 'urgent')),
  pinned      BOOLEAN       NOT NULL DEFAULT false,
  createdby   UUID          NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  createdat   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  expiresat   TIMESTAMPTZ,
  removedat   TIMESTAMPTZ,
  removedby   UUID          REFERENCES staff(id)
);

CREATE INDEX idx_announcement_active ON announcement (createdat DESC)
  WHERE removedat IS NULL;
CREATE INDEX idx_announcement_pinned ON announcement (pinned, createdat DESC)
  WHERE removedat IS NULL AND pinned = true;
