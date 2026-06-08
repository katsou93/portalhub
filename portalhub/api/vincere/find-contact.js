// find-contact.js — reliable contact finder
// Priority: 1) jobText  2) BA kontaktAngaben  3) Website HR page  4) Impressum CEO  5) constructed HR email
// NEVER invent names. Only real people from real sources. CEO from Impressum is always valid fallback.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────

function normCompany(name) {
    return name.toLowerCase()
      .replace(/\bgmbh\s*&\s*co\.?\s*kg\b|\bgmbh\s*&\s*co\b|\bgmbh\b|\bag\b|\bse\b|\bkg\b|\be\.v\.\b|\bohg\b|\bug\b|\bgrp\b|\bgroup\b/gi, '')
      .replace(/niederlassung\s+\w+/gi, '')
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,'-').replace(/^-+|-+$/g,'');
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }

function stripHtml(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<[^>]+>/g,' ')
      .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/\s+/g,' ').trim();
}

const HR_EMAIL   = /(?:bewerbung|hr|personal|karriere|recruiting|jobs|talent|bewerb)@/i;
const SKIP_EMAIL = /^(noreply|no-reply|donotreply|bounce|mailer-daemon|postmaster)@/i;
const GENERIC    = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb|anfrage|sekretariat)@/i;

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
    const m1 = text.match(/(?:Tel(?:efon|\.)?|Fon|Phone|Mobil)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i);
    if (m1) return m1[1].trim().replace(/\s+/g,' ');
    const m2 = text.match(/(?:^|\s)((?:\+49|0)[\d\s()\-\/]{8,18})(?:\s|$)/m);
    if (m2) return m2[1].trim().replace(/\s+/g,' ');
    return null;
}

const BLACKLIST = new Set([
    'Engineering','Software','Solutions','Systems','Services','Technologies','Consulting',
    'Business','International','Industrial','Technical','Digital','Applications','Products',
    'Operations','Innovation','Automation','Division','Manufacturing','Mechanical','Electrical',
    'Electronic','Management','Development','Research','Design','Quality','Production',
    'Gmbh','Gruppe','Group','Holding','Corporate','Headquarter',
    'Lesen','Schreiben','Suchen','Finden','Mehr','Alle','Hier','Unsere','Unseren',
    'Ihrem','Ihrer','Seinen','Seiner','Werden','Haben','Durch','Unter','Ihrer',
    'Kontakt','Karriere','Bewerbung','Impressum','Datenschutz','Stellenangebote',
  ]);

function isRealName(fn, ln) {
    if (!fn || !ln) return false;
    if (fn.length < 2 || ln.length < 2) return false;
    if (BLACKLIST.has(fn) || BLACKLIST.has(ln)) return false;
    if (!/^[A-ZÄÖÜ]/.test(fn) || !/^[A-ZÄÖÜ]/.test(ln)) return false;
    if (/\d/.test(fn) || /\d/.test(ln)) return false;
    if (fn.length > 20 || ln.length > 30) return false;
    return true;
}

function getHRPosition(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('personal') || t.includes('hr ') || t.includes('human')) return 'HR Manager/in';
    if (t.includes('recruit')) return 'Recruiter/in';
    if (t.includes('talent')) return 'Talent Acquisition';
    if (t.includes('bewerbung')) return 'Bewerbungsmanagement';
    if (t.includes('leiter') || t.includes('leiterin')) return 'Personalleiter/in';
    return 'HR Ansprechpartner/in';
}

