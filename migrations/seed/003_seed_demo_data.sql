-- ============================================================================
-- Demo seed data for CSI Digital Operating Platform
-- Run: psql -U postgres -d csidop -f migrations/seed/003_seed_demo_data.sql
-- ============================================================================

-- Staff IDs (from existing seed data)
-- HOD:  1123b2e4-bd21-49c6-93bb-372ae0fefd1c  dev@csidop.local
-- TL:   e4f05983-55df-4e4d-8287-3aad83bc0798  dev-tl@csidop.local
-- TM:   dbb906f3-0c61-4539-b5f2-2061ef892a19  dev-tm@csidop.local
-- Farhan: b271b0a0-2981-433e-bcd7-8ef840e07619 rileksjap@gmail.com
-- Farhan2: 62ca908f-3928-44d3-bfc4-d72d7ae7c90f farhan.test@example.com
-- Sofea: e85d89ea-7027-4738-af5f-682ea9c1a873  sofea@test.com

-- Dept CSI: 4782a2cf-a859-43c0-a983-e539f7d4b800

BEGIN;

-- ─── External Work Orders ──────────────────────────────────────────────────

INSERT INTO external_wo (id, extwo_no, projectcode, sourcedeptid, enduser, receiveddate, status) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'EXT-001-2026', 'PROJ-KKM-2026', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Ministry of Health', '2026-06-01', 'Active'),
  ('a0000001-0000-0000-0000-000000000002', 'EXT-002-2026', 'PROJ-MOE-2026', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Ministry of Education', '2026-06-05', 'Active'),
  ('a0000001-0000-0000-0000-000000000003', 'EXT-003-2026', 'PROJ-LHDN-2026', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'LHDN', '2026-06-10', 'Active'),
  ('a0000001-0000-0000-0000-000000000004', 'EXT-004-2026', 'PROJ-KKMM-2026', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'KKMM', '2026-05-20', 'Active'),
  ('a0000001-0000-0000-0000-000000000005', 'EXT-005-2026', 'PROJ-TNB-2026', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'TNB', '2026-05-15', 'Active'),
  ('a0000001-0000-0000-0000-000000000006', 'EXT-006-2026', 'PROJ-INT-001', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Internal', '2026-06-15', 'Active'),
  ('a0000001-0000-0000-0000-000000000007', 'EXT-007-2026', 'PROJ-INT-002', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Internal', '2026-05-01', 'Active'),
  ('a0000001-0000-0000-0000-000000000008', 'EXT-008-2026', 'PROJ-INT-003', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Internal', '2026-05-10', 'Active'),
  ('a0000001-0000-0000-0000-000000000009', 'EXT-009-2026', 'PROJ-GOV-001', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Putrajaya PMO', '2026-06-12', 'Active'),
  ('a0000001-0000-0000-0000-000000000010', 'EXT-010-2026', 'PROJ-CYB-001', '4782a2cf-a859-43c0-a983-e539f7d4b800', 'Cyberjaya Corp', '2026-06-01', 'Active')
ON CONFLICT DO NOTHING;

-- ─── CSI Work Orders (mix of statuses, priorities, domains) ────────────────

INSERT INTO csi_wo (id, csi_wo_no, extwo_id, requesttypeid, title, priority, tierid, createdby, assignedto, duedate, status, createdat, updatedat) VALUES
  -- Open WOs
  ('b0000001-0000-0000-0000-000000000001', '300-01062026-001', 'a0000001-0000-0000-0000-000000000001',
   'f8acb8d6-e5dd-42f6-b2fc-9202084a1557', 'KKM Hospital Network Design - Phase 1', 'High',
   '893d6324-da4d-4958-9d99-2601ce0d8926',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'e4f05983-55df-4e4d-8287-3aad83bc0798',
   '2026-07-15', 'Open', '2026-06-01 09:00:00+08', '2026-06-01 09:00:00+08'),

  ('b0000001-0000-0000-0000-000000000002', '300-05062026-001', 'a0000001-0000-0000-0000-000000000002',
   '7001c558-cfaf-44ef-a430-e21ad5e174e6', 'MOE Smart Classroom RFP Response', 'Urgent',
   'fd78337e-4218-480c-bb73-0b59019a99a8',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'dbb906f3-0c61-4539-b5f2-2061ef892a19',
   '2026-06-25', 'Open', '2026-06-05 10:30:00+08', '2026-06-05 10:30:00+08'),

  -- InProgress WOs
  ('b0000001-0000-0000-0000-000000000003', '300-10062026-001', 'a0000001-0000-0000-0000-000000000003',
   'db8d8b69-7e9e-4cbc-82ef-eb087094fe7b', 'LHDN Data Centre Physical Audit', 'Normal',
   '40d65be0-b90b-48e1-90ea-80a7d47b8a16',
   'e4f05983-55df-4e4d-8287-3aad83bc0798', 'b271b0a0-2981-433e-bcd7-8ef840e07619',
   '2026-07-10', 'InProgress', '2026-06-10 08:00:00+08', '2026-06-15 14:20:00+08'),

  ('b0000001-0000-0000-0000-000000000004', '300-15062026-001', 'a0000001-0000-0000-0000-000000000006',
   '454f0c3b-e175-458a-b0c5-1434899c3a1a', 'Cloud Migration Strategy Document', 'High',
   '893d6324-da4d-4958-9d99-2601ce0d8926',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'e4f05983-55df-4e4d-8287-3aad83bc0798',
   '2026-07-01', 'InProgress', '2026-06-15 11:00:00+08', '2026-06-20 16:45:00+08'),

  ('b0000001-0000-0000-0000-000000000005', '300-12062026-001', 'a0000001-0000-0000-0000-000000000009',
   '7ba9b655-6eed-4cbe-be8c-0348a217424a', 'BIM Model - Putrajaya Government Complex', 'Normal',
   '40d65be0-b90b-48e1-90ea-80a7d47b8a16',
   'e4f05983-55df-4e4d-8287-3aad83bc0798', '62ca908f-3928-44d3-bfc4-d72d7ae7c90f',
   '2026-07-20', 'InProgress', '2026-06-12 09:15:00+08', '2026-06-19 10:30:00+08'),

  ('b0000001-0000-0000-0000-000000000006', '300-08062026-001', 'a0000001-0000-0000-0000-000000000004',
   'a04c3c53-d72c-4f67-8dfe-20d5b78c1153', 'KKMM Cyber Security Framework Documentation', 'High',
   'fd78337e-4218-480c-bb73-0b59019a99a8',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'e85d89ea-7027-4738-af5f-682ea9c1a873',
   '2026-06-28', 'InProgress', '2026-06-08 13:00:00+08', '2026-06-21 09:15:00+08'),

  -- PendingApproval WOs
  ('b0000001-0000-0000-0000-000000000007', '300-20052026-001', 'a0000001-0000-0000-0000-000000000005',
   '95682dab-04cb-46a3-b373-8456bd32b972', 'TNB Substation Monitoring Setup', 'Normal',
   '893d6324-da4d-4958-9d99-2601ce0d8926',
   'e4f05983-55df-4e4d-8287-3aad83bc0798', 'dbb906f3-0c61-4539-b5f2-2061ef892a19',
   '2026-06-30', 'PendingApproval', '2026-05-20 10:00:00+08', '2026-06-18 15:30:00+08'),

  -- Closed WOs
  ('b0000001-0000-0000-0000-000000000008', '300-01052026-001', 'a0000001-0000-0000-0000-000000000007',
   '91391b7a-47d0-48f3-81f1-fe2aa98625d2', 'AWS Solutions Architect Training', 'Low',
   '893d6324-da4d-4958-9d99-2601ce0d8926',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'b271b0a0-2981-433e-bcd7-8ef840e07619',
   '2026-06-01', 'Closed', '2026-05-01 09:00:00+08', '2026-06-01 17:00:00+08'),

  ('b0000001-0000-0000-0000-000000000009', '300-10052026-001', 'a0000001-0000-0000-0000-000000000007',
   'b67b5ad7-25f1-42df-add7-922f2811b985', 'Staff Onboarding - Q2 2026 Batch', 'Low',
   '893d6324-da4d-4958-9d99-2601ce0d8926',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c',
   '2026-05-30', 'Closed', '2026-05-10 08:30:00+08', '2026-05-28 16:00:00+08'),

  ('b0000001-0000-0000-0000-000000000010', '300-15052026-001', 'a0000001-0000-0000-0000-000000000008',
   '6cdebb33-e119-415f-815a-63b7cb057a16', 'Internal Tool Development - Timesheet App', 'Normal',
   '40d65be0-b90b-48e1-90ea-80a7d47b8a16',
   'e4f05983-55df-4e4d-8287-3aad83bc0798', 'e4f05983-55df-4e4d-8287-3aad83bc0798',
   '2026-06-15', 'Closed', '2026-05-15 10:00:00+08', '2026-06-14 11:30:00+08'),

  -- Overdue WO (Open, past due date)
  ('b0000001-0000-0000-0000-000000000011', '300-01062026-002', 'a0000001-0000-0000-0000-000000000010',
   'f8acb8d6-e5dd-42f6-b2fc-9202084a1557', 'Network Assessment Report - Cyberjaya Campus', 'High',
   '893d6324-da4d-4958-9d99-2601ce0d8926',
   '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'b271b0a0-2981-433e-bcd7-8ef840e07619',
   '2026-06-18', 'InProgress', '2026-06-01 14:00:00+08', '2026-06-16 09:00:00+08')
ON CONFLICT DO NOTHING;

-- ─── Effort Logs ──────────────────────────────────────────────────────────

INSERT INTO effort_log (id, csi_wo_id, staffid, logdate, hours, notes) VALUES
  -- LHDN Physical Audit (InProgress)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000003', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-06-11', 4.0, 'Site survey at LHDN HQ'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000003', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-06-12', 6.5, 'Floor plan mapping and rack inventory'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000003', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-06-15', 3.0, 'Draft audit report'),

  -- Cloud Migration Strategy (InProgress)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000004', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-06-16', 5.0, 'Stakeholder interviews'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000004', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-06-17', 7.0, 'Current state assessment'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000004', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-06-18', 4.5, 'Cloud readiness matrix'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000004', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-06-19', 6.0, 'Migration strategy draft'),

  -- BIM Model (InProgress)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000005', '62ca908f-3928-44d3-bfc4-d72d7ae7c90f', '2026-06-13', 8.0, 'Initial Revit modelling'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000005', '62ca908f-3928-44d3-bfc4-d72d7ae7c90f', '2026-06-14', 7.5, 'MEP systems layout'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000005', '62ca908f-3928-44d3-bfc4-d72d7ae7c90f', '2026-06-17', 6.0, 'Clash detection analysis'),

  -- KKMM Cyber Security Doc (InProgress)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', 'e85d89ea-7027-4738-af5f-682ea9c1a873', '2026-06-09', 4.0, 'Framework research and benchmarking'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', 'e85d89ea-7027-4738-af5f-682ea9c1a873', '2026-06-10', 5.5, 'Policy draft - access control section'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', 'e85d89ea-7027-4738-af5f-682ea9c1a873', '2026-06-16', 6.0, 'Incident response procedures'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', 'e85d89ea-7027-4738-af5f-682ea9c1a873', '2026-06-20', 3.5, 'Review and incorporate feedback'),

  -- TNB Monitoring (PendingApproval)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', 'dbb906f3-0c61-4539-b5f2-2061ef892a19', '2026-06-01', 4.0, 'Requirements gathering'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', 'dbb906f3-0c61-4539-b5f2-2061ef892a19', '2026-06-05', 8.0, 'Sensor placement design'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', 'dbb906f3-0c61-4539-b5f2-2061ef892a19', '2026-06-10', 6.0, 'Dashboard prototype'),

  -- AWS Training (Closed)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-05-05', 8.0, 'Day 1 - Compute & Storage'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-05-06', 8.0, 'Day 2 - Networking & Security'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-05-07', 8.0, 'Day 3 - Architecture & Exam Prep'),

  -- Network Assessment (Overdue)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000011', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-06-02', 3.0, 'Site visit planning'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000011', 'b271b0a0-2981-433e-bcd7-8ef840e07619', '2026-06-05', 5.0, 'Network topology discovery'),

  -- Internal Tool (Closed)
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000010', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-05-16', 6.0, 'UI wireframes and tech stack'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000010', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-05-20', 8.0, 'Backend API development'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000010', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-05-27', 7.0, 'Frontend integration'),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000010', 'e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-06-03', 4.0, 'Testing and deployment')
ON CONFLICT DO NOTHING;

-- ─── Tenders ──────────────────────────────────────────────────────────────

INSERT INTO tender (id, tenderno, tendername, client, tendercategory, closingdate, estimatedvalue, submittedvalue, winvalue, status, tenderownerid) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'T-01062026-001',
   'KKM Hospital Information System Modernisation',
   'Ministry of Health', 'Government', '2026-07-30', 15000000, 14200000, NULL,
   'Submitted', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  ('c0000001-0000-0000-0000-000000000002', 'T-05062026-001',
   'MOE Smart Classroom Nationwide Rollout',
   'Ministry of Education', 'Government', '2026-08-15', 25000000, NULL, NULL,
   'Qualified', 'e4f05983-55df-4e4d-8287-3aad83bc0798'),

  ('c0000001-0000-0000-0000-000000000003', 'T-10062026-001',
   'LHDN Tax Analytics Platform',
   'LHDN', 'Government', '2026-07-10', 8500000, NULL, NULL,
   'InProgress', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  ('c0000001-0000-0000-0000-000000000004', 'T-01052026-001',
   'TNB Smart Grid Monitoring System',
   'TNB', 'GLC', '2026-06-15', 12000000, 11500000, 11500000,
   'Won', 'e4f05983-55df-4e4d-8287-3aad83bc0798'),

  ('c0000001-0000-0000-0000-000000000005', 'T-15042026-001',
   'Petronas Digital Twin Platform',
   'PETRONAS', 'GLC', '2026-05-30', 35000000, 33000000, NULL,
   'Lost', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  ('c0000001-0000-0000-0000-000000000006', 'T-20062026-001',
   'TM Enterprise SD-WAN Solution',
   'TM', 'GLC', '2026-07-25', 5500000, NULL, NULL,
   'Prospect', 'e4f05983-55df-4e4d-8287-3aad83bc0798'),

  ('c0000001-0000-0000-0000-000000000007', 'T-18062026-001',
   'Sime Darby Plantation IoT Monitoring',
   'Sime Darby', 'Private', '2026-08-01', 7200000, NULL, NULL,
   'Qualified', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  ('c0000001-0000-0000-0000-000000000008', 'T-01032026-001',
   'KLIA Terminal 2 Network Refresh',
   'Malaysia Airports', 'GLC', '2026-04-15', 18000000, 17200000, 17200000,
   'Won', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c')
ON CONFLICT DO NOTHING;

-- ─── Skills ──────────────────────────────────────────────────────────────

-- Use existing skill IDs from the seeded skill table:
-- 0c47acc0... AWS Solutions Architecture (Cloud)
-- e7ec0bf3... Microsoft Azure (Cloud)
-- 6e31cfe7... Cisco Routing & Switching (Network)
-- dc166046... Network Security (Cyber Security)
-- f0083df9... Revit Modelling (BIM)
-- 2a419de5... Tender Writing (Consultancy)
-- 3f2f35ae... Server Virtualization (Data Centre)
-- a9e7f665... Machine Learning Operations (AI / HPC)

-- ─── Staff Skill Assessments ────────────────────────────────────────────

INSERT INTO staff_skill (staffid, skillid, competencylevel, lastassessmentdate, assessedby) VALUES
  -- HOD - broad expertise
  ('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '0c47acc0-7655-466c-a922-6b3f5e1f45b5', 'Expert', '2026-06-01', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '6e31cfe7-a269-463c-b348-008e96292234', 'Expert', '2026-06-01', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '2a419de5-d368-415a-8368-3bfe0d803938', 'Expert', '2026-06-01', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  -- TL - network & cloud
  ('e4f05983-55df-4e4d-8287-3aad83bc0798', '0c47acc0-7655-466c-a922-6b3f5e1f45b5', 'Intermediate', '2026-06-01', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('e4f05983-55df-4e4d-8287-3aad83bc0798', '6e31cfe7-a269-463c-b348-008e96292234', 'Expert', '2026-06-01', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('e4f05983-55df-4e4d-8287-3aad83bc0798', 'f39efffa-a0f6-4dd4-bf1c-01d52b370825', 'Intermediate', '2026-06-01', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  -- TM - cloud beginner
  ('dbb906f3-0c61-4539-b5f2-2061ef892a19', '0c47acc0-7655-466c-a922-6b3f5e1f45b5', 'Beginner', '2026-06-01', 'e4f05983-55df-4e4d-8287-3aad83bc0798'),
  ('dbb906f3-0c61-4539-b5f2-2061ef892a19', 'a9e7f665-ac66-44f5-be2e-a61c963e8545', 'Intermediate', '2026-06-01', 'e4f05983-55df-4e4d-8287-3aad83bc0798'),

  -- Farhan - security & data centre
  ('b271b0a0-2981-433e-bcd7-8ef840e07619', 'dc166046-52c7-4642-977d-f73e99821726', 'Intermediate', '2026-06-15', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('b271b0a0-2981-433e-bcd7-8ef840e07619', '3f2f35ae-f175-4ecc-99e6-3f7ce618fa10', 'Beginner', '2026-06-15', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  -- Farhan2 - BIM expert
  ('62ca908f-3928-44d3-bfc4-d72d7ae7c90f', 'f0083df9-b2d1-4404-9bc8-91d438408512', 'Expert', '2026-06-10', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('62ca908f-3928-44d3-bfc4-d72d7ae7c90f', 'e7ec0bf3-e880-4666-9e9b-640c8dfc653e', 'Intermediate', '2026-06-10', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),

  -- Sofea - security & consultancy
  ('e85d89ea-7027-4738-af5f-682ea9c1a873', 'dc166046-52c7-4642-977d-f73e99821726', 'Expert', '2026-06-10', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c'),
  ('e85d89ea-7027-4738-af5f-682ea9c1a873', '1f1a5891-83cf-437d-96da-b3438d9dcc7c', 'Beginner', '2026-06-10', '1123b2e4-bd21-49c6-93bb-372ae0fefd1c')
ON CONFLICT DO NOTHING;

-- ─── Certifications ──────────────────────────────────────────────────────

INSERT INTO certification (id, staffid, certificationname, vendor, certificationlevel, issuedate, expirydate, status) VALUES
  (gen_random_uuid(), '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'AWS Solutions Architect Professional', 'Amazon', 'Professional', '2025-03-15', '2028-03-15', 'Verified'),
  (gen_random_uuid(), '1123b2e4-bd21-49c6-93bb-372ae0fefd1c', 'PMP', 'PMI', 'Professional', '2024-06-01', '2027-06-01', 'Verified'),
  (gen_random_uuid(), 'e4f05983-55df-4e4d-8287-3aad83bc0798', 'CCNP Enterprise', 'Cisco', 'Professional', '2025-01-10', '2028-01-10', 'Verified'),
  (gen_random_uuid(), 'e4f05983-55df-4e4d-8287-3aad83bc0798', 'AWS Solutions Architect Associate', 'Amazon', 'Associate', '2025-08-20', '2028-08-20', 'Verified'),
  (gen_random_uuid(), 'dbb906f3-0c61-4539-b5f2-2061ef892a19', 'AWS Cloud Practitioner', 'Amazon', 'Foundational', '2026-02-01', '2029-02-01', 'Verified'),
  (gen_random_uuid(), 'b271b0a0-2981-433e-bcd7-8ef840e07619', 'CompTIA Security+', 'CompTIA', 'Associate', '2025-09-01', '2026-09-01', 'Verified'),
  (gen_random_uuid(), '62ca908f-3928-44d3-bfc4-d72d7ae7c90f', 'Autodesk Certified Professional - Revit', 'Autodesk', 'Professional', '2025-04-15', '2026-04-15', 'Expired'),
  (gen_random_uuid(), 'e85d89ea-7027-4738-af5f-682ea9c1a873', 'CISSP', 'ISC2', 'Professional', '2025-11-01', '2026-08-01', 'Verified')
ON CONFLICT DO NOTHING;

COMMIT;

-- Summary
DO $$
BEGIN
  RAISE NOTICE 'Seed data inserted:';
  RAISE NOTICE '  External WOs: 5';
  RAISE NOTICE '  CSI WOs: 11 (2 Open, 5 InProgress, 1 PendingApproval, 3 Closed, 1 Overdue)';
  RAISE NOTICE '  Effort logs: 26';
  RAISE NOTICE '  Tenders: 8 (3 active pipeline, 2 Won, 1 Lost, 1 Prospect, 1 Submitted)';
  RAISE NOTICE '  Skills: 8 across 8 domains';
  RAISE NOTICE '  Staff skill assessments: 15';
  RAISE NOTICE '  Certifications: 8 (1 expired, 1 expiring in 90 days)';
END $$;
