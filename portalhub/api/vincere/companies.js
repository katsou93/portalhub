export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.cookies?.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey  = process.env.VINCERE_API_KEY;
  const appId   = process.env.VINCERE_APP_ID;

  try {
    const r = await fetch(`https://${tenant}.vincere.io/api/v2/company/find?query=*&limit=500&offset=0`, {
      headers: {
        'id-token':  token,
        'x-api-key': apiKey,
        ...(appId ? { 'app-id': appId } : {}),
      }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
