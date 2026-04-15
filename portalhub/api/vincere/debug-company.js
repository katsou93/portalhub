export default async function handler(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const headers = { 'id-token': token, 'x-api-key': apiKey };

  // Try to get the status list from Vincere meta API
  const results = {};

  // Try different meta endpoints
  const metaUrls = [
    '/api/v2/meta/company/status',
    '/api/v2/meta/company',
    '/api/v2/meta/lookup/company-status',
    '/api/v2/meta/lookup/status',
  ];

  for (const path of metaUrls) {
    const r = await fetch('https://' + tenant + '.vincere.io' + path, { headers });
    const text = await r.text();
    results[path] = { status: r.status, body: text.substring(0, 300) };
  }

  // Also sample companies with different status_ids to map them
  const testIds = [14625, 14870]; // status_id 6 and 1
  const samples = [];
  for (const id of testIds) {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + id, { headers });
    const d = await r.json();
    samples.push({ id, name: d.company_name, status_id: d.status_id, stage_status: d.stage_status });
  }

  return res.status(200).json({ metaResults: results, samples });
}
