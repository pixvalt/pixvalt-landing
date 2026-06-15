const PUB_ID  = 'pub_a073c8b2-377b-47d9-ba7e-1fbbcd94bc49';
const API_KEY = 'VdkZX34mbms0ypaCZZItnW1VSJkc0lJvTXGO0vKOwNt5LykPRZrLqKU5FtK7uf7U';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, utm_medium } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
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
