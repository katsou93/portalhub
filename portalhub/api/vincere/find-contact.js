export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { firstName:null, lastName:null, email:null, position:null, source:null };

  // Helper: split full name into first/last
  function splitName(fullName) {
    if(!fullName) return null;
    const parts = fullName.trim().split(/\s+/);
    if(parts.length === 1) return { firstName: parts[0], lastName: '.' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  // Helper: extract email from text
  function findEmail(text) {
    const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    return m ? m[0] : null;
  }

  // Helper: find HR/contact person in text
  function findContact(text) {
    // German contact patterns
    const patterns = [
      /(?:Ansprechpartner(?:in)?|Kontakt(?:person)?|Ihr(?:e)?\s+Ansprechpartner(?:in)?|bewerben\s+Sie\s+sich\s+bei|wenden\s+Sie\s+sich\s+an)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+(?:\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+){1,3})/,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s*(?:,\s*)?(?:HR|Human\s*Resources|Personal(?:leiter|leiterin|referent|referentin|manager|managerin)|Recruiting|Talent)/i,
      /(?:HR|Human\s*Resources|Personal(?:leiter|leiterin|referent|referentin|manager|managerin)|Recruiting|Talent\s*Acquisition)[:\s,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)/i,
      /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+(?:\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+){1,2})/,
    ];
    for(const p of patterns) {
      const m = text.match(p);
      if(m && m[1] && m[1].length > 3) return m[1].trim();
    }
    return null;
  }

  // Helper: determine position title
  function findPosition(text) {
    const pos = [
      [/HR\s*Manager(?:in)?/i,'HR Manager'],
      [/Personal(?:leiter|leiterin)/i,'Personalleiter/in'],
      [/Personal(?:referent|referentin)/i,'Personalreferent/in'],
      [/Recruiting|Talent\s*Acquisition/i,'Recruiting'],
      [/Geschäftsführer(?:in)?|CEO/i,'Geschäftsführer/in'],
      [/Inhaber(?:in)?/i,'Inhaber/in'],
    ];
    for(const [r,label] of pos) if(r.test(text)) return label;
    return null;
  }

  // STAGE 1: Check job text (from BA Stellenanzeige - passed as query param)
  if(jobText) {
    const decoded = decodeURIComponent(jobText);
    const contactName = findContact(decoded);
    const email = findEmail(decoded);
    if(contactName) {
      const n = splitName(contactName);
      result.firstName = n.firstName;
      result.lastName = n.lastName;
      result.email = email;
      result.position = findPosition(decoded) || 'Ansprechpartner/in';
      result.source = 'stellenanzeige';
      return res.status(200).json(result);
    }
  }

  // STAGE 2: Scrape website (Karriere, Kontakt, Impressum pages)
  const scrapeUrls = [];
  if(website) {
    const base = website.startsWith('http') ? website : 'https://'+website;
    scrapeUrls.push(
      base+'/karriere', base+'/jobs', base+'/kontakt', base+'/contact',
      base+'/ueber-uns', base+'/team', base+'/impressum', base
    );
  }

  for(const url of scrapeUrls) {
    try {
      const r = await fetch(url, {
        headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
        signal:AbortSignal.timeout(4000), redirect:'follow'
      });
      if(!r.ok) continue;
      const html = await r.text();
      const text = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

      const contactName = findContact(text);
      const email = findEmail(text);
      if(contactName) {
        const n = splitName(contactName);
        result.firstName = n.firstName;
        result.lastName = n.lastName;
        result.email = email;
        result.position = findPosition(text) || 'Ansprechpartner/in';
        result.source = url.split('/').pop() || 'website';
        return res.status(200).json(result);
      }
      // Found email without name - save it and continue looking for name
      if(email && !result.email) result.email = email;
    } catch(e) {}
  }

  // STAGE 3: Google for HR contact (no API key needed - just HTML scraping)
  try {
    const q = encodeURIComponent('"'+name+'" '+(city||'')+' HR Manager OR Personalleiter Kontakt');
    const r = await fetch('https://html.duckduckgo.com/html/?q='+q, {
      method:'POST',
      headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Content-Type':'application/x-www-form-urlencoded'},
      body:'q='+q,
      signal:AbortSignal.timeout(4000)
    });
    if(r.ok) {
      const html = await r.text();
      const snippet = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      const contactName = findContact(snippet);
      if(contactName && !result.firstName) {
        const n = splitName(contactName);
        result.firstName = n.firstName;
        result.lastName = n.lastName;
        result.position = findPosition(snippet) || 'HR Manager';
        result.source = 'google';
      }
    }
  } catch(e) {}

  return res.status(200).json(result);
}
