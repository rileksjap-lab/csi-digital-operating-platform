-- Seed KPI_RECORD for 2026-Q2
INSERT INTO kpi_record (staffid, roleid, period, metricname, targetvalue, achievedvalue) VALUES
-- Dev User (HOD)
('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '2ffc2ab5-1f0a-4bce-bd5c-902d2bf90c7b', '2026-Q2', 'Revenue Target (RM)', 500000.00, 420000.00),
('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '2ffc2ab5-1f0a-4bce-bd5c-902d2bf90c7b', '2026-Q2', 'Team Utilisation %', 85.00, 78.50),
('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '2ffc2ab5-1f0a-4bce-bd5c-902d2bf90c7b', '2026-Q2', 'Staff Retention %', 95.00, 97.00),
('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '2ffc2ab5-1f0a-4bce-bd5c-902d2bf90c7b', '2026-Q2', 'Tender Win Rate %', 40.00, 35.00),
-- Dev User (TL)
('e4f05983-55df-4e4d-8287-3aad83bc0798', '27be2f09-b0b3-4906-93b6-0e4265347186', '2026-Q2', 'WO Completion Rate %', 90.00, 92.00),
('e4f05983-55df-4e4d-8287-3aad83bc0798', '27be2f09-b0b3-4906-93b6-0e4265347186', '2026-Q2', 'Team Utilisation %', 85.00, 88.00),
('e4f05983-55df-4e4d-8287-3aad83bc0798', '27be2f09-b0b3-4906-93b6-0e4265347186', '2026-Q2', 'Quality Score', 4.00, 3.80),
('e4f05983-55df-4e4d-8287-3aad83bc0798', '27be2f09-b0b3-4906-93b6-0e4265347186', '2026-Q2', 'SLA Compliance %', 95.00, 91.00),
-- Dev User (TM)
('dbb906f3-0c61-4539-b5f2-2061ef892a19', '50b78993-09cd-4527-8125-a833110a21de', '2026-Q2', 'WO Completion Rate %', 90.00, 95.00),
('dbb906f3-0c61-4539-b5f2-2061ef892a19', '50b78993-09cd-4527-8125-a833110a21de', '2026-Q2', 'Billable Hours', 400.00, 380.00),
('dbb906f3-0c61-4539-b5f2-2061ef892a19', '50b78993-09cd-4527-8125-a833110a21de', '2026-Q2', 'Quality Score', 4.00, 4.20),
-- Sofea
('e85d89ea-7027-4738-af5f-682ea9c1a873', '50b78993-09cd-4527-8125-a833110a21de', '2026-Q2', 'WO Completion Rate %', 90.00, 85.00),
('e85d89ea-7027-4738-af5f-682ea9c1a873', '50b78993-09cd-4527-8125-a833110a21de', '2026-Q2', 'Billable Hours', 400.00, 350.00),
('e85d89ea-7027-4738-af5f-682ea9c1a873', '50b78993-09cd-4527-8125-a833110a21de', '2026-Q2', 'Quality Score', 4.00, 3.50)
ON CONFLICT (staffid, period, metricname) DO NOTHING;

-- Seed OI_TRACKER for 2026-Q2
INSERT INTO oi_tracker (staffid, period, registered, won) VALUES
('1123b2e4-bd21-49c6-93bb-372ae0fefd1c', '2026-Q2', 8, 3),
('e4f05983-55df-4e4d-8287-3aad83bc0798', '2026-Q2', 5, 2),
('dbb906f3-0c61-4539-b5f2-2061ef892a19', '2026-Q2', 3, 1),
('e85d89ea-7027-4738-af5f-682ea9c1a873', '2026-Q2', 2, 0)
ON CONFLICT (staffid, period) DO NOTHING;
