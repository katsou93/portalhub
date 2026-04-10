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

  const batch     = parseInt(req.query.batch || '0', 10);
  const batchSize = 25;

  try {
    // Step 1: Load ALL company IDs - keep ALL regardless of status
    // We need all because we dont know which search status maps to which stage_status
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
      // Keep ALL companies - we filter after getting stage_status from detail
      items.forEach(c => allIds.push({ id: c.id, name: c.name, searchStatus: c.status }));
      if (items.length < 500) break;
      start += 500;
    }

    // Step 2: Get this batch
    const batchIds  = allIds.slice(batch * batchSize, (batch + 1) * batchSize);
    const hasMore   = (batch + 1) * batchSize < allIds.length;

    // Step 3: Fetch details in parallel
    const clients = (await Promise.all(
      batchIds.map(async item => {
        try {
          const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
          if (!r.ok) return null;
          const d = await r.json();
          const status = d.stage_status || null;
          if (!status) return null; // skip companies with no stage
          return {
            id:            item.id,
            name:          d.company_name || item.name,
            status,
            website:       d.website || null,
            careersite_url: d.careersite_url || null,
          };
        } catch(e) { return null; }
      })
    )).filter(Boolean);

    return res.status(200).json({
      clients,
      batch,
      hasMore,
      nextBatch:     batch + 1,
      totalCompanies: allIds.length,
      processed:     Math.min((batch + 1) * batchSize, allIds.length),
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