// ── Google website finder ─────────────────────────────────────────────────
async function findWebsiteViaGoogle(companyName, city) {
    try {
          const query = encodeURIComponent(`"${companyName}" ${city || ''} Impressum site:.de OR site:.com`);
          const googleUrl = `https://www.google.com/search?q=${query}&num=5&hl=de`;
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 5000);
          const r = await fetch(googleUrl, {
                  headers: {
                            'User-Agent': UA,
                            'Accept': 'text/html',
                            'Accept-Language': 'de-DE,de;q=0.9',
                  },
                  signal: ctrl.signal,
                  redirect: 'follow',
          });
          if (!r.ok) return null;
          const html = await r.text();
          // Extract first result URLs from Google
      const urlMatches = [...html.matchAll(/href="(https?:\/\/(?!(?:www\.)?google)[^"&]+)"/g)];
          const norm = normCompany(companyName);
          const words = norm.split('-').filter(w => w.length > 2);
          for (const m of urlMatches) {
                  try {
                            const u = new URL(m[1]);
                            const host = u.hostname.toLowerCase().replace(/^www\./, '');
                            // Check if domain plausibly matches company name
                    const hostNorm = host.replace(/\./g, '').replace(/-/g, '');
                            const match = words.some(w => w.length > 3 && hostNorm.includes(w));
                            if (match) {
                                        return 'https://' + u.hostname;
                            }
                  } catch(_) {}
          }
          return null;
    } catch(e) {
          console.log('Google lookup failed:', e.message);
          return null;
    }
}

// ── Domain probing (fallback if Google fails) ─────────────────────────────
async function findWebsiteByProbing(companyName, city) {
    const norm = normCompany(companyName);
    const words = norm.split('-').filter(w => w.length > 0);
    if (!words.length) return null;

  const slugs = new Set();
    slugs.add(words.slice(0,4).join('-'));
    if (words.length > 2) slugs.add(words.slice(0,3).join('-'));
    if (words.length > 1) slugs.add(words.slice(0,2).join('-'));
    slugs.add(words[0]);
    if (words[0]?.length <= 5) {
          for (const sfx of ['-gmbh','-group','-solutions','-systems','-tech','-service','-gruppe']) {
                  slugs.add(words[0] + sfx);
          }
    }

  const probes = [];
    for (const slug of slugs) {
          probes.push('https://www.' + slug + '.de');
          probes.push('https://' + slug + '.de');
          probes.push('https://www.' + slug + '.com');
    }

  const validate = async (url) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        try {
                const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
                clearTimeout(t);
                if (!r.ok) return null;
                const text = (await r.text()).toLowerCase();
                const allKW = norm.split('-').filter(w => w.length > 3);
                const hit = allKW.length > 0 ? allKW.some(k => text.includes(k)) : true;
                if (!hit) return null;
                return 'https://' + new URL(r.url || url).hostname;
        } catch { clearTimeout(t); return null; }
  };

  const results = await Promise.all([...new Set(probes)].map(validate));
    for (const r of results) { if (r) return r; }
    return null;
}

// ── Combined website finder: Google first, probe as fallback ──────────────
async function findWebsite(companyName, city) {
    // Try Google first — most reliable
  const googleResult = await findWebsiteViaGoogle(companyName, city);
    if (googleResult) { console.log('Website via Google:', googleResult); return googleResult; }
    // Fallback: blind domain probing
  const probedResult = await findWebsiteByProbing(companyName, city);
    if (probedResult) { console.log('Website via probing:', probedResult); return probedResult; }
    return null;
}

// ── Page fetcher ──────────────────────────────────────────────────────────
async function fetchPage(url, timeout = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
          const r = await fetch(url, {
                  headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' },
                  redirect: 'follow', signal: ctrl.signal,
          });
          clearTimeout(t);
          if (!r.ok) return null;
          const html = await r.text();
          return { url: r.url || url, text: stripHtml(html), html };
    } catch { clearTimeout(t); return null; }
}

