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

  // Get 20 companies from search with IDs
  const searchUrl = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?keyword=&start=0&rows=20';
  const sr = await fetch(searchUrl, { headers });
  const sd = await sr.json();
  const items = sd.result?.items || [];
  
  // Fetch detail for first 5 to see stage/stage_status values
  const details = [];
  for (const item of items.slice(0, 8)) {
    const dr = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
    const dd = await dr.json();
    details.push({
      name: item.name,
      search_status: item.status,
      stage: dd.stage,
      stage_status: dd.stage_status,
      status_id: dd.status_id,
    });
  }
  
  const allStageStatuses = [...new Set(details.map(d => d.stage_status).filter(Boolean))];
  const allStages = [...new Set(details.map(d => d.stage).filter(Boolean))];
  
  return res.status(200).json({ details, allStageStatuses, allStages });
}
