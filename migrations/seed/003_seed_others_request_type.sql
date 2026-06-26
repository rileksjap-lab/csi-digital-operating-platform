-- Add additional request types (TypeCode 13–15) for non-technical workloads
INSERT INTO REQUEST_TYPE (TypeCode, TypeName, Domain, SlaAckDays, SlaClassifyDays, SlaRouteDays) VALUES
    (13, 'Others',                      'Others', 1, 2, 3),
    (14, 'Training/Event/Knowledge',    'Others', 1, 2, 3),
    (15, 'HR Matters',                  'Others', 1, 2, 3)
ON CONFLICT (TypeCode) DO NOTHING;
