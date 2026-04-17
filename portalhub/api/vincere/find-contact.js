export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { firstName:null, lastName:null, email:null, position:null, source:null };

  // Validate that a string looks like a real person name
  // Must be 2 words, each 2-20 chars, no numbers, no common nav words
  const NAV_WORDS = new Set(['downloads','extranet','karriere','jobs','kontakt','impressum',
    'datenschutz','ueber','about','home','news','produkte','service','login','suche',
    'mehr','alle','hier','jetzt','oder','und','fuer','mit','von','bei']);

  function isValidName(str) {
    if(!str) return false;
    const parts = str.trim().split(/\s+/);
    if(parts.length < 2 || parts.length > 3) return false;
    for(const p of parts) {
      if(p.length < 2 || p.length > 20) return false;
      if(!/^[A-ZÄÖÜ]/.test(p)) return false; // must start with capital
      if(/[0-9]/.test(p)) return false; // no numbers
      if(NAV_WORDS.has(p.toLowerCase())) return false;
    }
    return true;
  }

  function splitName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function findEmail(text) {
    // Only real business emails, not noreply/info/admin
    const emails = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
    for(const m of emails) {
      const e = m[0].toLowerCase();
      if(!e.includes('noreply') && !e.includes('no-reply') && !e.includes('example')
         && !e.includes('test@') && !e.includes('info@') && !e.includes('admin@')) {
        return m[0];
      }
    }
    // fallback: take info@ if nothing better
    return emails.length ? emails[0][0] : null;
  }

  function findContact(text) {
    const patterns = [
      // "Ansprechpartner: Max Mustermann"
      /(?:Ansprechpartner(?:in)?|Ihr(?:e)?\s+Ansprechpartner(?:in)?|Kontakt(?:person)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+(?:\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+){1,2})/,
      // "HR Manager Max Mustermann" or "Personalreferentin Jana Schmidt"
      /(?:HR[-\s]?Manager(?:in)?|Personal(?:leiter|leiterin|referent|referentin|manager|managerin)|Recruiting(?:erin)?|Talent[^,\n]{0,20})[:\s,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)/,
      // "Max Mustermann, HR Manager"
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s*[,|]\s*(?:HR|Personal(?:leiter|leiterin|referent|referentin)|Recruiting|Talent)/,
      // Geschäftsführer: Max Mustermann
      /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?|Vorstand)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+(?:\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+){1,2})/,
    ];
    for(const p of patterns) {
      const m = text.match(p);
      if(m && m[1] && isValidName(m[1])) return m[1].trim();
    }
    return null;
  }

  function findPosition(text) {
    const pos = [
      [/HR[-\s]?Manager(?:in)?/i,'HR Manager/in'],
      [/Talent\s*Acquisition/i,'Talent Acquisition'],
      [/Personal(?:leiter|leiterin)/i,'Personalleiter/in'],
      [/Personal(?:referent|referentin)/i,'Personalreferent/in'],
      [/Recruiting(?:erin)?/i,'Recruiting'],
      [/Geschäftsführer(?:in)?|CEO/i,'Geschäftsführer/in'],
      [/Inhaber(?:in)?/i,'Inhaber/in'],
    ];
    for(const [r,label] of pos) if(r.test(text)) return label;
    return null;
  }

  // STAGE 1: Job text from Stellenanzeige
  if(jobText) {
    const decoded = decodeURIComponent(jobText);
    const n = findContact(decoded);
    if(n) {
      const s = splitName(n);
      result.firstName = s.firstName; result.lastName = s.lastName;
      result.email = findEmail(decoded);
      result.position = findPosition(decoded)||'Ansprechpartner/in';
      result.source = 'stellenanzeige';
      return res.status(200).json(result);
    }
  }

  // STAGE 2: Scrape specific pages with priority order
  const pages = [];
  if(website) {
    const base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://'+website;
    pages.push(
      {url:base+'/karriere/ansprechpartner', priority:'hr'},
      {url:base+'/jobs/kontakt', priority:'hr'},
      {url:base+'/karriere', priority:'hr'},
      {url:base+'/kontakt', priority:'contact'},
      {url:base+'/team', priority:'team'},
      {url:base+'/impressum', priority:'ceo'},
    );
  }

  for(const page of pages) {
    try {
      const r = await fetch(page.url, {
        headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
        signal:AbortSignal.timeout(4000), redirect:'follow'
      });
      if(!r.ok) continue;
      const html = await r.text();
      // Strip HTML properly
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi,'')
        .replace(/<style[\s\S]*?<\/style>/gi,'')
        .replace(/<[^>]+>/g,' ')
        .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();

      const n = findContact(text);
      const email = findEmail(text);

      if(n && isValidName(n)) {
        const s = splitName(n);
        result.firstName = s.firstName; result.lastName = s.lastName;
        result.email = email;
        result.position = findPosition(text)||(page.priority==='ceo'?'Geschäftsführer/in':'Ansprechpartner/in');
        result.source = page.url.split('/').pop()||'website';
        return res.status(200).json(result);
      }
      // Save email even without name
      if(email && !result.email) result.email = email;
    } catch(e) {}
  }

  return res.status(200).json(result);
}
