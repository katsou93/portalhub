export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey  = process.env.VINCERE_API_KEY;
  const appId   = process.env.VINCERE_APP_ID;
  const headers = { 'id-token': token, 'x-api-key': appId || apiKey };
  if (appId) headers['app-id'] = appId;

  try {
    // Load ALL companies page by page (500 per request)
    const allNames = [];
    let start = 0;
    let total = null;

    while (true) {
      const url = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start=' + start + '&rows=500';
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const items = d.result?.items || [];
      if (total === null) total = d.result?.total || 0;
      items.forEach(c => { if (c.name) allNames.push(c.name); });
      start += items.length;
      if (items.length < 500 || start >= total) break;
      // Safety: max 20 pages (10000 companies)
      if (start >= 10000) break;
    }

    return res.status(200).json({ names: allNames, total: allNames.length, connected: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
