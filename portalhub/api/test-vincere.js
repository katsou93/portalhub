export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookieStr = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieStr.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }).filter(([k]) => k)
  );
  
  const token = cookies.vincere_token;
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId = process.env.VINCERE_APP_ID;

  const results = {
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 30) + '...' : null,
    tenant,
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? apiKey.substring(0, 8) + '...' : null,
    appId,
  };

  if (!token) return res.status(200).json({ ...results, error: 'No cookie token - not logged in' });

  const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
  const headers = {
    'Content-Type': 'application/json',
    'id-token': token,
    'x-api-key': apiKey,
  };

  // Test 1: Company POST
  try {
    const r = await fetch(`https://${tenant}.vincere.io/api/v2/company`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ company_name: 'API_TEST_DELETEME_' + Date.now(), registration_date: today }),
    });
    const data = await r.json();
    results.company_post = { status: r.status, ok: r.ok, data };
    
    // Test 2: Contact POST (only if company created)
    if (r.ok && data.id) {
      const cr = await fetch(`https://${tenant}.vincere.io/api/v2/contact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          first_name: 'Test',
          last_name: 'Contact',
          registration_date: today,
          company_id: parseInt(data.id),
        }),
      });
      const cdata = await cr.json();
      results.contact_post = { status: cr.status, ok: cr.ok, data: cdata };
    }
  } catch (e) {
    results.company_post = { error: e.message };
  }

  return res.status(200).json(results);
}
