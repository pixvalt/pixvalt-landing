const SUPABASE_URL         = 'https://ffrsjumreqzwmfdohfft.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcnNqdW1yZXF6d21mZG9oZmZ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTY0NTM2NywiZXhwIjoyMDk3MjIxMzY3fQ.seQpclLcizTpJyHGOcPYhjRw9vZJxLFIXnVNZf5bguw';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=id`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey:        SUPABASE_SERVICE_KEY,
        Prefer:        'count=exact',
        Range:         '0-0'
      }
    });

    const contentRange = r.headers.get('content-range') || '0-0/0';
    const total = parseInt(contentRange.split('/')[1] || '0', 10);

    return res.status(200).json({ count: total });
  } catch (err) {
    console.error('count error:', err);
    return res.status(500).json({ count: 0 });
  }
}
