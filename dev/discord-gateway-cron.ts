/**
 * Mimics the Vercel cron that hits /api/discord/gateway every 9 minutes.
 * The gateway handler runs for 10 minutes, so there's ~1 minute of overlap
 * where the new listener takes over via leader election and the old one
 * shuts down via heartbeat detection.
 *
 * Usage: npx tsx dev/discord-gateway-cron.ts
 */
import '../src/lib/load-env';

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error('Error: CRON_SECRET not found in environment');
  process.exit(1);
}

const URL = 'http://localhost:3000/api/discord/gateway';
const INTERVAL_MS = 9 * 60 * 1000;

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function fireRequest() {
  console.log(`[${timestamp()}] Sending request to gateway...`);

  // Fire-and-forget: the endpoint runs for ~10 minutes, but we don't
  // need to wait for it — the next request starts after 9 minutes
  // regardless, and takes over via leader election.
  fetch(URL, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
    .then(res => console.log(`[${timestamp()}]   -> HTTP ${res.status}`))
    .catch(err => console.error(`[${timestamp()}]   -> Error: ${err.message}`));
}

console.log(`Starting discord gateway cron (every ${INTERVAL_MS / 1000}s)`);
console.log(`URL: ${URL}`);

fireRequest();
setInterval(fireRequest, INTERVAL_MS);
