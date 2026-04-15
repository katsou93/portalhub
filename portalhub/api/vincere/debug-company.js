export default async function handler(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const headers = { 'id-token': token, 'x-api-key': apiKey };

  // Load 5 pages of IDs (50 companies) and get their status_id
  const allIds = [];
  for (let start = 0; start < 50; start += 10) {
    const r = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start=' + start + '&rows=500',
      { headers }
    );
    const d = await r.json();
    allIds.push(...(d.result?.items || []).map(c => c.id));
  }

  // Get details for all 50
  const details = await Promise.all(allIds.map(async id => {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + id, { headers });
    const d = await r.json();
    return { id, name: d.company_name, status_id: d.status_id };
  }));

  // Build unique status_id map
  const statusMap = {};
  details.forEach(d => { if (d.status_id) statusMap[d.status_id] = (statusMap[d.status_id] || 0) + 1; });

  return res.status(200).json({ statusMap, details: details.slice(0, 10) });
}
