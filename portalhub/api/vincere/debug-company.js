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
  const base = 'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?';

  // Try Solr q= queries for single-word company names
  const names = ['Rommelag', 'Comnova', 'Remmert'];
  const results = {};

  for (const name of names) {
    // Try q=name:value (Solr field query)
    const r1 = await fetch(base + 'q=name:' + name + '&start=0&rows=5', { headers });
    const d1 = await r1.json();

    // Try q=company_name:value
    const r2 = await fetch(base + 'q=company_name:' + name + '&start=0&rows=5', { headers });
    const d2 = await r2.json();

    results[name] = {
      'q=name': { status: r1.status, items: (d1.result?.items||[]).map(c=>c.name).slice(0,3), error: d1.errors?.[0] },
      'q=company_name': { status: r2.status, items: (d2.result?.items||[]).map(c=>c.name).slice(0,3), error: d2.errors?.[0] },
    };
  }

  // Also: try loading pages in the R section (Rommelag) and C section (Comnova)
  // by using start offset - find which page contains them
  // Companies sorted alphabetically, R starts around 60-65% through 3796 = ~2300
  const rPageTest = await fetch(base + 'keyword=&start=2300&rows=5', { headers });
  const rData = await rPageTest.json();
  results['page_at_2300'] = (rData.result?.items||[]).map(c=>c.name);

  return res.status(200).json(results);
}
