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

  // Search for each specific company by name keyword
  const searches = ['Rommelag', 'Weppler', 'Comnova', 'Honsel', 'Konfigurator'];
  const results = {};

  for (const kw of searches) {
    // Get IDs from first page
    const sr = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=' + encodeURIComponent(kw) + '&start=0&rows=500',
      { headers }
    );
    const sd = await sr.json();
    const items = sd.result?.items || [];
    
    // For each result, get full detail
    const details = await Promise.all(items.slice(0,3).map(async item => {
      const dr = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
      const dd = await dr.json();
      return { id: item.id, name: dd.company_name, status_id: dd.status_id };
    }));
    
    results[kw] = details;
  }

  return res.status(200).json(results);
}
