export default async function handler(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId = process.env.VINCERE_APP_ID;
  const headers = { 'Content-Type': 'application/json', 'id-token': token, 'x-api-key': apiKey };
  if (appId) headers['app-id'] = appId;

  // Test: try creating a test company with different payload formats
  const payloads = [
    { company_name: 'TEST Debug Company 123' },
    { name: 'TEST Debug Company 456' },
  ];

  const results = [];
  for (const payload of payloads) {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company', {
      method: 'POST', headers, body: JSON.stringify(payload)
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = text; }
    results.push({ payload, status: r.status, response: data });
    
    // If created, delete it immediately to keep things clean
    if (r.ok && data.id) {
      await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + data.id, { method: 'DELETE', headers });
    }
  }

  return res.status(200).json({ results });
}
