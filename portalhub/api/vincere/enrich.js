export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { website:null, street:null, postcode:null, city:city||null };

  try {
    // Google search for the company's Impressum
    const query = encodeURIComponent('"' + name + '" ' + (city||'') + ' Impressum');
    const googleUrl = 'https://www.google.com/search?q=' + query + '&hl=de&gl=de&num=5';

    const googleRes = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
      signal: AbortSignal.timeout(7000),
      redirect: 'follow',
    });

    if(!googleRes.ok) return res.status(200).json({...result, error:'Google returned '+googleRes.status});

    const html = await googleRes.text();

    // Extract first organic result URL from Google
    // Google wraps links in: <a href="/url?q=https://...&amp;
    const urlMatches = [...html.matchAll(/href="/url?q=(https?://(?!(?:google|youtube|facebook|wikipedia|xing|linkedin|kununu)[^"]*)[^"&]+)/g)];

    if(!urlMatches.length) return res.status(200).json({...result, error:'No results from Google'});

    // Get first non-Google URL
    const siteUrl = decodeURIComponent(urlMatches[0][1]);
    try { result.website = new URL(siteUrl).origin; } catch(e) { result.website = siteUrl; }

    // Now fetch the Impressum page (try the exact URL first, then common paths)
    const urlsToTry = [siteUrl];
    if(!siteUrl.toLowerCase().includes('impressum')) {
      urlsToTry.push(result.website + '/impressum');
      urlsToTry.push(result.website + '/impressum.html');
      urlsToTry.push(result.website + '/de/impressum');
    }

    let impHtml = '';
    for(const url of urlsToTry) {
      try {
        const r = await fetch(url, {
          headers: {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'},
          signal: AbortSignal.timeout(4000),
          redirect: 'follow',
        });
        if(r.ok) {
          impHtml = await r.text();
          if(impHtml.length > 200) break;
        }
      } catch(e) {}
    }

    if(!impHtml) return res.status(200).json(result);

    // Strip HTML tags and normalize whitespace
    const text = impHtml
      .replace(/<script[^>]*>[sS]*?</script>/gi,'')
      .replace(/<style[^>]*>[sS]*?</style>/gi,'')
      .replace(/<[^>]+>/g,' ')
      .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#[0-9]+;/g,' ')
      .replace(/[ 	]+/g,' ')
      .replace(/
s*
/g,'
')
      .trim();

    // Find German address pattern: Street Nr
PLZ City
    const fullAddr = text.match(/([A-ZÄÖÜ][a-zA-ZäöüÄÖÜßs-.]+(?:str(?:aße|.)?|gasse|weg|allee|ring|platz|damm|ufer|chaussee|straße)s*d{1,4}[a-zA-Z]?)s*[
,]s*(d{5})s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜßs-]{2,30})/);
    if(fullAddr) {
      result.street   = fullAddr[1].trim();
      result.postcode = fullAddr[2].trim();
      result.city     = fullAddr[3].trim().replace(/s+/g,' ').split(/[
,]/)[0].trim();
    } else {
      // Just PLZ + City
      const plzOnly = text.match(/(d{5})s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß-]{2,25})(?=[s
,])/);
      if(plzOnly) {
        result.postcode = plzOnly[1].trim();
        result.city     = plzOnly[2].trim().split(/[
,]/)[0].trim();
      }
    }

    return res.status(200).json(result);
  } catch(e) {
    return res.status(200).json({...result, error: e.message});
  }
}
