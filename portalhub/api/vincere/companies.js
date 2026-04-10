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

  const start = parseInt(req.query.start || '0', 10);
  const rows = 500;

  // Fetch ALL available fields to understand the data structure
  const url = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status,company_type,ownership_type,client_source,type;sort=name asc?keyword=&start=' + start + '&rows=' + rows;

  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const d = await r.json();
    const items = d.result?.items || [];
    const total = d.result?.total || 0;

    const companies = items.map(c => ({
      name: c.name,
      status: c.status,
      company_type: c.company_type,
      ownership_type: c.ownership_type,
      type: c.type,
    })).filter(c => c.name);

    const statuses = [...new Set(items.map(c => c.status).filter(s => s !== undefined && s !== null))];
    const types = [...new Set(items.map(c => c.company_type).filter(t => t !== undefined && t !== null))];

    return res.status(200).json({
      companies,
      names: companies.map(c => c.name),
      statuses,
      types,
      total,
      start,
      hasMore: start + rows < total,
      nextStart: start + rows
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
