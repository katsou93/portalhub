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

  const tenant = process.env.VINCERE_TENANT;
    const apiKey = process.env.VINCERE_API_KEY;
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
                const normQ = companyName.toLowerCase().replace(/\s+/g, '').replace(/gmbh|ag|kg|se/g, '');
                // FIX: use let foundCompany in outer scope so loop condition works correctly
          let foundCompany = null;
                for (let start = 0; start <= 200 && !foundCompany; start += 10) {
                          const sr = await fetch(
                                      `https://${tenant}.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start=${start}&rows=10`,
                            { headers: h }
                                    ).catch(() => null);
                          if (!sr || !sr.ok) continue;
                          const sd = await sr.json().catch(() => ({}));
                          foundCompany = (sd.result?.items || []).find(c => {
                                      const normC = (c.name || '').toLowerCase().replace(/\s+/g, '').replace(/gmbh|ag|kg|se/g, '');
                                      return normC === normQ
                                        || normC.includes(normQ.substring(0, 10))
                                        || normQ.includes(normC.substring(0, 10));
                          }) || null;
                }
                if (foundCompany) {
                          resolvedCompanyId = foundCompany.id;
                          console.log('Found company for contact:', foundCompany.id, foundCompany.name);
                } else {
                          // Fallback: try keyword search directly
                  const kwR = await fetch(
                              `https://${tenant}.vincere.io/api/v2/company/search/fl=id,name?keyword=${encodeURIComponent(companyName)}&rows=5`,
                    { headers: h }
                            ).catch(() => null);
                          if (kwR && kwR.ok) {
                                      const kwD = await kwR.json().catch(() => ({}));
                                      const kwHit = (kwD.result?.items || []).find(c => {
                                                    const normC = (c.name || '').toLowerCase().replace(/\s+/g, '').replace(/gmbh|ag|kg|se/g, '');
                                                    return normC === normQ || normC.includes(normQ.substring(0, 6)) || normQ.includes(normC.substring(0, 6));
                                      });
                                      if (kwHit) {
                                                    resolvedCompanyId = kwHit.id;
                                                    console.log('Found company via keyword search:', kwHit.id, kwHit.name);
                                      }
                          }
                }
        } catch (e) {
                console.log('Company lookup failed:', e.message);
        }
  }

  const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

  // Build contact payload
  const payload = { registration_date: today };
    if (resolvedCompanyId) payload.company_id = resolvedCompanyId;
    if (firstName) payload.first_name = firstName;
    if (lastName) payload.last_name = lastName;
    if (email) payload.email = email;
    if (phone) payload.phone = phone;
    if (position) payload.job_title = position;

  // If no name but only email - use email prefix as placeholder
  if (!firstName && !lastName && email) {
        const prefix = email.split('@')[0];
        payload.first_name = prefix;
        payload.last_name = '-';
  }

  // If nothing useful, skip
  if (!payload.first_name && !payload.email) {
        return res.status(200).json({ ok: false, error: 'No contact data to add' });
  }

  try {
        // Duplicate check
      const searchQuery = email
          ? email
              : `${payload.first_name || ''} ${payload.last_name || ''}`.trim();

      if (searchQuery) {
              const checkUrl = `https://${tenant}.vincere.io/api/v2/contact/search/fl=id,email,first_name,last_name?keyword=${encodeURIComponent(searchQuery)}&rows=5`;
              const checkR = await fetch(checkUrl, { headers: h }).catch(() => null);
              if (checkR && checkR.ok) {
                        const checkData = await checkR.json().catch(() => ({}));
                        const existing = (checkData.result?.items || []).find(c => {
                                    if (email && c.email === email) return true;
                                    if (payload.first_name && payload.last_name) {
                                                  const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().trim();
                                                  const newName = `${payload.first_name} ${payload.last_name}`.toLowerCase().trim();
                                                  if (fullName === newName) return true;
                                    }
                                    return false;
                        });
                        if (existing) {
                                    console.log('Contact already exists:', existing.id);
                                    return res.status(200).json({ ok: true, id: existing.id, existing: true });
                        }
              }
      }

      // Create contact
      const r = await fetch(`https://${tenant}.vincere.io/api/v2/contact`, {
              method: 'POST',
              headers: h,
              body: JSON.stringify(payload),
      });

      const text = await r.text();
        let data = {};
        try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

      if (!r.ok) {
              console.error('Vincere contact create failed:', r.status, text);
              return res.status(200).json({ ok: false, error: `Vincere ${r.status}`, detail: text });
      }

      const contactId = data.id || data.contact_id || null;
        console.log('Contact created:', contactId, payload.first_name, payload.last_name);
        return res.status(200).json({ ok: true, id: contactId, data });

  } catch (e) {
        console.error('add-contact error:', e.message);
        return res.status(500).json({ ok: false, error: e.message });
  }
}
