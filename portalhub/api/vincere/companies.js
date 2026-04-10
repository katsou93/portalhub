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

  const base = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?';

  const { names } = req.query;

  if (names) {
    // Check specific BA company names against Vincere using keyword search
    // keyword=Bosch will find "Robert Bosch GmbH" even though BA shows "Bosch GmbH"
    const nameList = names.split(',').map(n => n.trim()).filter(Boolean).slice(0, 30);
    const found = [];

    for (const name of nameList) {
      // Extract first meaningful word(s) for keyword search
      const keyword = name
        .replace(/gmbh|ag|kg|se|ltd|inc|corp|co\.?|&/gi, '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join(' ')
        .trim();

      if (!keyword || keyword.length < 2) continue;

      try {
        const url = base + 'keyword=' + encodeURIComponent(keyword) + '&start=0&rows=10';
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const d = await r.json();
        const items = (d.result?.items || d.result || d.results || d.items || []);
        if (items.length > 0) {
          // Return ALL names found for this keyword so frontend can fuzzy match
          found.push(...items.map(c => c.name).filter(Boolean));
        }
      } catch(e) {}
    }

    return res.status(200).json({ names: [...new Set(found)], total: found.length });
  }

  // No names: load ALL companies (paginate through all pages)
  const allNames = [];
  const pageSize = 500;
  let start = 0;
  let total = 9999;

  while (start < total && start < 5000) {
    try {
      const url = base + 'keyword=&start=' + start + '&rows=' + pageSize;
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const items = d.result?.items || d.result || [];
      total = d.result?.total || total;
      if (!items.length) break;
      allNames.push(...items.map(c => c.name).filter(Boolean));
      start += pageSize;
      if (items.length < pageSize) break;
    } catch(e) { break; }
  }

  return res.status(200).json({ names: [...new Set(allNames)], total: allNames.length, connected: true });
}
