const BEEHIIV_PUB_ID       = 'pub_a073c8b2-377b-47d9-ba7e-1fbbcd94bc49';
const BEEHIIV_API_KEY      = 'VdkZX34mbms0ypaCZZItnW1VSJkc0lJvTXGO0vKOwNt5LykPRZrLqKU5FtK7uf7U';
const SUPABASE_URL         = 'https://ffrsjumreqzwmfdohfft.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcnNqdW1yZXF6d21mZG9oZmZ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTY0NTM2NywiZXhwIjoyMDk3MjIxMzY3fQ.seQpclLcizTpJyHGOcPYhjRw9vZJxLFIXnVNZf5bguw';

// ── Rate limiter ──────────────────────────────────────────────
const WINDOW_MS    = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const rateMap      = new Map();

function getIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0] : req.socket?.remoteAddress || 'unknown').trim();
}

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    rateMap.set(ip, { count: 1, first: now });
    return false;
  }
  if (entry.count >= MAX_ATTEMPTS) return true;
  entry.count++;
  return false;
}

let purgeCounter = 0;
function maybePurge() {
  if (++purgeCounter % 100 !== 0) return;
  const now = Date.now();
  for (const [ip, e] of rateMap.entries()) {
    if (now - e.first > WINDOW_MS) rateMap.delete(ip);
  }
}

// ── Supabase helpers ──────────────────────────────────────────
const SB_HEADERS = {
  'Content-Type':  'application/json',
  Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
  apikey:          SUPABASE_SERVICE_KEY
};

async function insertSubscriber(email, referral_code, referred_by, beehiiv_id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
    method:  'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({
      email,
      referral_code,
      referred_by:      referred_by || null,
      referral_count:   0,
      waitlist_position: null,
      beehiiv_id
    })
  });
  return res;
}

async function handleReferral(referrer_code) {
  // Increment referrer's count then recalculate all positions
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/handle_referral`, {
    method:  'POST',
    headers: SB_HEADERS,
    body:    JSON.stringify({ referrer_code })
  });
}

async function recalculatePositions() {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/recalculate_positions`, {
    method:  'POST',
    headers: SB_HEADERS,
    body:    '{}'
  });
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = getIP(req);
  maybePurge();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }

  const { email, utm_medium, ref_code } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const cleanEmail   = email.trim().toLowerCase();
  const cleanRefCode = (ref_code && typeof ref_code === 'string') ? ref_code.trim() : '';

  // 1 — Subscribe in Beehiiv
  let referral_code = '';
  let beehiiv_id    = '';
  try {
    const bRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BEEHIIV_API_KEY}` },
        body: JSON.stringify({
          email:                cleanEmail,
          utm_source:           'pixvalt_landing',
          utm_medium:           utm_medium || 'unknown',
          utm_campaign:         cleanRefCode ? 'ref_' + cleanRefCode : '',
          reactivate_existing:  false,
          send_welcome_email:   true
        })
      }
    );
    const bData = await bRes.json();
    referral_code = bData.data?.referral_code || '';
    beehiiv_id    = bData.data?.id            || '';
  } catch (err) {
    console.error('Beehiiv error:', err);
    return res.status(500).json({ error: 'Subscription failed' });
  }

  // 2 — Upsert into Supabase waitlist table (ignore if already exists)
  try {
    await insertSubscriber(cleanEmail, referral_code, cleanRefCode, beehiiv_id);

    // 3 — If referred, increment referrer's count and recalculate positions
    if (cleanRefCode) {
      await handleReferral(cleanRefCode);
    } else {
      await recalculatePositions();
    }
  } catch (err) {
    console.error('Supabase error:', err);
    // Don't fail the signup — Beehiiv already succeeded
  }

  return res.status(201).json({ success: true, referral_code });
}
