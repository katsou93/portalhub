// Temporäre Debug-Route um BA API Status zu prüfen
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
    const { refnr } = req.query;
      if (!refnr) return res.status(400).json({ error: 'refnr required' });

        const urls = [
            'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(refnr),
                'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v3/jobdetails/' + encodeURIComponent(refnr),
                  ];

                    const results = [];
                      for (const url of urls) {
                          try {
                                const r = await fetch(url, { headers: { 'X-API-Key': 'jobboerse-jobsuche', 'Accept': 'application/json' } });
                                      const text = await r.text();
                                            let body = {};
                                                  try { body = JSON.parse(text); } catch(_) { body = { raw: text.slice(0, 200) }; }
                                                        results.push({ url: url.split('jobdetails/')[1], status: r.status, ok: r.ok, keys: Object.keys(body), hasStellenbesch: !!body.stellenbeschreibung, hasAnzeige: !!body.stellenangebot });
                                                            } catch(e) {
                                                                  results.push({ url: url.split('jobdetails/')[1], error: e.message });
                                                                      }
                                                                        }
                                                                          return res.status(200).json({ refnr, results });
                                                                          }
