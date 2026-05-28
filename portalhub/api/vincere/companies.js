const KV_KEY = 'portalhub:added_companies_v1';

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
}

function parseCookies(req) {
  const c = {};
  (req.headers.cookie||'').split(';').forEach(s=>{const t=s.trim();const i=t.indexOf('=');if(i>0)c[t.slice(0,i).trim()]=t.slice(i+1);});
  return c;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req);
  const token = cookies.vincere_token;
  if(!token) return res.status(401).json({error:'not_authenticated'});

  const tenant   = process.env.VINCERE_TENANT;
  const apiKey   = process.env.VINCERE_API_KEY;
  const clientId = process.env.VINCERE_CLIENT_ID;
  const refreshTok = cookies.vincere_refresh_token;

  let validToken = token;

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
        validToken = d.id_token || d.access_token;
        res.setHeader('Set-Cookie', [`vincere_token=${validToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${d.expires_in || 3600}`]);
      }
    }
  }

  // POST: add a company name to our KV list
  if (req.method === 'POST') {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const existing = await kvGet(KV_KEY) || [];
      if (!existing.includes(name)) {
        existing.unshift(name);
        await kvSet(KV_KEY, existing);
      }
      return res.status(200).json({ ok: true, total: existing.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET: return our KV list + Vincere's search index (first page)
  try {
    const kvNames = await kvGet(KV_KEY) || [];

    // Also get first 100 from Vincere search (for existing pre-portalhub companies)
    const vincereNames = [];
    try {
      const url = `https://${tenant}.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?rows=100&start=0`;
      const r = await fetch(url, { headers: { 'id-token': validToken, 'x-api-key': apiKey } });
      if (r.ok) {
        const d = await r.json();
        (d.result?.items || []).forEach(c => { if (c.name) vincereNames.push(c.name); });
      }
    } catch {}

    // Merge: KV list + Vincere (deduplicated)
    const allNames = [...kvNames];
    vincereNames.forEach(n => { if (!allNames.some(k => k.toLowerCase() === n.toLowerCase())) allNames.push(n); });

    return res.status(200).json({ names: allNames, total: allNames.length, connected: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
