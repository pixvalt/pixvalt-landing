const SUPABASE_URL         = 'https://ffrsjumreqzwmfdohfft.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcnNqdW1yZXF6d21mZG9oZmZ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTY0NTM2NywiZXhwIjoyMDk3MjIxMzY3fQ.seQpclLcizTpJyHGOcPYhjRw9vZJxLFIXnVNZf5bguw';
const SUPABASE_ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcnNqdW1yZXF6d21mZG9oZmZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDUzNjcsImV4cCI6MjA5NzIyMTM2N30.GQjzGTr1TbDfqSig2rprIGKouUOtH8mWDYYHIbKfl2M';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.replace('Bearer ', '').trim();

  // Verify the token by fetching the authenticated user from Supabase Auth
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY
    }
  });

  if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });

  const user = await userRes.json();
  const email = user.email?.toLowerCase();
  if (!email) return res.status(401).json({ error: 'No email in session' });

  // Fetch subscriber record using service role (bypasses RLS)
  const [subRes, countRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&select=*&limit=1`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY
      }
    }),
    fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=id`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    })
  ]);

  const subscribers = await subRes.json();
  if (!Array.isArray(subscribers) || subscribers.length === 0) {
    return res.status(404).json({ error: 'Not on waitlist' });
  }

  const sub = subscribers[0];
  const contentRange = countRes.headers.get('content-range') || '0-0/0';
  const total = parseInt(contentRange.split('/')[1] || '0', 10);

  return res.status(200).json({
    position:        sub.waitlist_position || 1,
    total:           total,
    referral_count:  sub.referral_count || 0,
    referral_code:   sub.referral_code  || '',
    email:           sub.email,
    joined_at:       sub.joined_at
  });
}
