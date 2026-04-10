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

  // Get first company ID from search with ID field included
  const searchUrl = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status,company_type,ownership;sort=name asc?keyword=&start=0&rows=5';
  const sr = await fetch(searchUrl, { headers });
  const sd = await sr.json();
  const items = sd.result?.items || [];
  
  // Get detail of first company
  if (items.length > 0) {
    const id = items[0].id;
    const dr = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + id, { headers });
    const dd = await dr.json();
    return res.status(200).json({ searchItem: items[0], detail: dd, allSearchKeys: Object.keys(items[0]) });
  }
  
  return res.status(200).json({ items });
}
