// find-contact.js — reliable contact finder
// Priority: 1) jobText  2) Website (if known)  3) DuckDuckGo → Website  4) null
// NEVER invent contacts. Only real people from real sources.

// ── DuckDuckGo: find company website ───────────────────────────────────────
async function findWebsiteViaDDG(companyName) {
  try {
    const query = '"' + companyName + '" Impressum';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let r;
    try {
      r = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://duckduckgo.com',
          'Referer': 'https://duckduckgo.com/',
        },
        body: 'q=' + encodeURIComponent(query) + '&kl=de-de',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!r || !r.ok) return null;
    const html = await r.text();
    if (html.length < 500) return null;

    // DDG HTML 4.01 format: URLs in uddg= param OR in href of result links
    const candidates = new Set();

    // Pattern 1: uddg= encoded URLs
    for (const m of html.matchAll(/uddg=([^"&\s]+)/g)) {
      try { candidates.add(decodeURIComponent(m[1])); } catch {}
    }
    // Pattern 2: result__url or result__a links
    for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      candidates.add(m[1]);
    }
    // Pattern 3: result snippet URLs (text that looks like domain)
    for (const m of html.matchAll(/class="result__url[^>]*>([^<]+)</g)) {
      const u = m[1].trim();
      if (u && !u.includes(' ')) candidates.add('https://' + u.replace(/^https?:\/\//, ''));
    }

    // Keywords from company name (without legal suffix)
    // Normalize umlauts so "frischgeflügel" matches "frischgefluegel"
    const normalizeUmlauts = s => s
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
    const keywords = normalizeUmlauts(companyName.toLowerCase())
      .replace(/gmbh\s*&\s*co\.?\s*kg|gmbh\s*&\s*co|gmbh|grp\.|group|\bag\b|\bse\b|\bkg\b|e\.v\.|ohg|\bug\b/gi, '')
      .replace(/[^a-z0-9]/g, ' ').trim()
      .split(/\s+/).filter(w => w.length > 3);

    const SKIP = /linkedin|xing|facebook|instagram|kununu|stepstone|indeed|monster|arbeitsagentur|wikipedia|youtube|twitter|tiktok|google\.com|bing\.com|yahoo|wlw\.de|firmenwissen|northdata|handelsregister|opencorporates|dnb\.com|duckduckgo|amazon|ebay/i;

    const urlArr = Array.from(candidates).filter(u => {
      try { return u.startsWith('http'); } catch { return false; }
    });

    // 1st pass: keyword match
    for (const u of urlArr) {
      try {
        const host = new URL(u).hostname.replace(/^www\./, '');
        if (SKIP.test(host)) continue;
        const parts = host.split(/[.\-]/);
        if (keywords.some(k => parts.some(p => p.includes(k) || k.includes(p)))) {
          return 'https://www.' + new URL(u).hostname.replace(/^www\./, '');
        }
      } catch {}
    }
    // 2nd pass: first non-skipped result
    for (const u of urlArr) {
      try {
        const host = new URL(u).hostname;
        if (!SKIP.test(host)) {
          return 'https://www.' + host.replace(/^www\./, '');
        }
      } catch {}
    }
    return null;
  } catch (e) {
    console.log('DDG error:', e.message);
    return null;
  }
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
    base = await findWebsiteViaDDG(name);
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
