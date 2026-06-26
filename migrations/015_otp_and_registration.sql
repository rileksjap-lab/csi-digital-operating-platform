-- Migration 015: OTP tokens table + extend STAFF status for self-registration
-- Supports magic-link email auth and registration-with-approval flow

BEGIN;

-- ── Extend STAFF status to include PendingApproval / Rejected ──────────────
ALTER TABLE STAFF DROP CONSTRAINT chk_staff_status;
ALTER TABLE STAFF ADD CONSTRAINT chk_staff_status
    CHECK (Status IN ('Active','Inactive','OnLeave','PendingApproval','Rejected'));

-- ── OTP token table ────────────────────────────────────────────────────────
CREATE TABLE OTP_TOKEN (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Email           VARCHAR(150) NOT NULL,
    Code            VARCHAR(6)   NOT NULL,
    ExpiresAt       TIMESTAMPTZ  NOT NULL,
    Attempts        INT          NOT NULL DEFAULT 0,
    Used            BOOLEAN      NOT NULL DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_email_expires ON OTP_TOKEN (Email, ExpiresAt);

-- Grant app role access
GRANT SELECT, INSERT, UPDATE, DELETE ON OTP_TOKEN TO csidop_app;

COMMIT;
