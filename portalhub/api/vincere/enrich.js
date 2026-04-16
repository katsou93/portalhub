export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city, url } = req.query;

  // MODE 2: url provided → scrape that page for address
  if(url) {
    try {
      const r = await fetch(url, {
        headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'},
        signal:AbortSignal.timeout(6000), redirect:'follow',
      });
      if(!r.ok) return res.status(200).json({street:null,postcode:null,city:city||null});
      const html = await r.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi,'')
        .replace(/<style[\s\S]*?<\/style>/gi,'')
        .replace(/<[^>]+>/g,' ')
        .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
        .replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();

      const result = {street:null, postcode:null, city:city||null};
      const full = text.match(/([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-\.]+(?:str(?:aße|\.)?|gasse|weg|allee|ring|platz|damm|ufer|chaussee|straße)\s*\d{1,4}[a-zA-Z]?)\s*[\n,]\s*(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-]{2,25})/);
      if(full){ result.street=full[1].trim(); result.postcode=full[2].trim(); result.city=full[3].trim().split(/[\n,]/)[0].trim(); }
      else {
        const plz = text.match(/(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{2,25})(?=[\s\n,])/);
        if(plz){ result.postcode=plz[1].trim(); result.city=plz[2].trim().split(/[\n,]/)[0].trim(); }
      }
      return res.status(200).json(result);
    } catch(e) { return res.status(200).json({street:null,postcode:null,city:city||null,error:e.message}); }
  }

  // MODE 1: name+city → DuckDuckGo HTML search (works from servers, unlike Google)
  if(!name) return res.status(400).json({error:'name or url required'});
  try {
    const query = encodeURIComponent(name + ' ' + (city||'') + ' Impressum');
    // DuckDuckGo HTML endpoint works from servers
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + query, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html',
      },
      body: 'q=' + query,
      signal: AbortSignal.timeout(6000),
    });

    if(!r.ok) return res.status(200).json({url:null, error:'DDG '+r.status});
    const html = await r.text();

    // Extract result URLs from DDG HTML
    // DDG HTML results have links like: <a class="result__url" href="https://...">
    const urlMatches = [...html.matchAll(/class="result__url"[^>]*href="([^"]+)"/g)];
    // Also try: <a rel="noopener" href="https://...
    const altMatches = [...html.matchAll(/rel="noopener"[^>]*href="(https?://(?!duckduckgo)[^"]+)"/g)];
    // Or: uddg= parameter
    const uddgMatches = [...html.matchAll(/uddg=(https?[^&"]+)/g)];

    let foundUrl = null;
    if(urlMatches.length) foundUrl = urlMatches[0][1];
    else if(altMatches.length) foundUrl = altMatches[0][1];
    else if(uddgMatches.length) foundUrl = decodeURIComponent(uddgMatches[0][1]);

    // Filter out social/job sites
    const blocked = ['xing','linkedin','facebook','wikipedia','instagram','twitter','kununu','indeed','stepstone'];
    if(foundUrl && blocked.some(b => foundUrl.includes(b))) foundUrl = null;

    if(!foundUrl) {
      // Try second result
      if(uddgMatches.length > 1) foundUrl = decodeURIComponent(uddgMatches[1][1]);
    }

    if(!foundUrl) return res.status(200).json({url:null, error:'no results', htmlLen:html.length});

    let website;
    try { website = new URL(foundUrl).origin; } catch(e) { website = foundUrl; }
    return res.status(200).json({url:foundUrl, website});
  } catch(e) { return res.status(200).json({url:null, error:e.message}); }
}
