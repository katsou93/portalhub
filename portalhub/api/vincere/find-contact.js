export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city, website } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null, jobs:[] };

  const HR_EMAIL = /bewerbung@|hr@|personal@|karriere@|recruiting@|jobs@/i;
  const GENERIC_EMAIL = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb|noreply|no-reply)@/i;

  function findBestEmail(text) {
    const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m=>m[0]);
    return all.find(e=>HR_EMAIL.test(e)) || all.find(e=>!GENERIC_EMAIL.test(e)) || all[0] || null;
  }

  function findPhone(text) {
    const m = text.match(/(?:Tel(?:efon|\.)?|Fon|\+49)[\s.:]*([\+\d][\d\s()\-\/]{7,18})/i);
    return m ? m[1].trim().replace(/\s+/g,' ') : null;
  }

  const NAV = new Set(['Downloads','Karriere','Jobs','Kontakt','Impressum','Datenschutz',
    'Login','Home','News','Service','Produkte','Ausbildung','Bewerbung','Team',
    'Amtsgericht','Registergericht','Handelsregister','Deutschland','Germany',
    'Bayern','Berlin','Hamburg','München','Frankfurt','Hannover','Stuttgart','Köln']);

  function isValidName(f,l) {
    if(!f||!l) return false;
    if(NAV.has(f)||NAV.has(l)) return false;
    if(!/^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,19}$/.test(f)) return false;
    if(!/^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24}$/.test(l)) return false;
    if(/\d/.test(f)||/\d/.test(l)) return false;
    return true;
  }

  function extractContact(text) {
    const patterns = [
      /(?:Ansprechpartner(?:in)?|Kontaktperson|Bei\s+Fragen)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[\s\n,]+(?:HR|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting)/,
      /(?:HR|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting)[:\s,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
    ];
    for(const p of patterns) {
      const m = text.match(p);
      if(m && isValidName(m[1],m[2])) return {firstName:m[1],lastName:m[2]};
    }
    const lines = text.split('\n');
    for(let i=0;i<lines.length;i++) {
      const l=lines[i].trim(), prev=(lines[i-1]||'').trim(), next=(lines[i+1]||'').trim();
      if(/HR|Personal|Recruiting/i.test(prev+' '+next)) {
        const m2=l.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)$/);
        if(m2&&isValidName(m2[1],m2[2])) return {firstName:m2[1],lastName:m2[2]};
      }
    }
    return null;
  }

  function findPosition(text) {
    if(/HR[-\s]?Manager/i.test(text)) return 'HR Manager/in';
    if(/Personalleiter|Personalleiterin/i.test(text)) return 'Personalleiter/in';
    if(/Personalreferent|Personalreferentin/i.test(text)) return 'Personalreferent/in';
    if(/Recruiting/i.test(text)) return 'Recruiting';
    if(/Geschäftsführer|CEO/i.test(text)) return 'Geschäftsführer/in';
    if(/Inhaber/i.test(text)) return 'Inhaber/in';
    return 'Ansprechpartner/in';
  }

  function strip(html) {
    return html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
      .replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  }

  // Get website base
  let base = null;
  if(website) {
    base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://'+website;
  } else {
    // Only try .de domain - no guessing
    const raw = name.toLowerCase()
      .replace(/gmbh\s*&\s*co\.?\s*kg|gmbh|\bag\b|\bse\b|\bkg\b|e\.v\.|ohg|\bug\b/gi,'')
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').substring(0,25);
    base = 'https://www.'+raw+'.de';
  }

  // Only try 3 pages, 3s timeout each = max 9s total
  const pages = [
    base+'/karriere',
    base+'/kontakt',
    base+'/impressum',
  ];

  for(const url of pages) {
    try {
      const r = await fetch(url, {
        headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
        signal:AbortSignal.timeout(3000), redirect:'follow'
      });
      if(!r.ok) { if(url.includes('impressum')) break; continue; }
      const text = strip(await r.text());
      if(!result.website) result.website = base;
      const email = findBestEmail(text);
      const phone = findPhone(text);
      if(email && !result.email) result.email = email;
      if(phone && !result.phone) result.phone = phone;
      const contact = extractContact(text);
      if(contact) {
        result.firstName=contact.firstName; result.lastName=contact.lastName;
        result.position=findPosition(text);
        result.source=url.replace(base,'').replace('/','') || 'homepage';
        return res.status(200).json(result);
      }
    } catch(e) {}
  }

  return res.status(200).json(result);
}
