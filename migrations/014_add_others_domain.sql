-- Migration 014: Add "Others" domain and new request types (13–15)
-- Extends both check constraints to allow new types for non-technical workloads

BEGIN;

-- Widen TypeCode range from 1–12 to 1–99
ALTER TABLE REQUEST_TYPE DROP CONSTRAINT chk_requesttype_typecode;
ALTER TABLE REQUEST_TYPE ADD CONSTRAINT chk_requesttype_typecode
    CHECK (TypeCode BETWEEN 1 AND 99);

-- Add "Others" to allowed domains
ALTER TABLE REQUEST_TYPE DROP CONSTRAINT chk_requesttype_domain;
ALTER TABLE REQUEST_TYPE ADD CONSTRAINT chk_requesttype_domain
    CHECK (Domain IN ('Solution Design','Consultancy','BIM','Project Monitoring','Others'));

-- Insert new request types
INSERT INTO REQUEST_TYPE (TypeCode, TypeName, Domain, SlaAckDays, SlaClassifyDays, SlaRouteDays) VALUES
    (13, 'Others',                      'Others', 1, 2, 3),
    (14, 'Training/Event/Knowledge',    'Others', 1, 2, 3),
    (15, 'HR Matters',                  'Others', 1, 2, 3)
ON CONFLICT (TypeCode) DO NOTHING;

COMMIT;
