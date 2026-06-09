// jobs.js - BA Jobsuche API Proxy
// WICHTIG: BA Detail-API gibt 404 fuer oeffentliche Requests
// Loesung: HTML-Seite der BA scrapen fuer Stellenbeschreibung + Arbeitgeber-Website
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

  // Scrapt die BA-HTML-Seite fuer Stellentext + Arbeitgeber-Website
  async function scrapeBAPage(refnr) {
            try {
                        const ctrl = new AbortController();
                        const t = setTimeout(() => ctrl.abort(), 6000);
                        const r = await fetch('https://www.arbeitsagentur.de/jobsuche/jobdetail/' + encodeURIComponent(refnr), {
                                      headers: {
                                                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
                                                      'Accept': 'text/html',
                                                      'Accept-Language': 'de-DE,de;q=0.9',
                                      },
                                      signal: ctrl.signal,
                        }).catch(() => null);
                        clearTimeout(t);
                        if (!r || !r.ok) return null;

              const html = await r.text();

              // Extrahiere Stellenbeschreibung
              const stelleMatch = html.match(/Stellenbeschreibung[\s\S]{0,50}?<[^>]*>([\s\S]{100,5000}?)<\/[^>]*>\s*<[^>]*>(?:Dein|Ihr|Anforderungen|Profil|Wir bieten)/i)
                          || html.match(/class="[^"]*stellen[^"]*"[^>]*>([\s\S]{50,3000}?)<\/section>/i);

              // Extrahiere externe Links (Arbeitgeber-Website)
              const extLinks = [];
                        const linkRe = /href="(https?:\/\/(?!(?:www\.)?arbeitsagentur)[^"]+)"/g;
                        let lm;
                        while ((lm = linkRe.exec(html)) !== null) {
                                      try {
                                                      const host = new URL(lm[1]).hostname;
                                                      if (!extLinks.includes(host)) extLinks.push('https://' + host);
                                      } catch(_) {}
                                      if (extLinks.length >= 3) break;
                        }

              // Extrahiere Kontakt-Email aus HTML (vor CAPTCHA-Block)
              const emailMatch = html.match(/href="mailto:([^"]+)"/i);

              // Extrahiere Ansprechpartner
              const nameMatch = html.match(/Ansprechpartner[^:]*:\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+ [A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/);
                        const phoneMatch = html.match(/(?:Telefon|Tel\.?)[:\s]+([+0-9][\d\s()\-\/]{6,20})/i);

              // Stellenbeschreibung aus plaintext
              const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
                        const stellenIdx = plainText.indexOf('Stellenbeschreibung');
                        const stellenText = stellenIdx >= 0 ? plainText.slice(stellenIdx + 19, stellenIdx + 3000).trim() : null;

              return {
                            stellenbeschreibung: stellenText,
                            arbeitgeberHomepage: extLinks[0] || null,
                            externeUrl: extLinks[0] || null,
                            kontaktAngaben: (emailMatch || nameMatch) ? {
                                            ansprechpartner: nameMatch?.[1]?.trim() || null,
                                            email: emailMatch?.[1] || null,
                                            telefonnummer: phoneMatch?.[1]?.trim() || null,
                            } : null,
              };
            } catch(_) { return null; }
  }

  try {
            // ── DETAIL ──────────────────────────────────────────────────────────
          if (refnr) {
                      // 1. Versuche REST API (oft 404 fuer oeffentliche Zugriffe)
              const detailUrl = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(refnr);
                      const apiResult = await fetchBAWithFallback(detailUrl);

              let apiData = null;
                      if (apiResult) {
                                    const d = await apiResult.json().catch(() => ({}));
                                    apiData = d.stellenangebot || d;
                      }

              // 2. HTML-Scraping parallel (immer)
              const htmlData = await scrapeBAPage(refnr);

              // Merge: API-Daten haben Prioritaet, HTML als Fallback
              const stelle = apiData || {};
                      const result = {
                                    kontaktAngaben: stelle.kontaktAngaben || htmlData?.kontaktAngaben || null,
                                    arbeitgeberHomepage: stelle.arbeitgeberHomepage || htmlData?.arbeitgeberHomepage || null,
                                    stellenbeschreibung: stelle.stellenbeschreibung || htmlData?.stellenbeschreibung || null,
                                    externeUrl: stelle.externeUrl || stelle.externalJobUrl || stelle.externalUrl
                                      || stelle.externeAnzeige?.url || stelle.bewerbungUrl || stelle.urlExtern
                                      || htmlData?.externeUrl || null,
                                    arbeitgeber: stelle.arbeitgeber || null,
                                    titel: stelle.titel || null,
                                    arbeitsort: stelle.arbeitsort || null,
                      };

              return res.status(200).json(result);
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
