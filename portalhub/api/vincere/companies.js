export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';')
      .map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey  = process.env.VINCERE_API_KEY;
  const appId   = process.env.VINCERE_APP_ID;

  const headers = { 'id-token': token, 'x-api-key': apiKey };
  if (appId) headers['app-id'] = appId;

  try {
    // Correct Vincere API: /api/v2/company/find (not search)
    // query=* returns all, limit=500
    const url = 'https://' + tenant + '.vincere.io/api/v2/company/find?query=*&limit=500&offset=0';
    const r = await fetch(url, { headers });

    const text = await r.text();
    if (!r.ok) {
      console.error('Vincere companies', r.status, text.substring(0, 300));
      return res.status(r.status).json({ error: text.substring(0, 200) });
    }

    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (e) {
    console.error('Companies error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
