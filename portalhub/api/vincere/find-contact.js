// Find HR contact for a company
// Priority: 1) BA job detail  2) Career page  3) Contact page  4) Impressum (CEO)
// NEVER invent - only real people found in real sources

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = {
    firstName: null, lastName: null,
    email: null, phone: null,
    position: null, source: null,
    website: null,
  };

  // Email priority: HR-specific > personal > generic
  const HR_EMAIL  = /(?:bewerbung|hr|personal|karriere|recruiting|jobs|talent)@/i;
  const SKIP_EMAIL = /^(noreply|no-reply|donotreply|bounce|mailer-daemon)@/i;
  const GENERIC   = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb)@/i;

  function bestEmail(text) {
    const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
      .map(m => m[0]).filter(e => !SKIP_EMAIL.test(e));
    return all.find(e => HR_EMAIL.test(e))
        || all.find(e => !GENERIC.test(e))
        || all[0]
        || null;
  }

  function bestPhone(text) {
    const m = text.match(/(?:Tel(?:efon|\.)?|Fon|\+49|Mobil)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  }

  // Name validation - must look like a real German/European name
  const BLACKLIST = new Set([
    // Navigation / generic words
    'Downloads','Karriere','Jobs','Kontakt','Impressum','Datenschutz','Login',
    'Home','News','Service','Produkte','Ausbildung','Bewerbung','Team','Info',
    'Unternehmen','Leistungen','Referenzen','Partner','Blog','Presse',
    // Legal / address words
    'Amtsgericht','Handelsregister','Deutschland','Germany','Bayern','Berlin',
    'Hamburg','München','Frankfurt','Köln','Stuttgart','Hannover','Düsseldorf',
    'Krefeld','Dortmund','Dresden','Leipzig','Bremen','Essen','Duisburg',
    // Company types
    'GmbH','AG','KG','SE','OHG','UG','Dienstleistungen','Management',
    // Department/function names that appear near contacts
    'Vertrieb','Marketing','Personal','Recruiting','Einkauf','Buchhaltung',
    'Controlling','Produktion','Technik','Entwicklung','Forschung','Logistik',
    'Verwaltung','Sekretariat','Empfang','Assistenz','Beratung','Support',
    'Qualität','Sicherheit','Compliance','Recht','Finanzen','Rechnungswesen',
    'International','Regional','National','Global','Digital','Online',
    'Herr','Frau','Dr','Prof','Dipl','Ing','Hr','Fr',
  ]);

  function isRealName(first, last) {
    if (!first || !last) return false;
    if (BLACKLIST.has(first) || BLACKLIST.has(last)) return false;
    if (!/^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24}$/.test(first)) return false;
    if (!/^[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,29}$/.test(last)) return false;
    if (/\d/.test(first) || /\d/.test(last)) return false;
    if (first.length < 2 || last.length < 2) return false;
    return true;
  }

  function stripHtml(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }

  // Extract contact from text - HR first, then CEO/Geschäftsführer
  function extractHR(text) {
    const HR_PATTERNS = [
      /(?:Ansprechpartner(?:in)?|Kontaktperson|Bei\s+Fragen)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[,\s]+(?:HR|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting(?:erin?)?)/,
      /(?:HR|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting(?:erin?)?)[:\s,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      // "Leiter Personal: Max Mustermann"
      /(?:Leiter(?:in)?\s+Personal|Head\s+of\s+HR|Personalverantwortlich)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
    ];
    for (const p of HR_PATTERNS) {
      for (const m of text.matchAll(new RegExp(p.source, p.flags + 'g'))) {
        if (isRealName(m[1], m[2])) {
          return { firstName: m[1], lastName: m[2], type: 'hr' };
        }
      }
    }
    return null;
  }

  function extractCEO(text) {
    const CEO_PATTERNS = [
      // "Geschäftsführer: Max Mustermann" or "CEO: Max Mustermann"
      /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?|Vorstand(?:svorsitzender)?|Verantwortlich(?:er)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,29})/,
      // "Max Mustermann, Geschäftsführer"
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,29})[,\s]+(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)/,
      // "vertreten durch Max Mustermann"
      /(?:vertreten\s+durch|represented\s+by)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,29})/i,
      // "Max Mustermann (Geschäftsführer)"
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,24})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,29})\s*\((?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)\)/,
    ];
    for (const p of CEO_PATTERNS) {
      for (const m of text.matchAll(new RegExp(p.source, p.flags + 'g'))) {
        if (isRealName(m[1], m[2])) {
          return { firstName: m[1], lastName: m[2], type: 'ceo' };
        }
      }
    }
    return null;
  }

  function getPosition(type, text) {
    if (type === 'ceo') {
      if (/Inhaber/i.test(text)) return 'Inhaber/in';
      if (/CEO/i.test(text)) return 'CEO';
      return 'Geschäftsführer/in';
    }
    if (/HR[-\s]?Manager/i.test(text)) return 'HR Manager/in';
    if (/Personalleiter(?:in)?/i.test(text)) return 'Personalleiter/in';
    if (/Personalreferent(?:in)?/i.test(text)) return 'Personalreferent/in';
    if (/Recruiting/i.test(text)) return 'Recruiting';
    return 'Ansprechpartner/in';
  }

  // Determine base URL
  let base = null;
  if (website) {
    base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://' + website;
  } else {
    const stripped = name.toLowerCase()
      .replace(/gmbh\s*&\s*co\.?\s*kg|gmbh\s*&\s*co|grp\.|group|\bag\b|\bse\b|\bkg\b|e\.v\.|ohg|\bug\b|\bgmbh\b/gi, '')
      .replace(/niederlassung\s+\w+/gi, '')   // strip "Niederlassung Erfurt" etc
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/\s+/g, ' ').trim();

    const words = stripped.split(' ').filter(w => w.length > 0);
    const firstToken = (words[0] || '').replace(/[^a-z0-9\-]/g, '').replace(/^-+|-+$/g, '');
    const twoWords = words.slice(0,2).join('-').replace(/[^a-z0-9\-]/g,'').replace(/^-+|-+$/g,'').substring(0,25);

    if (!firstToken || firstToken.length < 2) return res.status(200).json(result);

    // Primary: twoWords (e.g. "august-storck", "next-2m", "ibu-tec")
    // Alt: firstToken alone as fallback
    const primary = twoWords.length > firstToken.length ? twoWords : firstToken;
    const secondary = primary === twoWords && firstToken !== twoWords ? firstToken : null;

    base = 'https://www.' + primary + '.de';
    result._altBase2 = secondary ? 'https://www.' + secondary + '.de' : null;
  }
  result.website = base;

  const fetchPage = async (url) => {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(2500),
        redirect: 'follow',
      });
      if (!r.ok) return null;
      return stripHtml(await r.text());
    } catch { return null; }
  };

  // Pages to try in order - HR pages first, then Impressum for CEO
  // Build candidate URLs to try - also try alt base domain
  const altBase = result._altBase || result._altBase2;
  delete result._altBase;
  delete result._altBase2;
  // Fetch impressum + karriere in parallel for speed, then contact page
  // Vercel has 10s limit - keep total well under that
  const basePages = [
    { url: base + '/impressum',       type: 'impressum' },
    { url: base + '/karriere',        type: 'career' },
    { url: base + '/kontakt',         type: 'contact' },
    { url: base,                      type: 'home' },
  ];
  const altPages = altBase ? [
    { url: altBase + '/impressum',    type: 'impressum' },
    { url: altBase + '/karriere',     type: 'career' },
    { url: altBase,                   type: 'home' },
  ] : [];
  const pages = [...basePages, ...altPages];

  let ceoContact = null;
  let bestEmailFound = null;
  let bestPhoneFound = null;

  // Priority 0: Parse jobText from BA listing (contains contact info as plain text)
  if (jobText) {
    const jt = decodeURIComponent(jobText).replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ');
    
    const jtEmail = bestEmail(jt);
    const jtPhone = bestPhone(jt);
    if (jtEmail) bestEmailFound = jtEmail;
    if (jtPhone) bestPhoneFound = jtPhone;

    // Look for contact name in jobText
    const jtHR = extractHR(jt);
    if (jtHR) {
      return res.status(200).json({
        firstName: jtHR.firstName,
        lastName:  jtHR.lastName,
        email:     bestEmailFound,
        phone:     bestPhoneFound,
        position:  getPosition('hr', jt),
        source:    'stellenanzeige',
        website:   base || null,
      });
    }
    // Also try direct name patterns from job listings
    const directPatterns = [
      /(?:Ansprechpartner(?:in)?|Kontakt(?:person)?|Ihr Kontakt)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/i,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s*(?:ist Ihr|ist Ihre|freut sich|steht Ihnen|beantwortet)/i,
    ];
    for (const p of directPatterns) {
      const m = jt.match(p);
      if (m && isRealName(m[1], m[2])) {
        return res.status(200).json({
          firstName: m[1],
          lastName:  m[2],
          email:     bestEmailFound,
          phone:     bestPhoneFound,
          position:  'Ansprechpartner/in',
          source:    'stellenanzeige',
          website:   base || null,
        });
      }
    }
  }

  // Fetch all pages in parallel for speed (Vercel 10s limit)
  const pageResults = await Promise.all(
    pages.map(page => fetchPage(page.url).then(text => ({ ...page, text })))
  );

  for (const page of pageResults) {
    const text = page.text;
    if (!text) continue;

    const email = bestEmail(text);
    const phone = bestPhone(text);
    // Upgrade bestEmailFound if we find a better (more specific) email
    if (email) {
      if (!bestEmailFound) {
        bestEmailFound = email;
      } else if (HR_EMAIL.test(email) && !HR_EMAIL.test(bestEmailFound)) {
        bestEmailFound = email;
      } else if (!GENERIC.test(email) && GENERIC.test(bestEmailFound)) {
        bestEmailFound = email;
      }
    }
    if (phone && !bestPhoneFound) bestPhoneFound = phone;

    // Try HR contact first (any page)
    const hrContact = extractHR(text);
    if (hrContact) {
      return res.status(200).json({
        firstName: hrContact.firstName,
        lastName:  hrContact.lastName,
        email:     bestEmailFound || email,
        phone:     bestPhoneFound || phone,
        position:  getPosition('hr', text),
        source:    page.url.replace(base, '') || 'homepage',
        website:   base,
      });
    }

    // Keep CEO as fallback (from impressum or about page)
    if (!ceoContact) {
      const ceo = extractCEO(text);
      if (ceo) {
        ceoContact = {
          firstName: ceo.firstName,
          lastName:  ceo.lastName,
          position:  getPosition('ceo', text),
          source:    page.url.replace(base, '') || 'homepage',
        };
      }
    }
  }

  // Fallback: use CEO if found
  if (ceoContact) {
    return res.status(200).json({
      ...ceoContact,
      email: bestEmailFound,
      phone: bestPhoneFound,
      website: base,
    });
  }

  // No contact found - return email only if found (still useful)
  if (bestEmailFound) {
    return res.status(200).json({
      ...result,
      email: bestEmailFound,
      phone: bestPhoneFound,
      website: base,
    });
  }

  return res.status(200).json(result);
}
