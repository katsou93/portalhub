export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  let token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant   = process.env.VINCERE_TENANT;
  const apiKey   = process.env.VINCERE_API_KEY;
  const clientId = process.env.VINCERE_CLIENT_ID;
  const refreshTok = cookies.vincere_refresh_token;

  // Auto-refresh token if expired
  const testR = await fetch(`https://${tenant}.vincere.io/api/v2/company/search/fl=id?rows=1`, {
    headers: { 'id-token': token, 'x-api-key': apiKey }
  }).catch(() => null);

  if (testR && testR.status === 401 && refreshTok && clientId) {
    const r = await fetch('https://id.vincere.io/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshTok })
    }).catch(() => null);
    if (r && r.ok) {
      const d = await r.json();
      if (d.id_token || d.access_token) {
        token = d.id_token || d.access_token;
        res.setHeader('Set-Cookie', [`vincere_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${d.expires_in || 3600}`]);
      }
    }
  }

  const headers = { 'id-token': token, 'x-api-key': apiKey };

  try {
    // Load ALL companies page by page (500 per request)
    const allNames = [];
    let start = 0;
    let total = null;

    while (true) {
      const url = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start=' + start + '&rows=500';
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const items = d.result?.items || [];
      if (total === null) total = d.result?.total || 0;
      items.forEach(c => { if (c.name) allNames.push(c.name); });
      start += items.length;
      if (items.length < 500 || start >= total) break;
      // Safety: max 20 pages (10000 companies)
      if (start >= 10000) break;
    }

    return res.status(200).json({ names: allNames, total: allNames.length, connected: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
