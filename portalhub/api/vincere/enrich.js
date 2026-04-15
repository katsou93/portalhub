export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { website:null, street:null, postcode:null, city:city||null };

  try {
    // Use DuckDuckGo Instant Answer API - lightweight, no blocking
    const query = encodeURIComponent(name + (city?' '+city:''));
    const ddgUrl = 'https://api.duckduckgo.com/?q='+query+'&format=json&no_redirect=1&no_html=1&skip_disambig=1';

    const ddgRes = await fetch(ddgUrl, {
      headers:{'User-Agent':'Mozilla/5.0 (compatible; PortalHub/1.0)'},
      signal:AbortSignal.timeout(4000)
    });
    const ddgData = await ddgRes.json();

    // Get website from DuckDuckGo result
    let siteUrl = ddgData.AbstractURL || ddgData.OfficialWebsite || null;

    // If no result from DDG instant answer, try to guess URL from company name
    if(!siteUrl) {
      // Normalize company name to domain guess
      const domainGuess = name
        .toLowerCase()
        .replace(/gmbh.*|ag$|se$|kg$|e\.v\.$|ohg$|ug$/gi,'')
        .replace(/[^a-z0-9äöüß]+/g,'-')
        .replace(/^-+|-+$/g,'')
        .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
        .substring(0,30).replace(/-+$/,'');
      siteUrl = 'https://www.' + domainGuess + '.de';
    }

    // Get clean domain
    try {
      const u = new URL(siteUrl);
      result.website = u.origin;
    } catch(e) { result.website = siteUrl; }

    // Fetch Impressum page directly (try common paths)
    const impressumPaths = ['/impressum', '/impressum.html', '/imprint', '/kontakt', '/ueber-uns/impressum'];
    let impHtml = '';

    for(const path of impressumPaths) {
      try {
        const r = await fetch(result.website + path, {
          headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
          signal:AbortSignal.timeout(3000),
          redirect:'follow'
        });
        if(r.ok) {
          impHtml = await r.text();
          if(impHtml.length > 500) break; // Got real content
        }
      } catch(e) {}
    }

    // If no impressum found via path, try homepage
    if(!impHtml) {
      try {
        const r = await fetch(result.website, {
          headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
          signal:AbortSignal.timeout(3000), redirect:'follow'
        });
        if(r.ok) impHtml = await r.text();
      } catch(e) {}
    }

    if(impHtml) {
      // Extract German address: Streetname Nr, PLZ City
      // Most German Impressum pages have address in plain text
      const stripped = impHtml.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');

      // Pattern: Street + number + PLZ (5 digits) + City
      const fullAddr = stripped.match(/([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-\.]+(?:str(?:aße|\.?)|gasse|weg|allee|ring|platz|damm|ufer|chaussee|straße)\s{0,3}\d{1,4}[a-zA-Z]?)[,\s]+?(\d{4,5})[\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-]{2,25})/);
      if(fullAddr) {
        result.street  = fullAddr[1].trim();
        result.postcode = fullAddr[2].trim();
        result.city    = fullAddr[3].trim().split(/[,\n<]/)[0].trim();
      } else {
        // Just PLZ + City
        const plzCity = stripped.match(/(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-]{2,25})(?=[\s,<])/);
        if(plzCity) {
          result.postcode = plzCity[1].trim();
          result.city    = plzCity[2].trim().split(/[,\n<]/)[0].trim();
        }
      }
    }

    return res.status(200).json(result);
  } catch(e) {
    return res.status(200).json({...result, error:e.message});
  }
}
