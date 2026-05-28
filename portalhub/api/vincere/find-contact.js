// find-contact.js — reliable contact finder
// Priority: 1) jobText  2) Website (if known)  3) Domain probing  4) null
// NEVER invent contacts. Only real people from real sources.

// ── Domain prober ─────────────────────────────────────────────────────────
async function findWebsiteByProbing(companyName, city) {
  const norm = companyName.toLowerCase()
    .replace(/\bgmbh\s*&\s*co\.?\s*kg\b|\bgmbh\s*&\s*co\b|\bgmbh\b|\bgrp\.\b|\bgroup\b|\bag\b|\bse\b|\bkg\b|\be\.v\.\b|\bohg\b|\bug\b/gi, '')
    .replace(/niederlassung\s+\w+/gi, '')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');

  const words = norm.split('-').filter(w => w.length > 0);
  if (!words.length) return null;

  // Validation keywords: company name words > 4 chars + city
  const nameKeywords = words.filter(w => w.length > 4);
  const cityNorm = city ? city.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]/g,' ').trim() : '';

  // Build candidate slugs from most to least specific
  const slugs = new Set();
  slugs.add(words.slice(0,4).join('-'));
  if (words.length > 3) slugs.add(words.slice(0,3).join('-'));
  if (words.length > 2) slugs.add(words.slice(0,2).join('-'));
  if (words[0]?.length >= 3) slugs.add(words[0]);

  const probes = [];
  for (const slug of slugs) {
    probes.push('https://www.' + slug + '.de');
    probes.push('https://' + slug + '.de');
  }

  // Validate domain: content must mention company keywords AND optionally city
  const validate = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow', signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) return null;
      const text = (await r.text()).toLowerCase();
      // Must mention ALL name keywords (avoid false positives)
      const nameMatch = nameKeywords.every(k => text.includes(k));
      // Bonus: also check city
      const cityMatch = cityNorm && cityNorm.length > 3 ? text.includes(cityNorm) : true;
      if (nameMatch && cityMatch) return 'https://' + new URL(r.url || url).hostname;
      if (nameMatch && !cityNorm) return 'https://' + new URL(r.url || url).hostname;
      return null;
    } catch { clearTimeout(t); return null; }
  };

  // Try sequentially from most specific to least
  for (const url of [...new Set(probes)]) {
    const result = await validate(url);
    if (result) { console.log('probe found:', result); return result; }
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, city, website, jobText } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });

  const empty = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null };

  const HR_EMAIL   = /(?:bewerbung|hr|personal|karriere|recruiting|jobs|talent)@/i;
  const SKIP_EMAIL = /^(noreply|no-reply|donotreply|bounce|mailer-daemon)@/i;
  const GENERIC    = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb)@/i;

  function bestEmail(text) {
    const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
      .map(m => m[0]).filter(e => !SKIP_EMAIL.test(e));
    if (!all.length) return null;
    return all.find(e => HR_EMAIL.test(e)) || all.find(e => !GENERIC.test(e)) || all[0];
  }

  function upgradeEmail(cur, cand) {
    if (!cand) return cur;
    if (!cur) return cand;
    if (HR_EMAIL.test(cand) && !HR_EMAIL.test(cur)) return cand;
    if (!GENERIC.test(cand) && GENERIC.test(cur)) return cand;
    return cur;
  }

  function bestPhone(text) {
    const m = text.match(/(?:Tel(?:efon|\.|)?|Fon|\+49|Mobil)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i);
    return m ? m[1].trim().replace(/\s+/g,' ') : null;
  }

  const BLACKLIST = new Set([
    'Downloads','Karriere','Jobs','Kontakt','Impressum','Datenschutz','Login',
    'Home','News','Service','Produkte','Ausbildung','Bewerbung','Team','Info',
    'Unternehmen','Leistungen','Referenzen','Partner','Blog','Presse','Stellenangebote',
    'Landkreis','Kreis','Stadt','Gemeinde','Bundesland','Bezirk','Region',
    'Amtsgericht','Handelsregister','Deutschland','Germany','Bayern','Berlin',
    'Hamburg','München','Frankfurt','Köln','Stuttgart','Hannover','Düsseldorf',
    'Der','Die','Das','Den','Dem','Ein','Eine','Ihr','Ihre',
    'GmbH','AG','KG','SE','OHG','UG','Management',
    'Vertrieb','Marketing','Personal','Recruiting','Einkauf','Buchhaltung',
    'Controlling','Produktion','Technik','Entwicklung','Forschung','Logistik',
    'Verwaltung','Sekretariat','Empfang','Assistenz','Beratung','Support',
    'Qualität','Sicherheit','Compliance','Recht','Finanzen',
    'Herr','Frau','Dr','Prof','Dipl','Ing',
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
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow', signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) return null;
      return stripHtml(await r.text());
    } catch { clearTimeout(t); return null; }
  };

  let bestEmailFound = null;
  let bestPhoneFound = null;

  // ── Priority 0: Parse jobText ─────────────────────────────────────────────
  if (jobText) {
    const jt = decodeURIComponent(jobText).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    bestEmailFound = upgradeEmail(bestEmailFound, bestEmail(jt));
    bestPhoneFound = bestPhone(jt);
    const hr = extractHR(jt);
    if (hr) return res.status(200).json({ firstName:hr.firstName, lastName:hr.lastName, email:bestEmailFound, phone:bestPhoneFound, position:getHRPosition(jt), source:'stellenanzeige', website:website||null });
    for (const p of [
      /(?:Ansprechpartner(?:in)?|Ihr Kontakt|Kontakt)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)/i,
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s*(?:ist Ihr|steht Ihnen|freut sich|beantwortet Ihre)/i,
    ]) {
      const m = jt.match(p);
      if (m && isRealName(m[1], m[2])) return res.status(200).json({ firstName:m[1], lastName:m[2], email:bestEmailFound, phone:bestPhoneFound, position:'Ansprechpartner/in', source:'stellenanzeige', website:website||null });
    }
  }

  // ── Priority 1+2: Website ──────────────────────────────────────────────────
  let base = null;
  if (website) {
    base = website.startsWith('http') ? website.replace(/\/$/, '') : 'https://' + website;
  } else {
    base = await findWebsiteByProbing(name, city);
  }

  if (!base) {
    if (bestEmailFound) return res.status(200).json({ ...empty, email:bestEmailFound, phone:bestPhoneFound });
    return res.status(200).json(empty);
  }

  // ── Priority 3: Scrape website ────────────────────────────────────────────
  const pages = [
    { url: base+'/impressum', type:'impressum' },
    { url: base+'/karriere',  type:'career' },
    { url: base+'/kontakt',   type:'contact' },
    { url: base+'/jobs',      type:'career' },
    { url: base,              type:'home' },
  ];

  const results = await Promise.all(pages.map(p => fetchPage(p.url).then(text => ({...p, text}))));

  let ceoContact = null, ceoSource = null;
  for (const page of results) {
    if (!page.text) continue;
    const em = bestEmail(page.text);
    const ph = bestPhone(page.text);
    bestEmailFound = upgradeEmail(bestEmailFound, em);
    if (ph && !bestPhoneFound) bestPhoneFound = ph;
    const hr = extractHR(page.text);
    if (hr) return res.status(200).json({ firstName:hr.firstName, lastName:hr.lastName, email:bestEmailFound||em, phone:bestPhoneFound||ph, position:getHRPosition(page.text), source:page.url.replace(base,'')||'homepage', website:base });
    if (!ceoContact) { const ceo = extractCEO(page.text); if (ceo) { ceoContact=ceo; ceoSource=page.url.replace(base,'')||'homepage'; } }
  }

  if (ceoContact) return res.status(200).json({ firstName:ceoContact.firstName, lastName:ceoContact.lastName, email:bestEmailFound, phone:bestPhoneFound, position:'Geschäftsführer/in', source:ceoSource, website:base });
  if (bestEmailFound) return res.status(200).json({ ...empty, email:bestEmailFound, phone:bestPhoneFound, website:base });
  return res.status(200).json(empty);
}
