-- ════════════════════════════════════════════════════════════════════════════
-- Migration 018: Add RequesterName to CSI_WO
-- The PIC (Person-in-Charge) or requester name from the source department
-- who initiated this work order. Applies to all WOs (internal and external).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE CSI_WO ADD COLUMN RequesterName VARCHAR(150);
COMMENT ON COLUMN CSI_WO.RequesterName IS 'PIC or requester name from the source department who initiated this WO';

COMMIT;
