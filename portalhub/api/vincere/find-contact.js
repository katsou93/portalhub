// find-contact.js — reliable contact finder
// Priority: 1) jobText  2) Website (if known)  3) DuckDuckGo → Website  4) null
// NEVER invent contacts. Only real people from real sources.

// ── Domain prober: find company website by testing candidate domains ─────────
// Derives candidates from company name and probes them with a HEAD request
async function findWebsiteByProbing(companyName) {
  // Normalize company name to domain-safe string
  const norm = companyName.toLowerCase()
    .replace(/gmbh\s*&\s*co\.?\s*kg|gmbh\s*&\s*co|gmbh|grp\.|group|\bag\b|\bse\b|\bkg\b|e\.v\.|ohg|\bug\b/gi, '')
    .replace(/niederlassung\s+\w+/gi, '')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9\s\-]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');

  const words = norm.split('-').filter(w => w.length > 0);
  if (!words.length) return null;

  // Build candidate domains from most specific to least specific
  const candidates = new Set();
  // Full name slug (up to 4 words)
  const fullSlug = words.slice(0, 4).join('-');
  candidates.add(fullSlug);
  // First 3 words
  if (words.length > 3) candidates.add(words.slice(0, 3).join('-'));
  // First 2 words
  if (words.length > 2) candidates.add(words.slice(0, 2).join('-'));
  // First word (if >= 4 chars)
  if (words[0]?.length >= 4) candidates.add(words[0]);

  const tlds = ['.de', '.com', '.de'];
  const probes = [];
  for (const slug of candidates) {
    probes.push('https://www.' + slug + '.de');
    probes.push('https://' + slug + '.de');
    if (slug.length <= 12) probes.push('https://www.' + slug + '.com');
  }

  // Validate that a URL's content actually belongs to this company
  const validateDomain = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      const text = (await r.text()).toLowerCase();
      // Check that page mentions key words from company name
      const hit = keywords.some(k => text.includes(k));
      if (hit) {
        const finalHost = new URL(r.url || url).hostname;
        return 'https://' + finalHost;
      }
      return null;
    } catch { clearTimeout(timer); return null; }
  };

  // Keywords from normalized name for validation
  const keywords = norm.split('-').filter(w => w.length > 4);

  // Try candidates from most specific to least specific (sequentially with early exit)
  const uniqueProbes = [...new Set(probes)];
  for (const url of uniqueProbes) {
    const result = await validateDomain(url);
    if (result) {
      console.log('domain probe found:', result, 'for', companyName);
      return result;
    }
  }
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
    return all.find(e => HR_EMAIL.test(e)) || all.find(e => !GENERIC.test(e)) || all[0];
  }

  function upgradeEmail(current, candidate) {
    if (!candidate) return current;
    if (!current) return candidate;
    if (HR_EMAIL.test(candidate) && !HR_EMAIL.test(current)) return candidate;
    if (!GENERIC.test(candidate) && GENERIC.test(current)) return candidate;
    return current;
  }

  function bestPhone(text) {
    const m = text.match(/(?:Tel(?:efon|\.)?|Fon|\+49|Mobil)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  }

  const BLACKLIST = new Set([
    'Downloads','Karriere','Jobs','Kontakt','Impressum','Datenschutz','Login',
    'Home','News','Service','Produkte','Ausbildung','Bewerbung','Team','Info',
    'Unternehmen','Leistungen','Referenzen','Partner','Blog','Presse','Stellenangebote',
    'Landkreis','Kreis','Stadt','Gemeinde','Bundesland','Bezirk','Region',
    'Amtsgericht','Handelsregister','Deutschland','Germany','Bayern','Berlin',
    'Hamburg','München','Frankfurt','Köln','Stuttgart','Hannover','Düsseldorf',
    'Krefeld','Dortmund','Dresden','Leipzig','Bremen','Essen','Duisburg',
    'Der','Die','Das','Den','Dem','Ein','Eine','Ihr','Ihre','Unser','Unsere',
    'GmbH','AG','KG','SE','OHG','UG','Dienstleistungen','Management',
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      return stripHtml(await r.text());
    } catch { clearTimeout(timer); return null; }
  };

  let bestEmailFound = null;
  let bestPhoneFound = null;

  // ── Priority 0: jobText (Stellenanzeige text) ────────────────────────────
  if (jobText) {
    const jt = decodeURIComponent(jobText).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    bestEmailFound = upgradeEmail(bestEmailFound, bestEmail(jt));
    bestPhoneFound = bestPhone(jt);

    // HR pattern
    const hr = extractHR(jt);
    if (hr) {
      return res.status(200).json({
        firstName: hr.firstName, lastName: hr.lastName,
        email: bestEmailFound, phone: bestPhoneFound,
        position: getHRPosition(jt), source: 'stellenanzeige', website: website || null,
      });
    }
    // Direct name patterns in job ads
    for (const p of [
      /(?:Ansprechpartner(?:in)?|Ihr Kontakt|Kontakt)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/i,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s*(?:ist Ihr|steht Ihnen|freut sich|beantwortet Ihre)/i,
    ]) {
      const m = jt.match(p);
      if (m && isRealName(m[1], m[2])) {
        return res.status(200).json({
          firstName: m[1], lastName: m[2],
          email: bestEmailFound, phone: bestPhoneFound,
          position: 'Ansprechpartner/in', source: 'stellenanzeige', website: website || null,
        });
      }
    }
  }

  // ── Priority 1: Known website ────────────────────────────────────────────
  let base = null;
  if (website) {
    base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://' + website;
  }

  // ── Priority 2: DuckDuckGo website lookup ────────────────────────────────
  if (!base) {
    base = await findWebsiteByProbing(name);
  }

  // No website found at all → return email if any
  console.log('find-contact: base=', base, 'name=', name);
  if (!base) {
    if (bestEmailFound) return res.status(200).json({ ...empty, email: bestEmailFound, phone: bestPhoneFound });
    return res.status(200).json(empty);
  }

  // ── Priority 3: Scrape known website ────────────────────────────────────
  const pages = [
    { url: base + '/impressum',    type: 'impressum' },
    { url: base + '/karriere',     type: 'career' },
    { url: base + '/kontakt',      type: 'contact' },
    { url: base + '/jobs',         type: 'career' },
    { url: base,                   type: 'home' },
  ];

  const pageResults = await Promise.all(
    pages.map(p => fetchPage(p.url).then(text => ({ ...p, text })))
  );

  let ceoContact = null;
  let ceoSource = null;

  for (const page of pageResults) {
    const text = page.text;
    if (!text) continue;
    const em = bestEmail(text);
    const ph = bestPhone(text);
    bestEmailFound = upgradeEmail(bestEmailFound, em);
    if (ph && !bestPhoneFound) bestPhoneFound = ph;

    const hr = extractHR(text);
    if (hr) {
      return res.status(200).json({
        firstName: hr.firstName, lastName: hr.lastName,
        email: bestEmailFound || em, phone: bestPhoneFound || ph,
        position: getHRPosition(text), source: page.url.replace(base,'') || 'homepage',
        website: base,
      });
    }
    if (!ceoContact) {
      const ceo = extractCEO(text);
      if (ceo) { ceoContact = ceo; ceoSource = page.url.replace(base,'') || 'homepage'; }
    }
  }

  if (ceoContact) {
    return res.status(200).json({
      firstName: ceoContact.firstName, lastName: ceoContact.lastName,
      email: bestEmailFound, phone: bestPhoneFound,
      position: 'Geschäftsführer/in', source: ceoSource, website: base,
    });
  }

  if (bestEmailFound) {
    return res.status(200).json({ ...empty, email: bestEmailFound, phone: bestPhoneFound, website: base });
  }

  return res.status(200).json(empty);
}
