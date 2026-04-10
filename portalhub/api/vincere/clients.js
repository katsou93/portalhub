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
    // Step 1: Load ALL companies with stage_status in search (8 requests total, not 3796)
    const allItems = [];
    let start = 0;
    let total = 9999;

    while (start < total) {
      const r = await fetch(
        'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status,stage_status,web_site;sort=name asc?keyword=&start=' + start + '&rows=500',
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

    // Step 2: Filter to only companies that have a stage_status set
    const withStatus = allItems.filter(c => c.stage_status);

    // Step 3: For those with status, fetch detail to get website (batch of 20 parallel)
    const clients = [];
    const batchSize = 20;

    for (let i = 0; i < withStatus.length; i += batchSize) {
      const batch = withStatus.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map(async item => {
          try {
            const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
            if (!r.ok) return { id: item.id, name: item.name, status: item.stage_status, website: item.web_site || null, careersite_url: null };
            const d = await r.json();
            return {
              id: item.id,
              name: d.company_name || item.name,
              status: item.stage_status,
              website: d.website || item.web_site || null,
              careersite_url: d.careersite_url || null,
            };
          } catch(e) {
            return { id: item.id, name: item.name, status: item.stage_status, website: item.web_site || null, careersite_url: null };
          }
        })
      );
      clients.push(...details);
    }

    // Step 4: Group by status
    const grouped = {};
    for (const c of clients) {
      const key = c.status || 'Kein Status';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    }

    // Also return all unique statuses found
    const allStatuses = [...new Set(allItems.map(c => c.stage_status).filter(Boolean))];

    return res.status(200).json({ clients, grouped, total: clients.length, allStatuses });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
