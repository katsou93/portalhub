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

  // Direct IDs from user - each has a known CRM status label
  const companies = [
    { id: 15537, label: 'HOT - PRIO',       name: 'Rommelag' },
    { id: 15473, label: 'Upload',            name: 'Weppler Filter' },
    { id: 18243, label: 'Hot Lead',          name: 'Paul Tech AG' },
    { id: 18248, label: '4 - Pre Account',   name: 'Honsel Umformtechnik' },
    { id: 14533, label: '2 - Key Account',   name: 'Dein-Konfigurator' },
    { id: 14625, label: '3 - Account',       name: 'Remmert GmbH' },
  ];

  const results = await Promise.all(companies.map(async c => {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + c.id, { headers });
    const d = await r.json();
    return { ...c, status_id: d.status_id, stage_status: d.stage_status, company_name: d.company_name };
  }));

  // Build the mapping table
  const mapping = {};
  results.forEach(r => { if (r.status_id) mapping[r.status_id] = r.label; });

  return res.status(200).json({ mapping, details: results });
}
