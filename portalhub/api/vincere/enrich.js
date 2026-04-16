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
        .replace(/<script[sS]*?</script>/gi,'')
        .replace(/<style[sS]*?</style>/gi,'')
        .replace(/<[^>]+>/g,' ')
        .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
        .replace(/[ 	]+/g,' ').replace(/\n\s*\n/g,'\n').trim();

      const result = {street:null, postcode:null, city:city||null};

      // Full address: Streetname Nr, PLZ City
      const full = text.match(/([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-\.]+(?:str(?:aße|\.)?|gasse|weg|allee|ring|platz|damm|ufer|chaussee|straße)\s*\d{1,4}[a-zA-Z]?)\s*[\n,]\s*(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\s\-]{2,25})/);
      if(full){ result.street=full[1].trim(); result.postcode=full[2].trim(); result.city=full[3].trim().split(/[\n,]/)[0].trim(); }
      else {
        const plz = text.match(/(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{2,25})(?=[\s\n,])/);
        if(plz){ result.postcode=plz[1].trim(); result.city=plz[2].trim().split(/[\n,]/)[0].trim(); }
      }
      return res.status(200).json(result);
    } catch(e) { return res.status(200).json({street:null,postcode:null,city:city||null,error:e.message}); }
  }

  // MODE 1: name+city → Google search → return URL
  if(!name) return res.status(400).json({error:'name or url required'});
  try {
    const query = encodeURIComponent('"'+name+'" '+(city||'')+' Impressum');
    const r = await fetch('https://www.google.com/search?q='+query+'&hl=de&gl=de&num=3', {
      headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36','Accept-Language':'de-DE,de;q=0.9'},
      signal:AbortSignal.timeout(5000),
    });
    if(!r.ok) return res.status(200).json({url:null,error:'Google '+r.status});
    const html = await r.text();
    const matches = [...html.matchAll(/href="\/url\?q=(https?:\/\/(?!(?:www\.google|youtube|facebook|wikipedia|xing|linkedin|kununu|instagram|twitter)[^"]*)[^"&]+)/g)];
    if(!matches.length) return res.status(200).json({url:null,error:'no results'});
    const foundUrl = decodeURIComponent(matches[0][1]);
    const website = new URL(foundUrl).origin;
    return res.status(200).json({url:foundUrl, website});
  } catch(e) { return res.status(200).json({url:null,error:e.message}); }
}
