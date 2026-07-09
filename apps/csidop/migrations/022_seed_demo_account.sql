-- 022: Create guest showcase account
-- Login: guest@csidop.showcase / code: 000000
-- Requires GUEST_ACCOUNT_EMAIL=guest@csidop.showcase in .env

BEGIN;

INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, productivityfactor, dailyusablehours, status, systemconfigflag)
SELECT 'GUEST-001', 'Guest User', 'guest@csidop.showcase',
       r.id, d.id, NULL, 0.80, 8.0, 'Active', false
FROM role r, department d
WHERE r.rolecode = 'TL' AND d.deptcode = 'CSI'
ON CONFLICT (email) DO NOTHING;

COMMIT;