// ── HR contact extractor ──────────────────────────────────────────────────
function extractHR(text) {
    const patterns = [
          /(?:Ansprechpartner(?:in)?|HR|Personalreferent(?:in)?|Recruiter(?:in)?|Recruiting)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
          /(?:Frau|Herr)\s+([A-ZÄÖÜ]\.?\s*[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
          /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})\s*[,\-–]\s*(?:Personal|HR|Recruiting|Talent)/,
        ];
    for (const p of patterns) {
          const m = text.match(p);
          if (m) {
                  let fn = cap(m[1].replace(/\.$/, '').trim());
                  let ln = cap(m[2].trim());
                  // Handle "M. Hofmann" style → use initial as firstName
            if (/^[A-Z]\.$/.test(m[1].trim())) { fn = m[1].trim(); }
                  if (isRealName(fn, ln)) {
                            const pos = getHRPosition(m[0]);
                            return { firstName: fn, lastName: ln, position: pos };
                  }
          }
    }
    return null;
}

// ── CEO/GF extractor from Impressum ──────────────────────────────────────
function extractCEO(text) {
    const patterns = [
          // "Geschäftsführer: Max Mustermann" or "Geschäftsführerin: Maria Muster"
          /(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|Vorstand|CEO|Managing Director|Leitung)[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
          // "vertreten durch Max Mustermann"
          /vertreten\s+durch[:\s]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/i,
          // "Dipl.-Ing. Max Mustermann, Geschäftsführer"
          /(?:Dipl\.|Dr\.|Prof\.|Ing\.)[\s\-\w\.]*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})[,\s]+(?:Geschäftsführer|Inhaber|Vorstand)/i,
          // "M. Mustermann, Geschäftsführer" (initial style)
          /([A-Z]\.\s*[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})[,\s]+(?:Geschäftsführer|Inhaber|CEO)/i,
        ];
    for (const p of patterns) {
          const m = text.match(p);
          if (m) {
                  const fn = (m[1] || '').trim();
                  const ln = (m[2] || '').trim();
                  if (fn && ln && isRealName(cap(fn), cap(ln))) {
                            return { firstName: cap(fn), lastName: cap(ln), position: 'Geschäftsführer/in' };
                  }
                  // Handle single-match patterns (e.g. "M. Mustermann")
            if (fn && !ln) {
                      const parts = fn.split(/\s+/);
                      if (parts.length >= 2) {
                                  return { firstName: parts[0], lastName: parts.slice(1).join(' '), position: 'Geschäftsführer/in' };
                      }
            }
          }
    }
    return null;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, city, website, jobText, externeUrl } = req.query;
    if (!name) return res.status(400).json({ error: 'name required' });

  const empty = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null };

  // ── Priority 1: jobText (Stellenbeschreibung von BA) ─────────────────
  if (jobText) {
        const jt = decodeURIComponent(jobText);
        const hrFromJob = extractHR(jt);
        if (hrFromJob) {
                const email = bestEmail(jt);
                const phone = bestPhone(jt);
                return res.status(200).json({
                          ...hrFromJob, email, phone, source: 'jobtext', website: website || null,
                });
        }
        // Email in jobText (HR-style preferred)
      const emailFromJob = bestEmail(jt);
        if (emailFromJob && HR_EMAIL.test(emailFromJob)) {
                return res.status(200).json({
                          ...empty, email: emailFromJob, phone: bestPhone(jt),
                          position: 'HR Bewerbungskontakt', source: 'jobtext_email', website: website || null,
                });
        }
  }

  // ── Priority 2: externeUrl (job posted on company website) ───────────
  let extUrlDecoded = null;
    if (externeUrl) {
          try { extUrlDecoded = decodeURIComponent(externeUrl); } catch(_) {}
    }
    if (extUrlDecoded) {
          const extPage = await fetchPage(extUrlDecoded);
          if (extPage) {
                  const hr = extractHR(extPage.text);
                  const email = bestEmail(extPage.text);
                  const phone = bestPhone(extPage.text);
                  if (hr || (email && HR_EMAIL.test(email))) {
                            return res.status(200).json({
                                        ...(hr || empty), email: hr ? (email || null) : email,
                                        phone, source: 'externe_url', website: website || null,
                            });
                  }
          }
    }

  // ── Find website if not provided ──────────────────────────────────────
  let base = null;
    if (website) {
          base = website.startsWith('http') ? website.replace(/\/+$/, '') : 'https://' + website;
    } else {
          base = await findWebsite(name, city);
    }

  if (!base) {
        // No website found at all — construct HR email as last resort
      console.log('No website found for:', name);
        return res.status(200).json({ ...empty, source: 'no_website' });
  }

  console.log('Using website:', base);

  // ── Priority 3: Scrape HR pages in parallel ───────────────────────────
  const pages = [
    { url: base + '/karriere',          type: 'career'  },
    { url: base + '/jobs',              type: 'career'  },
    { url: base + '/stellenangebote',   type: 'career'  },
    { url: base + '/career',            type: 'career'  },
    { url: base + '/kontakt',           type: 'contact' },
    { url: base + '/ueber-uns',         type: 'about'   },
    { url: base + '/team',              type: 'about'   },
    { url: base,                        type: 'home'    },
        // Impressum always — CEO lives here
    { url: base + '/impressum',         type: 'impressum' },
    { url: base + '/legal/impressum',   type: 'impressum' },
    { url: base + '/de/impressum',      type: 'impressum' },
        ...(extUrlDecoded ? [{ url: extUrlDecoded, type: 'extern' }] : []),
      ];

  const results = await Promise.all(pages.map(p => fetchPage(p.url).then(r => r ? { ...p, ...r } : null)));

  let bestEmailFound = null;
    let bestPhoneFound = null;
    let hrContact = null;
    let ceoContact = null;

  // First pass: look for HR contact on career/contact/about pages
  for (const page of results) {
        if (!page) continue;
        const em = bestEmail(page.text);
        const ph = bestPhone(page.text);
        bestEmailFound = upgradeEmail(bestEmailFound, em);
        if (ph && !bestPhoneFound) bestPhoneFound = ph;

      // HR contact (highest priority on non-impressum pages)
      if (!hrContact && page.type !== 'impressum') {
              hrContact = extractHR(page.text);
              if (hrContact) {
                        hrContact.email = hrContact.email || em;
                        hrContact.phone = hrContact.phone || ph;
                        hrContact.source = 'website_hr_' + page.type;
                        hrContact.website = base;
                        console.log('HR contact found on', page.type, ':', hrContact.firstName, hrContact.lastName);
              }
      }

      // CEO from impressum (fallback priority)
      if (!ceoContact && page.type === 'impressum') {
              ceoContact = extractCEO(page.text);
              if (ceoContact) {
                        ceoContact.email = ceoContact.email || em || null;
                        ceoContact.phone = ceoContact.phone || ph || null;
                        ceoContact.source = 'impressum_ceo';
                        ceoContact.website = base;
                        console.log('CEO found in impressum:', ceoContact.firstName, ceoContact.lastName);
              }
      }
  }

  // Return in priority order
  if (hrContact) return res.status(200).json(hrContact);
    if (ceoContact) return res.status(200).json(ceoContact);

  // ── Priority 4: HR email fallback ─────────────────────────────────────
  if (bestEmailFound) {
        const isHR = HR_EMAIL.test(bestEmailFound);
        return res.status(200).json({
                ...empty,
                firstName: isHR ? 'Bewerbung' : 'Personalabteilung',
                lastName: name.split(' ')[0],
                email: bestEmailFound,
                phone: bestPhoneFound,
                position: isHR ? 'HR Bewerbungskontakt' : 'Ansprechpartner/in',
                source: 'email_fallback',
                website: base,
        });
  }

  // ── Priority 5: Construct likely HR email from domain ─────────────────
  try {
        const domain = new URL(base).hostname.replace(/^www\./, '');
        const constructedEmail = `bewerbung@${domain}`;
        return res.status(200).json({
                ...empty,
                firstName: 'Bewerbung',
                lastName: name.split(' ')[0],
                email: constructedEmail,
                position: 'HR Bewerbungskontakt',
                source: 'constructed_email',
                website: base,
        });
  } catch(_) {}

  return res.status(200).json({ ...empty, website: base, source: 'no_contact_found' });
}
