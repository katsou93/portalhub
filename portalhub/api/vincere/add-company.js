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

  // Auto-refresh if token expired
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
          const exp = d.expires_in || 3600;
          res.setHeader('Set-Cookie', [`vincere_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${exp}`]);
        }
      }
    }
  }

  const h = { 'Content-Type': 'application/json', 'id-token': token, 'x-api-key': apiKey };
  const { name, city, postcode, website } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

  try {
    // Step 1: Create company
    const compR = await fetch(`https://${tenant}.vincere.io/api/v2/company`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ company_name: name, registration_date: today })
    });
    const compData = await compR.json();
    console.log('Company POST:', compR.status, JSON.stringify(compData).substring(0, 200));
    if (!compR.ok) return res.status(200).json({ ok: false, vincereError: compData, status: compR.status });

    const companyId = compData.id;

    // Step 2: Add website via PUT
    if (website && companyId) {
      await fetch(`https://${tenant}.vincere.io/api/v2/company/${companyId}`, {
        method: 'PUT', headers: h,
        body: JSON.stringify({ website })
      }).catch(() => {});
    }

    // Step 3: Add location as company address (correct endpoint)
    let locationId = null;
    if ((city || postcode) && companyId) {
      const locR = await fetch(`https://${tenant}.vincere.io/api/v2/company/${companyId}/location`, {
        method: 'POST', headers: h,
        body: JSON.stringify({
          location_name: [postcode, city].filter(Boolean).join(' '),
          address: [postcode, city].filter(Boolean).join(' '),
          city:     city     || '',
          post_code: postcode || '',
          country_code: 'DE',
          country: 'Germany',
          primary_billing_address: true,
        })
      }).catch(() => null);
      if (locR && locR.ok) {
        const locData = await locR.json().catch(() => ({}));
        locationId = locData.id || null;
        console.log('Location added:', locationId);
      } else if (locR) {
        const errText = await locR.text().catch(() => '');
        console.log('Location failed:', locR.status, errText.substring(0, 100));
      }
    }

    // Save company name to KV for fast matching on next search
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      const KV_KEY = 'portalhub:added_companies_v1';
      const existing = await redis.get(KV_KEY) || [];
      if (!existing.includes(compData.company_name)) {
        existing.unshift(compData.company_name);
        await redis.set(KV_KEY, existing);
      }
    } catch (e) { console.log('KV save failed:', e.message); }

    return res.status(200).json({ ok: true, id: companyId, name: compData.company_name, locationId, website: website || null });
  } catch (e) {
    console.error('add-company error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
