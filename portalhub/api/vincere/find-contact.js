export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { firstName:null, lastName:null, email:null, position:null, source:null };

  // Common German first names list for validation
  const COMMON_FIRST_NAMES = new Set([
    'Anna','Marie','Laura','Sarah','Julia','Lea','Lena','Emma','Hannah','Sophie',
    'Lisa','Jana','Sandra','Sabine','Andrea','Claudia','Nicole','Katharina','Christina',
    'Melina','Vanessa','Maja','Rebecca','Jolina','Stefanie','Monika','Petra','Birgit',
    'Max','Moritz','Felix','Jonas','Lukas','Jan','Tim','Thomas','Michael','Stefan',
    'Andreas','Christian','Daniel','Marco','Simon','Ben','Patrick','Sebastian','Markus',
    'Roman','Pascal','Peter','Klaus','Frank','Jürgen','Werner','Dieter','Hans','Karl',
    'Maria','Susanne','Angelika','Martina','Ute','Renate','Helga','Ingrid','Brigitte',
    'Alexander','Florian','Tobias','Philipp','Matthias','Johannes','David','Kevin',
    'Stephan','Thomas','Martin','Georg','Robert','Wolfgang','Heinrich','Gerhard',
    'Rebecca','Jennifer','Melissa','Tanja','Nadine','Jessica','Annette','Ursula','Anja',
  ]);

  function isLikelyFirstName(word) {
    return COMMON_FIRST_NAMES.has(word) || (word.length >= 3 && word.length <= 15 && /^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+$/.test(word));
  }

  function isLikelyLastName(word) {
    return word.length >= 2 && word.length <= 25 && /^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+$/.test(word);
  }

  const NAV_WORDS = new Set(['Downloads','Extranet','Karriere','Jobs','Kontakt','Impressum',
    'Datenschutz','Login','Suche','Start','Home','News','Service','Produkte','Lösungen',
    'Unternehmen','Ausbildung','Studium','Bewerbung','Stellenangebote','Team','Über',
    'Infos','Duale','Studiengänge','Bewerbungstipps','Checkliste',
    // Legal/register terms that appear in Impressum
    'Amtsgericht','Registergericht','Handelsregister','Finanzamt','Steuernummer',
    'Umsatzsteuer','Aufsichtsbehörde','Bundesanstalt','Verbraucherzentrale',
    'Datenschutzbeauftragter','Geschäftsführung','Vorstand','Aufsichtsrat',
    'Pflichtangaben','Streitschlichtung','Plattform','Europäische','Kommission',
    'Deutschland','Germany','Bayern','Berlin','Hamburg','München','Frankfurt',
    'Hannover','Paderborn','Stuttgart','Köln','Düsseldorf','Dortmund','Leipzig']);

  function isValidName(first, last) {
    if(!first || !last) return false;
    if(NAV_WORDS.has(first) || NAV_WORDS.has(last)) return false;
    if(!isLikelyFirstName(first)) return false;
    if(!isLikelyLastName(last)) return false;
    if(first.length < 2 || last.length < 2) return false;
    return true;
  }

  function findEmail(text) {
    const emails = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
    // prefer personal/hr emails over generic ones
    const personal = emails.find(m => {
      const e = m[0].toLowerCase();
      return !e.startsWith('info@') && !e.startsWith('post@') && !e.startsWith('kontakt@') 
             && !e.startsWith('mail@') && !e.startsWith('office@') && !e.startsWith('jobs@');
    });
    if(personal) return personal[0];
    // fallback to any email
    return emails.length ? emails[0][0] : null;
  }

  function extractContacts(text) {
    // Strategy 1: explicit keywords before name
    const explicit = [
      /(?:Ansprechpartner(?:in)?|Ihr(?:e)?\s+Ansprechpartner(?:in)?|Kontaktperson|wenden\s+Sie\s+sich\s+an)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/g,
      /(?:Jetzt\s+Kontakt\s+mit|Bei\s+Fragen\s+(?:hilft|steht|wenden))[^a-zA-Z]{0,20}([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+(?:aufnehmen|wenden|hilft)/g,
    ];
    for(const pattern of explicit) {
      const m = pattern.exec(text);
      if(m && isValidName(m[1], m[2])) return {firstName:m[1], lastName:m[2], confidence:'high'};
    }

    // Strategy 2: name followed by HR title
    const afterName = /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[\s\n,]+(?:HR|Personal(?:referent|leiterin|referentin|leiter|manager|managerin)|Recruiting|Ausbilder(?:in)?|Teamleit(?:er|ung)|Learning)/g;
    let m2;
    while((m2 = afterName.exec(text)) !== null) {
      if(isValidName(m2[1], m2[2])) return {firstName:m2[1], lastName:m2[2], confidence:'medium'};
    }

    // Strategy 3: HR title followed by name
    const beforeName = /(?:HR|Personal(?:referent|leiterin|referentin|leiter|manager|managerin)|Recruiting|Ausbilder(?:in)?|Teamleit(?:er|ung))[^\n]{0,30}\n([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/g;
    let m3;
    while((m3 = beforeName.exec(text)) !== null) {
      if(isValidName(m3[1], m3[2])) return {firstName:m3[1], lastName:m3[2], confidence:'medium'};
    }

    // Strategy 4: Geschäftsführer/CEO patterns
    const ceo = /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/g;
    let m4;
    while((m4 = ceo.exec(text)) !== null) {
      if(isValidName(m4[1], m4[2])) return {firstName:m4[1], lastName:m4[2], confidence:'low'};
    }

    return null;
  }

  function findPosition(text) {
    if(/HR[-\s]?Manager(?:in)?/i.test(text)) return 'HR Manager/in';
    if(/Talent\s*Acquisition/i.test(text)) return 'Talent Acquisition';
    if(/Personal(?:leiter|leiterin)/i.test(text)) return 'Personalleiter/in';
    if(/Personal(?:referent|referentin)/i.test(text)) return 'Personalreferent/in';
    if(/Ausbilder(?:in)?/i.test(text)) return 'Ausbilder/in';
    if(/Recruiting/i.test(text)) return 'Recruiting';
    if(/Geschäftsführer(?:in)?|CEO/i.test(text)) return 'Geschäftsführer/in';
    if(/Inhaber(?:in)?/i.test(text)) return 'Inhaber/in';
    return 'Ansprechpartner/in';
  }

  function processPage(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<[^>]+>/g,'\n')
      .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  }

  // STAGE 1: Job text
  if(jobText) {
    const decoded = decodeURIComponent(jobText);
    const contact = extractContacts(decoded);
    if(contact) {
      return res.status(200).json({
        firstName:contact.firstName, lastName:contact.lastName,
        email:findEmail(decoded), position:findPosition(decoded), source:'stellenanzeige'
      });
    }
  }

  // STAGE 2: Website pages in priority order
  if(website) {
    const base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://'+website;
    const pages = [
      base+'/karriere', base+'/jobs', base+'/de/karriere',
      base+'/kontakt', base+'/contact', base+'/team',
      base+'/impressum', base,
    ];

    for(const url of pages) {
      try {
        const r = await fetch(url, {
          headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'},
          signal:AbortSignal.timeout(4000), redirect:'follow'
        });
        if(!r.ok) continue;
        const text = processPage(await r.text());
        const contact = extractContacts(text);
        const email = findEmail(text);
        if(contact) {
          return res.status(200).json({
            firstName:contact.firstName, lastName:contact.lastName,
            email: email||result.email,
            position: findPosition(text),
            source: url.replace(base,'').replace('/','') || 'homepage'
          });
        }
        if(email && !result.email) result.email = email;
      } catch(e) {}
    }
  }

  // STAGE 3: If no website provided, try to guess domain
  if(!website) {
    const raw = name
      .toLowerCase()
      .replace(/gmbh\s*&\s*co\.?\s*kg|gmbh|ag|se|kg|e\.v\.|ohg|ug|ltd|inc|corp|llc/gi,'')
      .replace(/[^a-z0-9äöüß]+/g,'-')
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/-+/g,'-').replace(/^-+|-+$/g,'').substring(0,30);

    const domains = [
      'https://www.'+raw+'.de',
      'https://www.'+raw+'.com',
      'https://'+raw+'.de',
      'https://'+raw+'.com',
    ];

    for(const base of domains) {
      const pages = [base+'/karriere', base+'/jobs', base+'/kontakt', base+'/impressum', base];
      let found = false;
      for(const url of pages) {
        try {
          const r = await fetch(url, {
            headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
            signal:AbortSignal.timeout(3000), redirect:'follow'
          });
          if(!r.ok) continue;
          const text = processPage(await r.text());
          const contact = extractContacts(text);
          const email = findEmail(text);
          if(contact) {
            return res.status(200).json({
              firstName:contact.firstName, lastName:contact.lastName,
              email: email||result.email,
              position: findPosition(text),
              source: url.replace(base,'').replace('/','') || 'homepage'
            });
          }
          if(email && !result.email) result.email = email;
          found = true; // domain exists, no need to try next domain
        } catch(e) {}
      }
      if(found) break; // domain responded, stop trying other domains
    }
  }

  // Return what we found (maybe just email)
  return res.status(200).json(result);
}
