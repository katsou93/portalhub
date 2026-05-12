const CLIENT_ID = process.env.BA_CLIENT_ID || 'jobboerse-app';

async function getToken() {
  const r = await fetch('https://rest.arbeitsagentur.de/oauth/gettoken_cc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Client-Id': CLIENT_ID },
    body: 'client_id=c003a37f-024f-462a-b36d-b001be4cd24a&client_secret=32a39620-32b3-4307-9aa1-511e3d7f48a8&grant_type=client_credentials'
  });
  const d = await r.json();
  return d.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { refnr, ...searchParams } = req.query;

  try {
    const token = await getToken();
    const headers = { 'Authorization': 'Bearer ' + token, 'X-Client-Id': CLIENT_ID };

    // Detail endpoint - returns full job including kontaktAngaben + homepage
    if (refnr) {
      const r = await fetch('https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(refnr), { headers });
      if (!r.ok) return res.status(r.status).json({ error: 'detail failed' });
      const d = await r.json();
      return res.status(200).json({
        kontaktAngaben: d.stellenangebot?.kontaktAngaben || null,
        arbeitgeberHomepage: d.stellenangebot?.arbeitgeberHomepage || null,
        stellenbeschreibung: d.stellenangebot?.stellenbeschreibung || null,
      });
    }

    // Search endpoint
    const params = new URLSearchParams(searchParams).toString();
    const r = await fetch('https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?' + params, { headers });
    if (!r.ok) return res.status(r.status).json({ error: 'search failed', status: r.status });
    const d = await r.json();
    return res.status(200).json(d);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
