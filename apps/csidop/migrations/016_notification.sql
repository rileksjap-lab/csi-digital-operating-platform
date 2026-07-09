-- Migration 016: Notification table
-- Stores in-app notifications for staff members

BEGIN;

CREATE TABLE notification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staffid     UUID NOT NULL REFERENCES staff(id),
    title       VARCHAR(200) NOT NULL,
    body        TEXT,
    category    VARCHAR(50) NOT NULL DEFAULT 'General',
    linkurl     VARCHAR(500),
    isread      BOOLEAN NOT NULL DEFAULT FALSE,
    createdat   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_staff_unread
    ON notification (staffid, isread)
    WHERE isread = FALSE;

CREATE INDEX idx_notification_staff_created
    ON notification (staffid, createdat DESC);

-- Revoke UPDATE/DELETE on notification for application role
-- Notifications are soft-managed via isread flag only
REVOKE DELETE ON notification FROM csidop_app;

COMMIT;
