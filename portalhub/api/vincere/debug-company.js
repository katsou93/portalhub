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

  // Sample companies from different parts of alphabet to find all stage_status values
  const starts = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];
  const allStatuses = {};
  
  for (const start of starts) {
    const sr = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?keyword=&start=' + start + '&rows=50',
      { headers }
    );
    const sd = await sr.json();
    const items = sd.result?.items || [];
    
    // Fetch detail for first 3 items of each page
    for (const item of items.slice(0, 3)) {
      const dr = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
      const dd = await dr.json();
      const key = (dd.stage || 'null') + '/' + (dd.stage_status || 'null');
      allStatuses[key] = (allStatuses[key] || 0) + 1;
    }
  }
  
  // Also check meta endpoint for stage statuses
  const metaR = await fetch('https://' + tenant + '.vincere.io/api/v2/meta/company/stage-status', { headers });
  const metaText = await metaR.text();
  
  return res.status(200).json({ allStatuses, meta: metaText.substring(0, 500) });
}
