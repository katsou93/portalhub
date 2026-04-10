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

  // ?batch=0 returns details for companies 0-49
  // Frontend calls repeatedly: batch=0, batch=1, batch=2... until hasMore=false
  const batch = parseInt(req.query.batch || '0', 10);
  const batchSize = 30; // 30 detail calls per request = safe within 10s timeout

  try {
    // First get all company IDs (search is fast - just IDs)
    const allIds = [];
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
      allIds.push(...items.map(i => ({ id: i.id, name: i.name })));
      if (items.length < 500) break;
      start += 500;
    }

    // Get this batch of IDs
    const batchIds = allIds.slice(batch * batchSize, (batch + 1) * batchSize);
    
    // Fetch details for this batch in parallel
    const clients = await Promise.all(
      batchIds.map(async item => {
        try {
          const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
          if (!r.ok) return null;
          const d = await r.json();
          const status = d.stage_status || null;
          if (!status) return null; // Skip companies without a status
          return {
            id: item.id,
            name: d.company_name || item.name,
            status,
            website: d.website || null,
            careersite_url: d.careersite_url || null,
          };
        } catch(e) { return null; }
      })
    );

    const filtered = clients.filter(Boolean);
    const hasMore = (batch + 1) * batchSize < allIds.length;

    return res.status(200).json({
      clients: filtered,
      batch,
      hasMore,
      nextBatch: batch + 1,
      totalCompanies: allIds.length,
      processed: Math.min((batch + 1) * batchSize, allIds.length),
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
