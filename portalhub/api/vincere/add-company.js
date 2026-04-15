export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const cookieStr = req.headers.cookie || '';
  const cookies = Object.fromEntries(cookieStr.split(';').map(c => {
    const [k,...v] = c.trim().split('='); return [k, v.join('=')];
  }));
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;
  const headers = Object.assign(
    { 'Content-Type': 'application/json', 'id-token': token, 'x-api-key': apiKey },
    appId ? { 'app-id': appId } : {}
  );

  const { name, city, postcode, country } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  // Build payload - Vincere uses company_name field
  const payload = { company_name: name };

  // Add location if we have at least a city
  if (city) {
    payload.head_quarter = {
      location_name: [postcode, city].filter(Boolean).join(' '),
      city: city,
      postcode: postcode || '',
      country: country || 'DE',
    };
  }

  try {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await r.json();

    // Log error details for debugging
    if (!r.ok) {
      console.error('[add-company] Vincere error', r.status, JSON.stringify(data));
    }

    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
