// jobs.js - BA Jobsuche API Proxy mit robustem Detail-Endpoint
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { refnr, ...searchParams } = req.query;

  async function getToken() {
        try {
                const r = await fetch('https://rest.arbeitsagentur.de/oauth/gettoken_cc', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                          body: 'client_id=c003a37f-024f-462a-b36d-b001be4cd24a&client_secret=32a39620-32b3-4307-9aa1-511e3d7f48a8&grant_type=client_credentials',
                });
                if (!r.ok) return null;
                const d = await r.json();
                return d.access_token || null;
        } catch { return null; }
  }

  async function fetchBA(url, token) {
        const headers = token
          ? { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
                : { 'X-API-Key': 'jobboerse-jobsuche', 'User-Agent': 'PortalHub/1.0', 'Accept': 'application/json' };
            return fetch(url, { headers, signal: (()=>{const c=new AbortController();setTimeout(()=>c.abort(),8000);return c.signal;})() });
  }

  try {
        // ── DETAIL ENDPOINT ──────────────────────────────────────────────────
      if (refnr) {
              const detailUrl = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(refnr);

          // Try without token first, then with token
          let r = await fetchBA(detailUrl, null).catch(() => null);
              if (!r || !r.ok) {
                        const token = await getToken();
                        if (token) r = await fetchBA(detailUrl, token).catch(() => null);
              }

          let stelle = null;
              if (r && r.ok) {
                        const d = await r.json().catch(() => ({}));
                        stelle = d.stellenangebot || d;
              } else {
                        // Try v3 endpoint as fallback
                const v3Url = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v3/jobdetails/' + encodeURIComponent(refnr);
                        const r3 = await fetchBA(v3Url, null).catch(() => null);
                        if (r3 && r3.ok) {
                                    const d3 = await r3.json().catch(() => ({}));
                                    stelle = d3.stellenangebot || d3;
                        }
              }

          if (!stelle) {
                    console.log('BA detail failed for refnr:', refnr);
                    return res.status(200).json({ kontaktAngaben: null, arbeitgeberHomepage: null, stellenbeschreibung: null, externeUrl: null });
          }

          // Extract contact info
          let kontaktAngaben = stelle.kontaktAngaben || null;

          // If no contact from API, try scraping the BA HTML page
          if (!kontaktAngaben) {
                    try {
                                const pageUrl = 'https://www.arbeitsagentur.de/jobsuche/jobdetail/' + encodeURIComponent(refnr);
                                const pageR = await fetch(pageUrl, {
                                              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' },
                                              signal: (()=>{const c=new AbortController();setTimeout(()=>c.abort(),5000);return c.signal;})(),
                                }).catch(() => null);
                                if (pageR && pageR.ok) {
                                              const html = await pageR.text();
                                              const emailMatch = html.match(/href="mailto:([^"]+)"/i);
                                              const phoneMatch = html.match(/(?:Telefon|Tel\.?)[:\s]+([+0-9][\d\s()\-\/]{6,20})/i);
                                              const nameMatch = html.match(/Ansprechpartner[^:]*:\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+ [A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/);
                                              if (nameMatch || emailMatch) {
                                                              kontaktAngaben = {
                                                                                ansprechpartner: nameMatch?.[1]?.trim() || null,
                                                                                email: emailMatch?.[1] || null,
                                                                                telefonnummer: phoneMatch?.[1]?.trim() || null,
                                                              };
                                              }
                                }
                    } catch(e) { console.log('HTML scraping failed:', e.message); }
          }

          // Find externeUrl - check all possible field names
          const externeUrl = stelle.externeUrl || stelle.externalJobUrl || stelle.externalUrl
                || stelle.externeAnzeige?.url || stelle.bewerbungUrl || stelle.bewerbungsUrl
                || stelle.urlExtern || null;

          return res.status(200).json({
                    kontaktAngaben,
                    arbeitgeberHomepage: stelle.arbeitgeberHomepage || null,
                    stellenbeschreibung: stelle.stellenbeschreibung || null,
                    externeUrl,
                    arbeitgeber: stelle.arbeitgeber || null,
                    titel: stelle.titel || null,
                    arbeitsort: stelle.arbeitsort || null,
          });
      }

      // ── SEARCH ENDPOINT ──────────────────────────────────────────────────
      const allowed = ['was','wo','umkreis','angebotsart','page','size','zeitarbeit','berufsfeld'];
        const params = new URLSearchParams();
        for (const k of allowed) {
                if (searchParams[k] !== undefined) params.set(k, searchParams[k]);
        }
        const url = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?' + params.toString();

      let response = await fetchBA(url, null).catch(() => null);
        if (!response || !response.ok) {
                const token = await getToken();
                if (token) response = await fetchBA(url, token).catch(() => null);
        }
        if (!response || !response.ok) {
                return res.status(200).json({ stellenangebote: [], maxErgebnisse: 0, error: 'BA API nicht erreichbar' });
        }
        const data = await response.json();
        return res.status(200).json(data);

  } catch (e) {
