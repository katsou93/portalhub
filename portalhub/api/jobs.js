// jobs.js - BA Jobsuche API Proxy
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

  function mkHeaders(token) {
          return token
            ? { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
                    : { 'X-API-Key': 'jobboerse-jobsuche', 'User-Agent': 'PortalHub/1.0', 'Accept': 'application/json' };
  }

  async function fetchBA(url, token) {
          return fetch(url, { headers: mkHeaders(token) });
  }

  async function fetchBAWithFallback(url) {
          let r = await fetchBA(url, null).catch(() => null);
          if (r && r.ok) return r;
          const token = await getToken();
          if (!token) return null;
          r = await fetchBA(url, token).catch(() => null);
          return (r && r.ok) ? r : null;
  }

  try {
          // ── DETAIL ──────────────────────────────────────────────────────────
        if (refnr) {
                  const url = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(refnr);
                  let r = await fetchBAWithFallback(url);

            // v3 fallback
            if (!r) {
                        const url3 = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v3/jobdetails/' + encodeURIComponent(refnr);
                        r = await fetchBAWithFallback(url3);
            }

            if (!r) return res.status(200).json({ kontaktAngaben: null, arbeitgeberHomepage: null, stellenbeschreibung: null, externeUrl: null });

            const d = await r.json().catch(() => ({}));
                  const s = d.stellenangebot || d;

            let kontaktAngaben = s.kontaktAngaben || null;

            // Scrape BA HTML page if no contact
            if (!kontaktAngaben) {
                        try {
                                      const ctrl = new AbortController();
                                      const t = setTimeout(() => ctrl.abort(), 5000);
                                      const pr = await fetch('https://www.arbeitsagentur.de/jobsuche/jobdetail/' + encodeURIComponent(refnr), {
                                                      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
                                                      signal: ctrl.signal,
                                      }).catch(() => null);
                                      clearTimeout(t);
                                      if (pr && pr.ok) {
                                                      const html = await pr.text();
                                                      const em = html.match(/href="mailto:([^"]+)"/i);
                                                      const ph = html.match(/(?:Telefon|Tel\.?)[:\s]+([+0-9][\d\s()\-\/]{6,20})/i);
                                                      const nm = html.match(/Ansprechpartner[^:]*:\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+ [A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/);
                                                      if (nm || em) kontaktAngaben = { ansprechpartner: nm?.[1]?.trim() || null, email: em?.[1] || null, telefonnummer: ph?.[1]?.trim() || null };
                                      }
                        } catch (_) {}
            }

            const externeUrl = s.externeUrl || s.externalJobUrl || s.externalUrl || s.externeAnzeige?.url || s.bewerbungUrl || s.urlExtern || null;

            return res.status(200).json({
                        kontaktAngaben,
                        arbeitgeberHomepage: s.arbeitgeberHomepage || null,
                        stellenbeschreibung: s.stellenbeschreibung || null,
                        externeUrl,
                        arbeitgeber: s.arbeitgeber || null,
                        titel: s.titel || null,
                        arbeitsort: s.arbeitsort || null,
            });
        }

        // ── SEARCH ───────────────────────────────────────────────────────────
        const allowed = ['was','wo','umkreis','angebotsart','page','size','zeitarbeit','berufsfeld'];
          const params = new URLSearchParams();
          for (const k of allowed) { if (searchParams[k] !== undefined) params.set(k, searchParams[k]); }

        const searchUrl = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?' + params.toString();
          const sr = await fetchBAWithFallback(searchUrl);
          if (!sr) return res.status(200).json({ stellenangebote: [], maxErgebnisse: 0, error: 'BA API nicht erreichbar' });
          const data = await sr.json();
          return res.status(200).json(data);

  } catch (e) {
          console.error('jobs.js error:', e.message);
          return res.status(500).json({ error: e.message });
  }
}
