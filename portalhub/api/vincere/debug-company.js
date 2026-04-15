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

  // Fetch ALL fields for Remmert (id=14625) and Rommelag - find exact field with status label
  const ids = [14625, 14870]; // Remmert = Account, try to find another
  const results = [];

  for (const id of ids) {
    const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + id, { headers });
    const d = await r.json();
    results.push({ id, allFields: d });
  }

  return res.status(200).json(results);
}
