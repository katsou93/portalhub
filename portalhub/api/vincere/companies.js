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

  const { names, debug } = req.query;

  // Debug mode: try different query syntaxes and show raw results
  if (debug) {
    const testName = debug;
    const base = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?';
    const results = {};
    
    const queries = [
      ['default_field', 'q=' + encodeURIComponent(testName) + '&start=0&rows=5'],
      ['name_exact', 'q=name:' + encodeURIComponent(testName) + '&start=0&rows=5'],
      ['name_wildcard', 'q=name:' + encodeURIComponent(testName + '*') + '&start=0&rows=5'],
      ['name_contains', 'q=name:' + encodeURIComponent('*' + testName + '*') + '&start=0&rows=5'],
      ['registered_name', 'q=registered_name:' + encodeURIComponent(testName) + '&start=0&rows=5'],
      ['keyword', 'keyword=' + encodeURIComponent(testName) + '&start=0&rows=5'],
    ];

    for (const [key, q] of queries) {
      try {
        const r = await fetch(base + q, { headers });
        const text = await r.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch(e) { parsed = text.substring(0,100); }
        results[key] = { status: r.status, items: (parsed?.result||parsed?.results||parsed?.items||[]).length, raw: JSON.stringify(parsed).substring(0,200) };
      } catch(e) {
        results[key] = { error: e.message };
      }
    }
    return res.status(200).json(results);
  }

  // Normal mode: check specific names
  if (names) {
    const nameList = names.split(',').map(n => n.trim()).filter(Boolean).slice(0, 50);
    const found = [];
    const base = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?';

    for (const name of nameList) {
      // Try multiple query strategies per name
      const strategies = [
        'q=' + encodeURIComponent(name) + '&start=0&rows=3',
        'q=name:' + encodeURIComponent(name) + '&start=0&rows=3',
        'q=name:' + encodeURIComponent(name.split(' ')[0] + '*') + '&start=0&rows=3',
      ];
      
      let matched = false;
      for (const q of strategies) {
        try {
          const r = await fetch(base + q, { headers });
          if (!r.ok) continue;
          const d = await r.json();
          const items = d.result || d.results || d.items || [];
          if (items.length > 0) {
            found.push(...items.map(c => c.name).filter(Boolean));
            matched = true;
            break;
          }
        } catch(e) {}
      }
    }

    return res.status(200).json({ names: [...new Set(found)], total: found.length });
  }

  return res.status(200).json({ names: [], connected: true });
}
