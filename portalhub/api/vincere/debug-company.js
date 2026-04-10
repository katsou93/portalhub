export default async function handler(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token = cookies.vincere_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const tenant = process.env.VINCERE_TENANT;
  const apiKey  = process.env.VINCERE_API_KEY;
  const headers = { 'id-token': token, 'x-api-key': apiKey };

  // Search for the specific companies the user mentioned to find the right status field
  const testNames = ['Rommelag', 'Weppler', 'Comnova', 'Honsel', 'Remmert', 'Konfigurator'];
  const results = [];

  for (const kw of testNames) {
    const sr = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?keyword=' + encodeURIComponent(kw) + '&start=0&rows=3',
      { headers }
    );
    const sd = await sr.json();
    const items = sd.result?.items || [];

    for (const item of items.slice(0, 1)) {
      const dr = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
      const dd = await dr.json();
      results.push({
        keyword: kw,
        name: item.name,
        id: item.id,
        search_status: item.status,
        stage: dd.stage,
        stage_status: dd.stage_status,
        status_id: dd.status_id,
        ownership: dd.ownership,
        company_type: dd.company_type,
        all_keys: Object.keys(dd).join(','),
      });
    }
  }

  return res.status(200).json({ results });
}
