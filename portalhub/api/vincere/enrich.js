export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { website:null, street:null, postcode:null, city:city||null };

  // Generate domain candidates from company name
  const clean = name
    .replace(/gmbh\s*&\s*co\.?\s*kg/gi,'').replace(/gmbh\s*&\s*co/gi,'')
    .replace(/\b(gmbh|ag|kg|se|ug|ohg|gbr|e\.v\.|ev|ltd|inc|group|holding|solutions|services|technology|technologies|systems|consulting|software|media|digital|global|international)\b/gi,'')
    .replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g,' ').replace(/\s+/g,' ').trim();

  const toSlug = s => s.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  const words = clean.split(' ').filter(w=>w.length>2);
  const candidates = [];

  // Full name as domain
  candidates.push('https://www.'+toSlug(clean)+'.de');
  // First two words
  if(words.length>=2) candidates.push('https://www.'+toSlug(words.slice(0,2).join(' '))+'.de');
  // First word only
  if(words[0]) candidates.push('https://www.'+toSlug(words[0])+'.de');
  // With city
  if(city && words[0]) candidates.push('https://www.'+toSlug(words[0]+' '+city)+'.de');

  // Also try .com variants
  candidates.push('https://www.'+toSlug(clean)+'.com');

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

  // Find working domain
  let workingBase = null;
  for(const url of candidates) {
    try {
      const r = await fetch(url, {headers:{' User-Agent':ua}, signal:AbortSignal.timeout(2500), redirect:'follow'});
      if(r.ok || r.status===301||r.status===302) {
        workingBase = new URL(r.url).origin;
        result.website = workingBase;
        break;
      }
    } catch(e) {}
  }

  if(!workingBase) return res.status(200).json(result);

  // Try common Impressum paths
  const paths = ['/impressum','/impressum/','/imprint','/impressum.html','/de/impressum','/ueber-uns/impressum','/kontakt','/datenschutz'];
  let impHtml = '';
  for(const path of paths) {
    try {
      const r = await fetch(workingBase+path, {headers:{'User-Agent':ua}, signal:AbortSignal.timeout(3000), redirect:'follow'});
      if(r.ok) { impHtml = await r.text(); if(impHtml.length>1000) break; }
    } catch(e) {}
  }

  if(!impHtml) {
    // Fallback: try homepage and look for impressum link
    try {
      const r = await fetch(workingBase, {headers:{'User-Agent':ua}, signal:AbortSignal.timeout(3000), redirect:'follow'});
      if(r.ok) {
        const html = await r.text();
        const m = html.match(/href="([^"]*impressum[^"]*)"/i);
        if(m) {
          let link = m[1];
          if(link.startsWith('/')) link = workingBase+link;
          const ir = await fetch(link, {headers:{'User-Agent':ua}, signal:AbortSignal.timeout(3000)});
          if(ir.ok) impHtml = await ir.text();
        }
      }
    } catch(e) {}
  }

  if(impHtml) {
    const text = impHtml.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');

    // Extract German address: Street+Nr, PLZ City
    const addrRe = /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-\.]+(?:str(?:aße|\.?)|gasse|weg|allee|ring|platz|damm|ufer|chaussee|straße)\s{0,3}\d{1,4}\s*[a-zA-Z]?)\s*[,\n\r]+\s*(\d{4,5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-\s]{2,30})/;
    const m1 = text.match(addrRe);
    if(m1) {
      result.street   = m1[1].trim();
      result.postcode = m1[2].trim();
      result.city     = m1[3].trim().split(/[,\n<]/)[0].trim();
    } else {
      // Just PLZ + City
      const m2 = text.match(/(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-\s]{2,25})(?=[\s,<\n])/);
      if(m2) {
        result.postcode = m2[1].trim();
        result.city     = m2[2].trim().split(/[,\n<]/)[0].trim();
      }
    }
  }

  return res.status(200).json(result);
}
