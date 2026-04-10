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
    const r = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/find?query=*&limit=500',
      { headers }
    );
    const text = await r.text();
    if (!r.ok) {
      console.error('[companies] ' + r.status + ':', text.substring(0,200));
      return res.status(r.status).json({ error: text.substring(0,200) });
    }
    const data = JSON.parse(text);
    
    // Extract names from ALL possible field names Vincere might use
    const items = data.result || data.results || data.items || data.companies || [];
    const names = [...new Set(
      items.map(c => 
        c.name || c.company_name || c.registered_name || 
        c.trading_name || c.legal_name || ''
      ).filter(Boolean)
    )];
    
    console.log('[companies] total:', data.total || items.length, '| names:', names.slice(0,5).join(', ') || 'NONE FOUND');
    console.log('[companies] first item keys:', items[0] ? Object.keys(items[0]).join(',') : 'NO ITEMS');
    
    // Return both the names array AND raw data so frontend can debug
    return res.status(200).json({ names, total: names.length, raw: items.slice(0,3) });
  } catch(e) {
    console.error('[companies] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
