-- Migration 044: log of KPI results sent to HR
-- Each time the HOD or SVP presses "Send to HR", one row records who sent it,
-- to which addresses, which appraisals were in it, and whether the email went
-- out. HR recipients themselves are a cycle setting (KPI_CYCLE.Config.hrEmails),
-- edited in KPI Setup, so no address is fixed in code.

CREATE TABLE KPI_HR_SEND (
    Id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CycleId        UUID NOT NULL REFERENCES KPI_CYCLE(Id) ON DELETE RESTRICT,
    SentBy         UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    SentAt         TIMESTAMPTZ NOT NULL DEFAULT now(),
    Recipients     TEXT[] NOT NULL,
    Subject        TEXT NOT NULL,
    AppraisalIds   UUID[] NOT NULL,
    Attachments    TEXT[] NOT NULL DEFAULT '{}',
    Status         VARCHAR(10) NOT NULL,
    Error          TEXT,
    CONSTRAINT chk_kpihrsend_status CHECK (Status IN ('Sent','Failed','Simulated')),
    CONSTRAINT chk_kpihrsend_recipients CHECK (cardinality(Recipients) > 0)
);
CREATE INDEX idx_kpihrsend_cycle ON KPI_HR_SEND(CycleId, SentAt DESC);
COMMENT ON TABLE KPI_HR_SEND IS 'One row per attempt to email final KPI results to HR. Simulated = SMTP is not configured (development).';

GRANT SELECT, INSERT ON KPI_HR_SEND TO csidop_app;
