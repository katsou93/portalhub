export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, status: 'ready' });
  if (req.method !== 'POST') return res.status(405).end();

  const cookieStr = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieStr.split(';').map(c => { const [k,...v]=c.trim().split('='); return [k.trim(),v.join('=')]; }).filter(([k])=>k)
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const { companyId, website } = req.body || {};
  if (!companyId || !website) return res.status(400).json({ error: 'companyId and website required' });

  try {
    const r = await fetch(`https://${tenant}.vincere.io/api/v2/company/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'id-token': token, 'x-api-key': apiKey },
      body: JSON.stringify({ website }),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(200).json({ ok: r.ok, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
