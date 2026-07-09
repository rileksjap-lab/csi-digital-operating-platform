-- 021: Fix department names and codes to match actual org structure
-- Run this on existing databases to correct department data

BEGIN;

-- Update existing department names
UPDATE DEPARTMENT SET DeptName = 'Customer, Supplier & Alliance' WHERE DeptCode = 'CSA';
UPDATE DEPARTMENT SET DeptName = 'Capture Management Team' WHERE DeptCode = 'CMT';
UPDATE DEPARTMENT SET DeptName = 'Change & Project Office / Consultancy Project Office' WHERE DeptCode = 'CPO';
UPDATE DEPARTMENT SET DeptName = 'Compliance, Governance & Integrity' WHERE DeptCode = 'CGI';
UPDATE DEPARTMENT SET DeptName = 'Culture, Branding & Academy' WHERE DeptCode = 'CBA';

-- Update codes/names from migration 017 that were wrong
UPDATE DEPARTMENT SET DeptName = 'Customer Service & Technical' WHERE DeptCode = 'CST';
UPDATE DEPARTMENT SET DeptName = 'Customer Support Operations / Customization Software Office' WHERE DeptCode = 'CSO';
UPDATE DEPARTMENT SET DeptName = 'Corporate Services & Finance' WHERE DeptCode = 'CSF';

-- Fix old codes: LEGAL → Legal, PROCUREMENT → Procurement, CHAIRMAN → CHO, remove SVP
UPDATE DEPARTMENT SET DeptCode = 'Legal', DeptName = 'Legal Unit' WHERE DeptCode = 'LEGAL';
UPDATE DEPARTMENT SET DeptCode = 'Procurement', DeptName = 'Procurement Unit' WHERE DeptCode = 'PROCUREMENT';
UPDATE DEPARTMENT SET DeptCode = 'CHO', DeptName = 'Chairman''s Office' WHERE DeptCode = 'CHAIRMAN';
DELETE FROM DEPARTMENT WHERE DeptCode = 'SVP' AND NOT EXISTS (SELECT 1 FROM STAFF WHERE DeptId = DEPARTMENT.Id);

-- Insert any missing departments
INSERT INTO DEPARTMENT (DeptCode, DeptName) VALUES
    ('CST', 'Customer Service & Technical'),
    ('CSO', 'Customer Support Operations / Customization Software Office'),
    ('CSF', 'Corporate Services & Finance'),
    ('CHO', 'Chairman''s Office'),
    ('Legal', 'Legal Unit'),
    ('Procurement', 'Procurement Unit')
ON CONFLICT (DeptCode) DO NOTHING;

COMMIT;
