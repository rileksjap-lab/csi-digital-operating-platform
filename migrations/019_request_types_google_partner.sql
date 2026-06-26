-- ════════════════════════════════════════════════════════════════════════════
-- Migration 019: Add "Google CP" and "Partner Engagement" request types
-- Google CP gets its own domain; Partner Engagement goes under Others.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Expand domain CHECK to allow 'Google CP'
ALTER TABLE request_type DROP CONSTRAINT chk_requesttype_domain;
ALTER TABLE request_type ADD CONSTRAINT chk_requesttype_domain
  CHECK (domain IN ('Solution Design','Consultancy','BIM','Project Monitoring','Others','Google CP'));

INSERT INTO request_type (typecode, typename, domain, slaackdays, slaclassifydays, slaroutedays)
VALUES
  (16, 'Google CP',           'Google CP', 1, 1, 1),
  (17, 'Partner Engagement',  'Others',    1, 1, 1);

COMMIT;
