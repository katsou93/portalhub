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

  // Try multiple query syntaxes until one works
  const queries = [
    'q=name:*&start=0&rows=500',
    'q=*:*&start=0&rows=500',
    'q=name:(*)&start=0&rows=500',
    'q=id:*&start=0&rows=500',
    'keyword=&start=0&rows=500',
  ];

  const base = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?';

  for (const q of queries) {
    try {
      const r = await fetch(base + q, { headers });
      const text = await r.text();
      if (r.ok) {
        const data = JSON.parse(text);
        const items = data.result || data.results || data.items || [];
        const names = [...new Set(items.map(c => c.name || '').filter(Boolean))];
        console.log('[companies] worked with:', q, '| count:', names.length);
        return res.status(200).json({ names, total: names.length, query_used: q });
      }
      console.log('[companies] failed:', q, r.status, text.substring(0,100));
    } catch(e) {
      console.log('[companies] error:', q, e.message);
    }
  }

  return res.status(500).json({ error: 'All query syntaxes failed' });
}
