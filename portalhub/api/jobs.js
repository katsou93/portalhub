// Vercel Serverless Function – Proxy für Bundesagentur für Arbeit Jobsuche API
// Läuft server-seitig → kein CORS-Problem

export default async function handler(req, res) {
  // CORS erlauben
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Query-Parameter direkt weiterleiten
    const params = new URLSearchParams();
    const allowed = ['was', 'wo', 'umkreis', 'angebotsart', 'page', 'size', 'zeitarbeit', 'befristung', 'pav'];
    for (const key of allowed) {
      if (req.query[key] !== undefined) params.set(key, req.query[key]);
    }

    const url = `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?${params}`;

    const response = await fetch(url, {
      headers: {
        'X-API-Key': 'jobboerse-jobsuche',
        'User-Agent': 'PortalHub/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Fallback: OAuth Token versuchen
      const tokenRes = await fetch('https://rest.arbeitsagentur.de/oauth/gettoken_cc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=c003a37f-024f-462a-b36d-b001be4cd24a&client_secret=32a39620-32b3-4307-9aa1-511e3d7f48a8&grant_type=client_credentials',
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const retryRes = await fetch(url, {
          headers: {
            'OAuthAccessToken': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/json',
          },
        });
        if (retryRes.ok) {
          const data = await retryRes.json();
          return res.status(200).json(data);
        }
      }
      return res.status(response.status).json({ error: `BA API error: ${response.status}` });
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy-Fehler', details: error.message });
  }
}
