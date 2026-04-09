export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse cookies manually
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';')
      .map(c => c.trim().split('='))
      .filter(p => p.length >= 2)
      .map(([k, ...v]) => [k.trim(), v.join('=')])
  );

  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;

  try {
    // Use correct Vincere search endpoint with proper query
    const headers = {
      'id-token':  token,
      'x-api-key': apiKey,
    };
    if (appId) headers['app-id'] = appId;

    const r = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,company_type,status,web_site;sort=name asc?q=*',
      { headers }
    );

    if (!r.ok) {
      const err = await r.text();
      console.error('Vincere companies error:', r.status, err.substring(0, 200));
      return res.status(r.status).json({ error: 'Vincere API error', status: r.status, detail: err.substring(0,200) });
    }

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error('Companies error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
