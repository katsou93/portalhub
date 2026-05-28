// find-contact.js
// Priority: 1) jobText (Stellenanzeige)  2) Website scraping (nur wenn echte URL bekannt)
// NEVER invent contacts - only real people from real sources

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });

  const empty = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const HR_EMAIL   = /(?:bewerbung|hr|personal|karriere|recruiting|jobs|talent)@/i;
  const SKIP_EMAIL = /^(noreply|no-reply|donotreply|bounce|mailer-daemon)@/i;
  const GENERIC    = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb)@/i;

  function bestEmail(text) {
    const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
      .map(m => m[0]).filter(e => !SKIP_EMAIL.test(e));
    if (!all.length) return null;
    // Upgrade priority: HR > personal > generic
    return all.find(e => HR_EMAIL.test(e))
        || all.find(e => !GENERIC.test(e))
        || all[0];
  }

  function bestPhone(text) {
    const m = text.match(/(?:Tel(?:efon|\.)?|Fon|\+49|Mobil)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  }

  // Words that must never appear as first or last name
  const BLACKLIST = new Set([
    // Generic/nav words
    'Downloads','Karriere','Jobs','Kontakt','Impressum','Datenschutz','Login',
    'Home','News','Service','Produkte','Ausbildung','Bewerbung','Team','Info',
    'Unternehmen','Leistungen','Referenzen','Partner','Blog','Presse','Stellenangebote',
    // Geographic / institutional
    'Landkreis','Kreis','Stadt','Gemeinde','Bundesland','Bezirk','Region','Verwaltung',
    'Amtsgericht','Handelsregister','Deutschland','Germany','Bayern','Berlin',
    'Hamburg','München','Frankfurt','Köln','Stuttgart','Hannover','Düsseldorf',
    'Krefeld','Dortmund','Dresden','Leipzig','Bremen','Essen','Duisburg',
    // Articles / pronouns that appear before names
    'Der','Die','Das','Den','Dem','Ein','Eine','Ihr','Ihre','Unser','Unsere',
    // Company types
    'GmbH','AG','KG','SE','OHG','UG','Dienstleistungen','Management',
    // Departments
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
    return true;
  }

  function stripHtml(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  }

  function extractHR(text) {
    const patterns = [
      /(?:Ansprechpartner(?:in)?|Kontaktperson|Bei\s+Fragen)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[,\s]+(?:HR|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting(?:erin?)?|Leiter(?:in)?\s+Personal)/,
      /(?:HR|Personal(?:referent|referentin|leiter|leiterin|manager|managerin)|Recruiting(?:erin?)?|Leiter(?:in)?\s+Personal)[:\s,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
    ];
    for (const p of patterns) {
      for (const m of text.matchAll(new RegExp(p.source, 'g'))) {
        if (isRealName(m[1], m[2])) return { firstName: m[1], lastName: m[2] };
      }
    }
    return null;
  }

  function extractCEO(text) {
    const patterns = [
      /(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?|Vorstand(?:svorsitzender)?)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[,\s]+(?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)/,
      /(?:vertreten\s+durch|represented\s+by)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/i,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s*\((?:Geschäftsführer(?:in)?|CEO|Inhaber(?:in)?)\)/,
    ];
    for (const p of patterns) {
      for (const m of text.matchAll(new RegExp(p.source, 'g'))) {
        if (isRealName(m[1], m[2])) return { firstName: m[1], lastName: m[2] };
      }
    }
    return null;
  }

  function getHRPosition(text) {
    if (/Personalleiter/i.test(text)) return 'Personalleiter/in';
    if (/Personalreferent/i.test(text)) return 'Personalreferent/in';
    if (/HR.?Manager/i.test(text)) return 'HR Manager/in';
    if (/Recruiting/i.test(text)) return 'Recruiting';
    return 'Ansprechpartner/in';
  }

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

  // ── DuckDuckGo website finder ─────────────────────────────────────────────
  async function findWebsiteViaDDG(companyName) {
    try {
      const query = encodeURIComponent('"' + companyName + '" Impressum');
      const r = await fetch('https://html.duckduckgo.com/html/?q=' + query, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'de-DE,de;q=0.9',
        },
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return null;
      const html = await r.text();

      // Extract result URLs from DDG HTML response
      const urlMatches = [...html.matchAll(/uddg=([^"&]+)/g)]
        .map(m => decodeURIComponent(m[1]))
        .filter(u => u.startsWith('http'));

      // Build keywords from company name (skip legal suffixes)
      const keywords = companyName.toLowerCase()
        .replace(/gmbh & co\.? kg|gmbh & co|gmbh|\bag\b|\bkg\b|\bse\b|e\.v\./gi, '')
        .replace(/[^a-z0-9äöüß]/g, ' ').trim()
        .split(/\s+/).filter(w => w.length > 3);

      const SKIP = /linkedin|xing|facebook|instagram|kununu|stepstone|indeed|monster|arbeitsagentur|wikipedia|youtube|twitter|tiktok|google|bing|yahoo|wlw\.de|firmenwissen|northdata|handelsregister|opencorporates|dnb\.com/i;

      console.log('DDG urls found:', urlMatches.length, 'keywords:', keywords);
      console.log('DDG first 5 urls:', urlMatches.slice(0,5).join(' | '));
      
      for (const u of urlMatches) {
        try {
          const parsed = new URL(u);
          const domain = parsed.hostname.replace(/^www\./, '');
          if (SKIP.test(domain)) continue;
          // Domain must contain at least one company keyword
          const domainParts = domain.split(/[.\-]/);
          const hit = keywords.some(k => domainParts.some(d => d.includes(k) || k.includes(d)));
          console.log('DDG check:', domain, 'domainParts:', domainParts, 'hit:', hit, 'keywords:', keywords);
          if (hit) {
            const found = 'https://' + parsed.hostname;
            console.log('DDG found:', found, 'for', companyName);
            return found;
          }
        } catch {}
      }
      // Fallback: if no keyword match, try first non-skipped result
      for (const u of urlMatches) {
        try {
          const parsed = new URL(u);
          if (!SKIP.test(parsed.hostname)) {
            const found = 'https://' + parsed.hostname;
            console.log('DDG fallback (first result):', found);
            return found;
          }
        } catch {}
      }
      return null;
    } catch (e) {
      console.log('DDG error:', e.message);
      return null;
    }
  }

  // ── Priority 0: Parse jobText from Stellenanzeige ─────────────────────────
  if (jobText) {
    const jt = decodeURIComponent(jobText).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    const jtEmail = bestEmail(jt);
    const jtPhone = bestPhone(jt);

    const hr = extractHR(jt);
    if (hr) {
      return res.status(200).json({
        firstName: hr.firstName, lastName: hr.lastName,
        email: jtEmail, phone: jtPhone,
        position: getHRPosition(jt), source: 'stellenanzeige', website: website || null,
      });
    }
    // Direct name patterns in job ads
    const directPatterns = [
      /(?:Ansprechpartner(?:in)?|Ihr Kontakt|Kontakt)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/i,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s*(?:ist Ihr|steht Ihnen|freut sich|beantwortet Ihre)/i,
    ];
    for (const p of directPatterns) {
      const m = jt.match(p);
      if (m && isRealName(m[1], m[2])) {
        return res.status(200).json({
          firstName: m[1], lastName: m[2],
          email: jtEmail, phone: jtPhone,
          position: 'Ansprechpartner/in', source: 'stellenanzeige', website: website || null,
        });
      }
    }
    // Email/phone only from job text
    if (jtEmail || jtPhone) {
      // Save for later as fallback
    }
  }

  // ── Priority 1+2: Website scraping ────────────────────────────────────────
  let base = null;
  if (website) {
    base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://' + website;
  } else {
    // No known website → try DuckDuckGo to find the company website
    base = await findWebsiteViaDDG(name);
    if (!base) {
      const fallbackEmail = jobText ? bestEmail(decodeURIComponent(jobText)) : null;
      const fallbackPhone = jobText ? bestPhone(decodeURIComponent(jobText)) : null;
      if (fallbackEmail) {
        return res.status(200).json({ ...empty, email: fallbackEmail, phone: fallbackPhone });
      }
      return res.status(200).json(empty);
    }
  }



  // Fetch key pages in parallel
  const pages = [
    { url: base + '/impressum',     type: 'impressum' },
    { url: base + '/karriere',      type: 'career' },
    { url: base + '/kontakt',       type: 'contact' },
    { url: base,                    type: 'home' },
  ];

  const results = await Promise.all(
    pages.map(p => fetchPage(p.url).then(text => ({ ...p, text })))
  );

  let bestEmailFound = jobText ? bestEmail(decodeURIComponent(jobText)) : null;
  let bestPhoneFound = jobText ? bestPhone(decodeURIComponent(jobText)) : null;
  let ceoContact = null;
  let ceoSource = null;

  for (const page of results) {
    if (!page.text) continue;
    const email = bestEmail(page.text);
    const phone = bestPhone(page.text);

    // Upgrade email priority
    if (email) {
      if (!bestEmailFound) bestEmailFound = email;
      else if (HR_EMAIL.test(email) && !HR_EMAIL.test(bestEmailFound)) bestEmailFound = email;
      else if (!GENERIC.test(email) && GENERIC.test(bestEmailFound)) bestEmailFound = email;
    }
    if (phone && !bestPhoneFound) bestPhoneFound = phone;

    // HR contact (highest priority)
    const hr = extractHR(page.text);
    if (hr) {
      return res.status(200).json({
        firstName: hr.firstName, lastName: hr.lastName,
        email: bestEmailFound || email, phone: bestPhoneFound || phone,
        position: getHRPosition(page.text), source: page.url.replace(base,'') || 'homepage',
        website: base,
      });
    }

    // CEO fallback
    if (!ceoContact) {
      const ceo = extractCEO(page.text);
      if (ceo) { ceoContact = ceo; ceoSource = page.url.replace(base,'') || 'homepage'; }
    }
  }

  if (ceoContact) {
    const pos = ceoSource?.includes('impressum') ? 'Geschäftsführer/in' : 'Ansprechpartner/in';
    return res.status(200).json({
      firstName: ceoContact.firstName, lastName: ceoContact.lastName,
      email: bestEmailFound, phone: bestPhoneFound,
      position: pos, source: ceoSource, website: base,
    });
  }

  // Email-only fallback
  if (bestEmailFound) {
    return res.status(200).json({ ...empty, email: bestEmailFound, phone: bestPhoneFound, website: base });
  }

  return res.status(200).json(empty);
}
