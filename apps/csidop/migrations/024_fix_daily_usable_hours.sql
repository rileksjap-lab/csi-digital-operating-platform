-- Migration 024: Sync DailyUsableHours = 8 × ProductivityFactor for all staff
-- Fixes stale values where the two were out of sync.

UPDATE staff SET dailyusablehours = 8.0 * productivityfactor
WHERE dailyusablehours != 8.0 * productivityfactor;
