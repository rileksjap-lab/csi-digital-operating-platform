-- Migration 026: WO Discussion / Comment Thread
-- A flat threaded discussion per work order. Top-level posts have parent_id = NULL,
-- replies reference their parent post.

BEGIN;

CREATE TABLE wo_discussion (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    csi_wo_id   UUID NOT NULL REFERENCES csi_wo(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES wo_discussion(id) ON DELETE CASCADE,
    posted_by   UUID NOT NULL REFERENCES staff(id),
    body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
    is_edited   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wo_discussion_wo ON wo_discussion(csi_wo_id, created_at);
CREATE INDEX idx_wo_discussion_parent ON wo_discussion(parent_id) WHERE parent_id IS NOT NULL;

COMMENT ON TABLE wo_discussion IS 'Threaded discussion / comments on work orders';

COMMIT;
