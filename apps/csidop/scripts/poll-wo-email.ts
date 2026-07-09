// Standalone cron script — polls IMAP for CMT WO emails.
//
// Run manually:   npx tsx scripts/poll-wo-email.ts
// Run via cron:   every 5 min in crontab
//   crontab: cd ~/csidop && npx tsx scripts/poll-wo-email.ts >> logs/wo-poller.log 2>&1

import "dotenv/config";

async function main() {
  // Dynamic import so env vars are loaded first
  const { pollForWoEmails } = await import("../src/lib/email/wo-poller");
  const count = await pollForWoEmails();
  console.log(`[${new Date().toISOString()}] Poll complete — ${count} WO(s) created`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[poll-wo-email] Fatal error:", err);
  process.exit(1);
});
