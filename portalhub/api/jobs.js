// Vercel Serverless Function – Proxy für Bundesagentur für Arbeit Jobsuche API
// Läuft server-seitig → kein CORS-Problem

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { refnr, ...searchParams } = req.query;

  // Helper: get OAuth token (fallback)
  async function getToken() {
    const r = await fetch('https://rest.arbeitsagentur.de/oauth/gettoken_cc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=c003a37f-024f-462a-b36d-b001be4cd24a&client_secret=32a39620-32b3-4307-9aa1-511e3d7f48a8&grant_type=client_credentials',
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.access_token || null;
  }

  async function fetchBA(url, token) {
    const headers = token
      ? { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
      : { 'X-API-Key': 'jobboerse-jobsuche', 'User-Agent': 'PortalHub/1.0', 'Accept': 'application/json' };
    return fetch(url, { headers });
  }

  try {
    // DETAIL endpoint - returns full job with kontaktAngaben + homepage
    if (refnr) {
      const detailUrl = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(refnr);
      let r = await fetchBA(detailUrl, null);
      if (!r.ok) {
        const token = await getToken();
        if (token) r = await fetchBA(detailUrl, token);
      }
      if (!r.ok) return res.status(200).json({ kontaktAngaben: null, arbeitgeberHomepage: null });
      const d = await r.json();
      const stelle = d.stellenangebot || d;
      return res.status(200).json({
        kontaktAngaben: stelle.kontaktAngaben || null,
        arbeitgeberHomepage: stelle.arbeitgeberHomepage || null,
        stellenbeschreibung: stelle.stellenbeschreibung || null,
      });
    }

    // SEARCH endpoint
    const allowed = ['was','wo','umkreis','angebotsart','page','size','zeitarbeit','berufsfeld'];
    const params = new URLSearchParams();
    for (const k of allowed) {
      if (searchParams[k] !== undefined) params.set(k, searchParams[k]);
    }
    const url = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?' + params.toString();

    let response = await fetchBA(url, null);
    if (!response.ok) {
      const token = await getToken();
      if (token) response = await fetchBA(url, token);
    }
    if (!response.ok) return res.status(response.status).json({ error: 'BA API error', status: response.status });
    const data = await response.json();
    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
