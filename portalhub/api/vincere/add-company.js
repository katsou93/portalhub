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
  const headers = { 'Content-Type': 'application/json', 'id-token': token, 'x-api-key': apiKey };
  if (appId) headers['app-id'] = appId;

  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  // Step 1: Create company with just the name (minimal payload)
  const payload = { company_name: name };

  try {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company', {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      // Return the actual Vincere error so frontend can show it
      return res.status(200).json({ ok: false, vincereError: data, statusCode: r.status });
    }
    // Company created - return the new company ID
    return res.status(200).json({ ok: true, id: data.id, name: data.company_name });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
