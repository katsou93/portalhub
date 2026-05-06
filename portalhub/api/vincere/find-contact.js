export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null, jobs:[] };

  // Common German first names for validation
  const FIRST_NAMES = new Set(['Anna','Marie','Laura','Sarah','Julia','Lea','Lena','Emma','Hannah','Sophie',
    'Lisa','Jana','Sandra','Sabine','Andrea','Claudia','Nicole','Katharina','Christina','Melina','Vanessa',
    'Maja','Rebecca','Jolina','Stefanie','Monika','Petra','Birgit','Anja','Nadine','Jessica','Tanja',
    'Max','Felix','Jonas','Lukas','Jan','Tim','Thomas','Michael','Stefan','Andreas','Christian','Daniel',
    'Marco','Simon','Ben','Patrick','Sebastian','Markus','Roman','Pascal','Peter','Klaus','Frank',
    'Alexander','Florian','Tobias','Philipp','Matthias','Johannes','David','Kevin','Stephan','Martin',
    'Georg','Robert','Wolfgang','Heinrich','Gerhard','Jürgen','Werner','Dieter','Hans','Karl',
    'Sandra','Angelika','Martina','Ute','Renate','Helga','Ingrid','Brigitte','Ursula','Jennifer',
    'Melissa','Annette','Rebecca','Susanne','Silke','Katrin','Nina','Sonja','Marion','Iris']);

  const NAV_WORDS = new Set(['Downloads','Extranet','Karriere','Jobs','Kontakt','Impressum',
    'Datenschutz','Login','Suche','Start','Home','News','Service','Produkte','Lösungen',
    'Unternehmen','Ausbildung','Studium','Bewerbung','Stellenangebote','Team','Über',
    'Infos','Duale','Studiengänge','Bewerbungstipps','Checkliste',
    'Amtsgericht','Registergericht','Handelsregister','Finanzamt','Steuernummer',
    'Umsatzsteuer','Aufsichtsbehörde','Bundesanstalt','Verbraucherzentrale',
    'Datenschutzbeauftragter','Geschäftsführung','Vorstand','Aufsichtsrat',
    'Deutschland','Germany','Bayern','Berlin','Hamburg','München','Frankfurt',
    'Hannover','Paderborn','Stuttgart','Köln','Düsseldorf','Dortmund','Leipzig',
    'Strasse','Straße','Platz','Weg','Ring','Allee','Gasse','Damm']);

  function isValidName(first, last) {
    if(!first||!last) return false;
    if(NAV_WORDS.has(first)||NAV_WORDS.has(last)) return false;
    if(!/^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,19}$/.test(first)) return false;
    if(!/^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24}$/.test(last)) return false;
    if(/\d/.test(first)||/\d/.test(last)) return false;
    return true;
  }

  // Find HR/Bewerbung emails first, then fallback
  function findBestEmail(text) {
    const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m=>m[0]);
    // Priority 1: HR/Bewerbung specific
    const hr = all.find(e=>/bewerbung|hr@|personal@|karriere@|recruiting@|jobs@/i.test(e));
    if(hr) return hr;
    // Priority 2: Named person email (firstname.lastname@)
    const named = all.find(e=>/^[a-z]+\.[a-z]+@/i.test(e) && !/noreply|no-reply|test@|example/i.test(e));
    if(named) return named;
    // Priority 3: Any non-generic
    const nonGeneric = all.find(e=>!/^(?:info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb|marketing)@/i.test(e));
    if(nonGeneric) return nonGeneric;
    // Fallback: whatever
    return all[0]||null;
  }

  function findPhone(text) {
    const m = text.match(/(?:Tel(?:efon|\.)?|Fon|Phone|\+49)[\s.:]*([\d\s\(\)\-\/\+]{8,20})/i);
    if(m) return m[1].trim().replace(/\s+/g,' ');
    // German format: 0xxx xxx or +49 xxx
    const m2 = text.match(/(?:^|\s)(\+49[\s\d\-\/]{6,18}|0[\d]{3,5}[\s\-\/]?[\d\s\-\/]{4,12})(?=\s|$)/m);
    return m2 ? m2[1].trim() : null;
  }

  function extractContact(text) {
    const patterns = [
      /(?:Ansprechpartner(?:in)?|Ihr(?:e)?\s+Ansprechpartner(?:in)?|Kontaktperson|Bei\s+Fragen)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[\s\n,]+(?:HR[-\s]?Manager(?:in)?|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting|Talent)/,
      /(?:HR[-\s]?Manager(?:in)?|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting)[:\s,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
    ];
    for(const p of patterns) {
      const m = text.match(p);
      if(m && isValidName(m[1],m[2])) return {firstName:m[1],lastName:m[2]};
    }
    // Also try: person name on its own line where next/prev line has HR title
    const lines = text.split('\n');
    for(let i=0;i<lines.length;i++) {
      const l = lines[i].trim();
      const prev = (lines[i-1]||'').trim();
      const next = (lines[i+1]||'').trim();
      const hrContext = prev+' '+next;
      if(/HR|Personal|Recruiting|Ausbilder|Teamleit/i.test(hrContext)) {
        const m2 = l.match(/^([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)$/);
        if(m2 && isValidName(m2[1],m2[2])) return {firstName:m2[1],lastName:m2[2]};
      }
    }
    return null;
  }

  function findPosition(text) {
    if(/HR[-\s]?Manager(?:in)?/i.test(text)) return 'HR Manager/in';
    if(/Talent\s*Acquisition/i.test(text)) return 'Talent Acquisition';
    if(/Personal(?:leiter|leiterin)/i.test(text)) return 'Personalleiter/in';
    if(/Personal(?:referent|referentin)/i.test(text)) return 'Personalreferent/in';
    if(/Recruiting/i.test(text)) return 'Recruiting';
    if(/Ausbilder(?:in)?/i.test(text)) return 'Ausbilder/in';
    if(/Geschäftsführer(?:in)?|CEO/i.test(text)) return 'Geschäftsführer/in';
    if(/Inhaber(?:in)?/i.test(text)) return 'Inhaber/in';
    return 'Ansprechpartner/in';
  }

  function extractJobs(text) {
    // Common job title patterns in German
    const jobPatterns = [
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+(?:\s+[a-zA-ZäöüÄÖÜß\-]+){0,3}\s*(?:Programmierer|Entwickler|Ingenieur|Techniker|Administrator|Manager|Konstrukteur|Mechatroniker|Elektriker|Schlosser|Dreher|Fräser|Schweißer|Monteur|Meister|Spezialist|Berater|Analyst|Architekt|Designer|Projektleiter))(?:\s*\(m\/w\/d\))?/gi,
    ];
    const jobs = new Set();
    for(const p of jobPatterns) {
      const matches = [...text.matchAll(p)];
      for(const m of matches) {
        const job = m[1].trim().replace(/\s+/g,' ');
        if(job.length > 3 && job.length < 60) jobs.add(job);
      }
    }
    return [...jobs].slice(0,10);
  }

  function processHtml(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<[^>]+>/g,'\n')
      .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  }

  // STAGE 1: Job text from Stellenanzeige
  if(jobText) {
    const decoded = decodeURIComponent(jobText);
    const contact = extractContact(decoded);
    if(contact) {
      result.firstName=contact.firstName; result.lastName=contact.lastName;
      result.email=findBestEmail(decoded); result.phone=findPhone(decoded);
      result.position=findPosition(decoded); result.source='stellenanzeige';
      if(result.firstName) return res.status(200).json(result);
    }
  }

  // STAGE 2: Scrape website pages
  const bases = [];
  if(website) bases.push(website.startsWith('http') ? website.replace(/\/$/, '') : 'https://'+website);

  // Also try domain guessing if no website
  if(!website) {
    const raw = name.toLowerCase()
      .replace(/gmbh\s*&\s*co\.?\s*kg|gmbh|ag\s*$|\bse\b|\bkg\b|e\.v\.|ohg|\bug\b/gi,'')
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').substring(0,30);
    bases.push('https://www.'+raw+'.de', 'https://www.'+raw+'.com');
  }

  for(const base of bases) {
    const pages = [
      {url:base+'/karriere', type:'hr'},
      {url:base+'/jobs', type:'hr'},
      {url:base+'/de/karriere', type:'hr'},
      {url:base+'/kontakt', type:'contact'},
      {url:base+'/team', type:'team'},
      {url:base+'/impressum', type:'ceo'},
      {url:base, type:'home'},
    ];

    let domainWorked = false;
    for(const page of pages) {
      try {
        const r = await fetch(page.url, {
          headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
          signal:AbortSignal.timeout(4000), redirect:'follow'
        });
        if(!r.ok) continue;
        domainWorked = true;
        const text = processHtml(await r.text());
        const contact = extractContact(text);
        const email = findBestEmail(text);
        const phone = findPhone(text);
        const jobs = extractJobs(text);

        if(!result.website) result.website = base;
        if(email && !result.email) result.email = email;
        if(phone && !result.phone) result.phone = phone;
        if(jobs.length && !result.jobs.length) result.jobs = jobs;

        if(contact && isValidName(contact.firstName, contact.lastName)) {
          result.firstName=contact.firstName; result.lastName=contact.lastName;
          result.position=findPosition(text)||(page.type==='ceo'?'Geschäftsführer/in':'Ansprechpartner/in');
          result.source=page.url.replace(base,'').replace('/','') || 'homepage';
          return res.status(200).json(result);
        }
      } catch(e) {}
    }
    if(domainWorked) break; // Domain responded, stop trying others
  }

  return res.status(200).json(result);
}
