-- Dev-only seed: inserts test users for local development.
-- Used by the dev auth bypass when OIDC is not configured.
-- DO NOT run this in production.

INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, systemconfigflag)
SELECT 'DEV001', 'Dev User (HOD)', 'dev@csidop.local', r.id, d.id, 'A', true
FROM role r, department d
WHERE r.rolecode = 'HOD' AND d.deptcode = 'CSI'
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, systemconfigflag)
SELECT 'DEV002', 'Dev User (TL)', 'dev-tl@csidop.local', r.id, d.id, 'A', false
FROM role r, department d
WHERE r.rolecode = 'TL' AND d.deptcode = 'CSI'
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, systemconfigflag)
SELECT 'DEV003', 'Dev User (TM)', 'dev-tm@csidop.local', r.id, d.id, 'A', false
FROM role r, department d
WHERE r.rolecode = 'TM' AND d.deptcode = 'CSI'
ON CONFLICT (email) DO NOTHING;
