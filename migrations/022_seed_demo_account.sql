-- 022: Create demo showcase account
-- Login: demo@csidop.showcase / code: 000000
-- Requires DEMO_ACCOUNT_EMAIL=demo@csidop.showcase in .env

BEGIN;

INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, productivityfactor, dailyusablehours, status, systemconfigflag)
SELECT 'DEMO-001', 'Demo User', 'demo@csidop.showcase',
       r.id, d.id, NULL, 0.80, 8.0, 'Active', false
FROM role r, department d
WHERE r.rolecode = 'TL' AND d.deptcode = 'CSI'
ON CONFLICT (email) DO NOTHING;

COMMIT;
