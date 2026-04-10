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
  const headers = { 'id-token': token, 'x-api-key': apiKey };
  if (appId) headers['app-id'] = appId;

  // GET /api/vincere/companies?names=Bosch,Siemens,Festo
  const { names } = req.query;

  if (names) {
    // Check specific company names - search each one individually
    const nameList = names.split(',').map(n => n.trim()).filter(Boolean).slice(0, 30);
    const found = [];

    for (const name of nameList) {
      try {
        const encoded = encodeURIComponent(name.replace(/['"]/g, ''));
        const url = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?q=name:' + encoded + '&start=0&rows=5';
        const r = await fetch(url, { headers });
        if (r.ok) {
          const d = await r.json();
          const items = d.result || d.results || d.items || [];
          if (items.length > 0) {
            found.push(...items.map(c => c.name).filter(Boolean));
          }
        }
      } catch(e) {}
    }

    return res.status(200).json({ names: found, checked: nameList.length });
  }

  // No names param - return empty (we no longer try to load all)
  return res.status(200).json({ names: [], total: 0 });
}
