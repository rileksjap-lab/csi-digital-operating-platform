-- Migration 033: EWM API integration (Phase 1: pull/import)
-- EwmId is EWM's stable internal numeric WO id — distinct from ExtWO_No
-- (EWM's human-readable wo_number), which can't reliably be used as an
-- idempotent dedup key. EwmId is also what the Phase 2 write-back call
-- (PATCH /work-orders/{id}/status) will need as the path parameter.
-- RequesterEmail pairs with the existing RequesterName column (added in
-- 018_requester_name.sql) — EWM's payload now includes both.
--
-- SourceDeptId was NOT NULL, on the assumption every external WO's source
-- is a real 10CS department (true for the CMT email flow). EWM is org-wide
-- and its source_of_work_order values ("Helpdesk", "Mr. Razi (Chairman)")
-- often aren't departments at all, so there's no valid FK target for them.
-- Relaxing to nullable, same precedent as ExtWO_Id being made nullable in
-- 017_wo_form_redesign.sql for the same "doesn't always apply" reason.

ALTER TABLE external_wo ADD COLUMN EwmId BIGINT;
ALTER TABLE external_wo ADD CONSTRAINT uq_externalwo_ewmid UNIQUE (EwmId);
ALTER TABLE external_wo ALTER COLUMN SourceDeptId DROP NOT NULL;

ALTER TABLE csi_wo ADD COLUMN RequesterEmail VARCHAR(150);
