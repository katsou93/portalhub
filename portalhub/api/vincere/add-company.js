export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.cookies?.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey  = process.env.VINCERE_API_KEY;
  const appId   = process.env.VINCERE_APP_ID;
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const r = await fetch(`https://${tenant}.vincere.io/api/v2/company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'id-token':  token,
        'x-api-key': apiKey,
        ...(appId ? { 'app-id': appId } : {}),
      },
      body: JSON.stringify({ name, status: 'PROSPECT' })
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
