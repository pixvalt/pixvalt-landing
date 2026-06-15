const PUB_ID  = 'pub_a073c8b2-377b-47d9-ba7e-1fbbcd94bc49';
const API_KEY = 'VdkZX34mbms0ypaCZZItnW1VSJkc0lJvTXGO0vKOwNt5LykPRZrLqKU5FtK7uf7U';

const WINDOW_MS    = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;
const rateMap      = new Map();

function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : req.socket?.remoteAddress || 'unknown').trim();
}

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = rateMap.get(ip);

  // First request from this IP, or window expired — reset
  if (!entry || now - entry.first > WINDOW_MS) {
    rateMap.set(ip, { count: 1, first: now });
    return false;
  }

  // Within window — check limit
  if (entry.count >= MAX_ATTEMPTS) return true;

  entry.count++;
  return false;
}

// Purge stale entries every 100 requests to prevent memory growth
let purgeCounter = 0;
function maybePurge() {
  if (++purgeCounter % 100 !== 0) return;
  const now = Date.now();
  for (const [ip, entry] of rateMap.entries()) {
    if (now - entry.first > WINDOW_MS) rateMap.delete(ip);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getIP(req);
  maybePurge();

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }

  const { email, utm_medium } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${PUB_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          utm_source: 'pixvalt_landing',
          utm_medium: utm_medium || 'unknown',
          reactivate_existing: false,
          send_welcome_email: true
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Beehiiv error:', data);
      return res.status(response.status).json({ error: 'Subscription failed' });
    }

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
