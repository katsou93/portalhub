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

  const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

  // Test creating with location - try different address formats
  const payload = {
    company_name: 'TEST Location Company',
    registration_date: today,
    head_quarter: {
      location_name: '93342 Saal an der Donau',
      city: 'Kirchroth',
      postcode: '93342',
      country: 'DE',
      address: 'Kirchroth',
    }
  };

  const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company', {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  const data = await r.json();

  // If created, get the full detail to see what location fields look like
  let detail = null;
  if (r.ok && data.id) {
    const dr = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + data.id, { headers });
    detail = await dr.json();
    // Clean up
    await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + data.id, { method: 'DELETE', headers });
  }

  return res.status(200).json({ status: r.status, created: data, detail });
}
