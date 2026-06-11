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
  const { name, city, postcode, website, address } = req.body || {};
// Parse full address: 'Monhofer Str. 1, 42697 Solingen'
let parsedStreet=null,parsedPLZ=postcode||null,parsedCity=city||null;
if(address){const _am=address.match(/^(.+?),\s*(\d{5})\s+(.+)$/);if(_am){parsedStreet=_am[1].trim();parsedPLZ=_am[2];parsedCity=_am[3].trim();}}
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
    if (!compR.ok) {
      // If duplicate, find the existing company and return its id so we can still add a contact
      if (compData?.errorCode === 'DUPLICATED' || compData?.message?.includes('already associated')) {
        // First: check KV cache for this company's ID (fastest path)
        try {
          const kvUrl = process.env.KV_REST_API_URL;
          const kvToken = process.env.KV_REST_API_TOKEN;
          if (kvUrl && kvToken) {
            const gr = await fetch(`${kvUrl}/get/${encodeURIComponent('portalhub:added_companies_v1')}`, {
              headers: { Authorization: `Bearer ${kvToken}` }
            });
            const gd = await gr.json();
            const entries = Array.isArray(gd.result) ? gd.result : (typeof gd.result === 'string' ? JSON.parse(gd.result) : []);
            const normQ = name.toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
            const cached = entries.find(e => {
              const eName = (typeof e === 'string' ? e : e?.name) || '';
              const eNorm = eName.toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
              return eNorm === normQ;
            });
            if (cached?.id) {
              console.log('Found ID in KV cache:', cached.id, cached.name);
              return res.status(200).json({ ok: true, id: cached.id, name: cached.name || name, locationId: null, website: null, existing: true });
            }
          }
        } catch(e) { console.log('KV lookup failed:', e.message); }
        try {
          const normQ = name.toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
          let found = null;
          // Vincere returns max 10 per page - scan pages with start=0,10,20,...
          // 'A' names are in first ~30 pages (300 companies sorted), scan up to 50 pages
          for (let start = 0; start <= 500 && !found; start += 10) {
            const url = `https://${tenant}.vincere.io/api/v2/company/search/fl=id,name,website;sort=name asc?keyword=&start=${start}&rows=10`;
            const cr = await fetch(url, { headers: h });
            if (!cr.ok) break;
            const cd = await cr.json();
            const items = cd.result?.items || [];
            if (!items.length) break;
            found = items.find(c => {
              const normC = (c.name||'').toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
              return normC === normQ || normC.includes(normQ.substring(0,10)) || normQ.includes(normC.substring(0,10));
            });
            // Early exit: if first item is alphabetically past our target, stop
            const firstName = (items[0]?.name||'').toLowerCase();
            if (firstName > name.toLowerCase().substring(0,4) + 'zzzz') break;
          }
          if (found) {
            console.log('Found company:', found.id, found.name);
            // Cache in KV for future lookups
            try {
              const kvUrl2 = process.env.KV_REST_API_URL;
              const kvToken2 = process.env.KV_REST_API_TOKEN;
              if (kvUrl2 && kvToken2) {
                const gr2 = await fetch(`${kvUrl2}/get/${encodeURIComponent('portalhub:added_companies_v1')}`, { headers:{Authorization:`Bearer ${kvToken2}`} });
                const gd2 = await gr2.json();
                let entries2 = [];
                if (Array.isArray(gd2.result)) entries2 = gd2.result;
                else if (typeof gd2.result === 'string') { try { entries2 = JSON.parse(gd2.result); } catch {} }
                const normQ2 = name.toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'');
                if (!entries2.some(e => { const n=(typeof e==='string'?e:e?.name)||''; return n.toLowerCase().replace(/\s+/g,'').replace(/gmbh|ag|kg|se/g,'')===normQ2; })) {
                  entries2.unshift({name: found.name, id: found.id});
                  await fetch(`${kvUrl2}/set/${encodeURIComponent('portalhub:added_companies_v1')}`, {
                    method:'POST', headers:{Authorization:`Bearer ${kvToken2}`,'Content-Type':'application/json'},
                    body: JSON.stringify(entries2)
                  });
                  console.log('Cached company ID in KV:', found.id, found.name);
                }
              }
            } catch(e) { console.log('KV cache save failed:', e.message); }
            return res.status(200).json({ ok: true, id: found.id, name: found.name, locationId: null, website: found.website||null, existing: true });
          }
        } catch (e) { console.log('Company lookup failed:', e.message); }
        return res.status(200).json({ ok: true, id: null, name, locationId: null, website: null, existing: true, duplicated: true });
      }
      return res.status(200).json({ ok: false, vincereError: compData, status: compR.status });
    }

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
    if ((parsedCity || parsedPLZ || parsedStreet) && companyId) {
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
      const KV_KEY = 'portalhub:added_companies_v1';
      const kvUrl = process.env.KV_REST_API_URL;
      const kvToken = process.env.KV_REST_API_TOKEN;
      if (kvUrl && kvToken) {
        const getR = await fetch(`${kvUrl}/get/${encodeURIComponent(KV_KEY)}`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        const getData = await getR.json();
        let rawParsed = [];
        if (getData.result) {
          if (Array.isArray(getData.result)) rawParsed = getData.result;
          else if (typeof getData.result === 'string') {
            try { rawParsed = JSON.parse(getData.result); } catch {}
          }
        }
        const existing = Array.isArray(rawParsed)
          ? rawParsed.filter(n => typeof n === 'string' && n.length > 3)
          : [];
        // Store as {name, id} objects for future DUPLICATED lookups
        const newEntry = { name: compData.company_name, id: companyId };
        const alreadyThere = existing.some(e => (typeof e === 'string' ? e : e?.name) === compData.company_name);
        if (!alreadyThere) {
          existing.unshift(newEntry);
          await fetch(`${kvUrl}/set/${encodeURIComponent(KV_KEY)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(existing)
          });
        }
      }
    } catch (e) { console.log('KV save failed:', e.message); }

    return res.status(200).json({ ok: true, id: companyId, name: compData.company_name, locationId, website: website || null });
  } catch (e) {
    console.error('add-company error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
