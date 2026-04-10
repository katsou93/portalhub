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

  try {
    // Step 1: Load all companies with IDs paginated
    const allItems = [];
    let start = 0;
    let total = 9999;

    while (start < total) {
      const r = await fetch(
        'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?keyword=&start=' + start + '&rows=500',
        { headers }
      );
      if (!r.ok) break;
      const d = await r.json();
      const items = d.result?.items || [];
      total = d.result?.total || 0;
      allItems.push(...items);
      if (items.length < 500) break;
      start += 500;
    }

    // Step 2: Fetch details in parallel batches of 10 to get stage_status + website
    const clients = [];
    const batchSize = 10;

    for (let i = 0; i < allItems.length; i += batchSize) {
      const batch = allItems.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map(async item => {
          try {
            const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
            if (!r.ok) return null;
            const d = await r.json();
            return {
              id: item.id,
              name: d.company_name || item.name,
              status: d.stage_status || null,
              website: d.website || null,
              careersite_url: d.careersite_url || null,
            };
          } catch(e) { return null; }
        })
      );
      clients.push(...details.filter(Boolean).filter(c => c.status));
    }

    // Group by status
    const grouped = {};
    for (const c of clients) {
      if (!grouped[c.status]) grouped[c.status] = [];
      grouped[c.status].push(c);
    }

    return res.status(200).json({ clients, grouped, total: clients.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
