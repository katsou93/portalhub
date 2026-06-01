export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const cookieStr = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieStr.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    }).filter(([k]) => k)
  );

  let token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant   = process.env.VINCERE_TENANT;
  const apiKey   = process.env.VINCERE_API_KEY;
  const clientId = process.env.VINCERE_CLIENT_ID;
  const refreshTok = cookies.vincere_refresh_token;

  // Auto-refresh token if expired
  if (refreshTok && clientId) {
    const test = await fetch(`https://${tenant}.vincere.io/api/v2/company/search/fl=id?rows=1`, {
      headers: { 'id-token': token, 'x-api-key': apiKey }
    }).catch(() => null);
    if (test && test.status === 401) {
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
  }

  const h = { 'Content-Type': 'application/json', 'id-token': token, 'x-api-key': apiKey };
  const { firstName, lastName, email, phone, position, companyId, locationId } = req.body || {};

  // If no companyId, look up company by name in Vincere
  let resolvedCompanyId = companyId ? parseInt(companyId) : null;
  const companyName = req.body?.companyName;
  if (!resolvedCompanyId && companyName) {
    try {
      const normQ = companyName.toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
      // Scan first 200 companies (empty keyword = all, sorted by name)
      for (const start of [0, 100]) {
        const sr = await fetch(`https://${tenant}.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start=${start}&rows=100`, { headers: h });
        if (!sr.ok) continue;
        const sd = await sr.json();
        const found = (sd.result?.items||[]).find(c => {
          const normC = (c.name||'').toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
          return normC===normQ || normC.includes(normQ.substring(0,10)) || normQ.includes(normC.substring(0,10));
        });
        if (found) { resolvedCompanyId = found.id; console.log('Found company for contact:', found.id, found.name); break; }
        if ((sd.result?.items||[]).length < 100) break;
      }
    } catch(e) { console.log('Company lookup failed:', e.message); }
  }

  const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

  // Build contact payload
  const payload = {
    registration_date: today,
  };
  if (resolvedCompanyId) payload.company_id = resolvedCompanyId;

  if (firstName) payload.first_name = firstName;
  if (lastName)  payload.last_name  = lastName;
  if (email)     payload.email      = email;
  if (position)  payload.job_title  = position;

  // If no name but only email - use email prefix as placeholder
  if (!firstName && !lastName && email) {
    const prefix = email.split('@')[0];
    payload.first_name = prefix;
    payload.last_name  = '-';
  }

  // If nothing useful to add, skip
  if (!payload.first_name && !payload.email) {
    return res.status(200).json({ ok: false, error: 'No contact data to add' });
  }

  try {
    // Check if contact already exists for this company (avoid duplicates)
    const searchQuery = email
      ? `email:${email}`
      : `${payload.first_name || ''} ${payload.last_name || ''}`.trim();
    if (searchQuery) {
      const checkUrl = `https://${tenant}.vincere.io/api/v2/contact/search/fl=id,email,name?keyword=${encodeURIComponent(searchQuery)}&rows=5`;
      const checkR = await fetch(checkUrl, { headers: h }).catch(() => null);
      if (checkR && checkR.ok) {
        const checkData = await checkR.json().catch(() => ({}));
        const existing = (checkData.result?.items || []).find(c => {
          if (email && c.email === email) return true;
          if (payload.first_name && payload.last_name) {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
            const newName = `${payload.first_name} ${payload.last_name}`.toLowerCase();
            if (fullName.trim() === newName.trim()) return true;
          }
          return false;
        });
        if (existing) {
          console.log('Contact already exists:', existing.id);
          return res.status(200).json({ ok: true, id: existing.id, name: existing.name, existing: true });
        }
      }
    }

    const r = await fetch(`https://${tenant}.vincere.io/api/v2/contact`, {
      method: 'POST', headers: h,
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    console.log('Contact POST:', r.status, JSON.stringify(data).substring(0, 200));

    if (!r.ok) return res.status(200).json({ ok: false, vincereError: data });

    const contactId = data.id;

    // Add phone separately if provided (some Vincere versions need PUT)
    if (phone && contactId) {
      await fetch(`https://${tenant}.vincere.io/api/v2/contact/${contactId}`, {
        method: 'PUT', headers: h,
        body: JSON.stringify({ phone }),
      }).catch(() => {});
    }

    // Link contact to company location if locationId provided
    if (locationId && contactId) {
      await fetch(`https://${tenant}.vincere.io/api/v2/contact/${contactId}/location`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ location_id: parseInt(locationId) }),
      }).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      id: contactId,
      name: [firstName, lastName].filter(Boolean).join(' ') || email,
    });
  } catch (e) {
    console.error('add-contact error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
