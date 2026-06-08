// find-contact.js v4
// Priority: 1) jobText  2) externeUrl  3) Website HR  4) Impressum CEO  5) HR email fallback  6) constructed email
// CEO aus Impressum ist immer valider Fallback - "Vertreten durch" wird zuverlaessig erkannt

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────

function normCompany(name) {
        return name.toLowerCase()
          .replace(/\bgmbh\s*&\s*co\.?\s*kg\b|\bgmbh\s*&\s*co\b|\bgmbh\b|\bag\b|\bse\b|\bkg\b|\be\.v\.\b|\bohg\b|\bug\b|\bgrp\b|\bgroup\b|\bholding\b/gi, '')
          .replace(/niederlassung\s+\w+/gi, '')
          .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
          .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,'-').replace(/^-+|-+$/g,'');
}

// Normalize keeping umlauts as-is for domain slug variants
function normCompanyRaw(name) {
        return name.toLowerCase()
          .replace(/\bgmbh\s*&\s*co\.?\s*kg\b|\bgmbh\s*&\s*co\b|\bgmbh\b|\bag\b|\bse\b|\bkg\b|\be\.v\.\b|\bohg\b|\bug\b|\bgrp\b|\bgroup\b/gi, '')
          .replace(/niederlassung\s+\w+/gi, '')
          .replace(/[^a-zäöüß0-9\s]/g,' ').replace(/\s+/g,'-').replace(/^-+|-+$/g,'');
}

function cap(s) {
        if (!s) return '';
        return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

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
const GENERIC    = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb|anfrage|sekretariat|presse|media)@/i;

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
        'Gmbh','Gruppe','Group','Holding','Corporate',
        'Lesen','Schreiben','Suchen','Finden','Mehr','Alle','Hier','Unsere','Unseren',
        'Kontakt','Karriere','Bewerbung','Impressum','Datenschutz','Stellenangebote','Leistungen',
        'Ueber','Unternehmen','Standorte','Aktuelles','Produkte','Loesungen',
      ]);

function isRealName(fn, ln) {
        if (!fn || !ln) return false;
        if (fn.length < 2 || ln.length < 2) return false;
        if (BLACKLIST.has(fn) || BLACKLIST.has(ln)) return false;
        if (!/^[A-ZÄÖÜ]/.test(fn) || !/^[A-ZÄÖÜ]/.test(ln)) return false;
        if (/\d/.test(fn) || /\d/.test(ln)) return false;
        if (fn.length > 20 || ln.length > 35) return false;
        return true;
}

function getHRPosition(ctx) {
        const t = (ctx || '').toLowerCase();
        if (t.includes('personalleiter') || t.includes('leiterin personal')) return 'Personalleiter/in';
        if (t.includes('personal') || t.includes('human resources')) return 'HR Manager/in';
        if (t.includes('recruit')) return 'Recruiter/in';
        if (t.includes('talent')) return 'Talent Acquisition';
        return 'HR Ansprechpartner/in';
}

// ── Google website finder ─────────────────────────────────────────────────
async function findWebsiteViaGoogle(companyName, city) {
        try {
                  const q = encodeURIComponent(`"${companyName}" ${city || ''} Impressum`);
                  const ctrl = new AbortController();
                  setTimeout(() => ctrl.abort(), 6000);
                  const r = await fetch(`https://www.google.com/search?q=${q}&num=8&hl=de&gl=de`, {
                              headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' },
                              signal: ctrl.signal, redirect: 'follow',
                  });
                  if (!r.ok) return null;
                  const html = await r.text();
                  const norm = normCompany(companyName);
                  const words = norm.split('-').filter(w => w.length > 2);
                  // Extract all href URLs from Google result
          const urlRe = /href="(https?:\/\/(?!(?:www\.)?google)[^"&]{10,})"/g;
                  let m;
                  const seen = new Set();
                  const deFirst = []; // .de domains prioritized
          const others = [];
                  while ((m = urlRe.exec(html)) !== null) {
                              try {
                                            const u = new URL(m[1]);
                                            const host = u.hostname.toLowerCase().replace(/^www\./,'');
                                            if (seen.has(host)) continue;
                                            seen.add(host);
                                            // Skip irrelevant domains
                                if (/google|facebook|linkedin|xing|instagram|twitter|youtube|wikipedia|kununu|stepstone|indeed|monster|arbeitsagentur/.test(host)) continue;
                                            const hostClean = host.replace(/[\.\-]/g,'');
                                            const match = words.some(w => w.length > 3 && hostClean.includes(w));
                                            if (!match) continue;
                                            const base = 'https://' + u.hostname;
                                            if (host.endsWith('.de')) deFirst.push(base);
                                            else others.push(base);
                              } catch(_) {}
                  }
                  // Return .de domain first, then others
          const result = [...deFirst, ...others][0] || null;
                  if (result) console.log('Website via Google:', result);
                  return result;
        } catch(e) {
                  console.log('Google lookup failed:', e.message);
                  return null;
        }
}

// ── Domain probing fallback ───────────────────────────────────────────────
async function findWebsiteByProbing(companyName, city) {
        const norm = normCompany(companyName);
        const normRaw = normCompanyRaw(companyName); // keeps umlauts
  const words = norm.split('-').filter(w => w.length > 0);
        const wordsRaw = normRaw.split('-').filter(w => w.length > 0);
        if (!words.length) return null;

  const slugs = new Set();
        // Standard normalized slugs
  slugs.add(words.slice(0,4).join('-'));
        if (words.length > 2) slugs.add(words.slice(0,3).join('-'));
        if (words.length > 1) slugs.add(words.slice(0,2).join('-'));
        slugs.add(words[0]);
        // Raw umlaut slugs (weidmueller -> weidmueller already, but raw keeps ü for domain)
  // e.g. "weidmüller" -> try "weidmueller" via normCompany but also raw
  if (wordsRaw[0] !== words[0]) {
            slugs.add(wordsRaw.slice(0,2).join('-'));
            slugs.add(wordsRaw[0]);
  }
        // Acronym suffixes
  if (words[0]?.length <= 6) {
            for (const sfx of ['-gmbh','-group','-solutions','-systems','-tech','-service','-gruppe','-kg']) {
                        slugs.add(words[0] + sfx);
            }
  }

  const probes = [];
        for (const slug of slugs) {
                  probes.push('https://www.' + slug + '.de'); // .de first always
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
                        const kws = norm.split('-').filter(w => w.length > 3);
                        if (kws.length > 0 && !kws.some(k => text.includes(k))) return null;
                        // Prefer .de - return with priority flag
              const finalHost = 'https://' + new URL(r.url || url).hostname;
                        return { url: finalHost, isDE: finalHost.includes('.de') };
            } catch { clearTimeout(t); return null; }
  };

  const results = (await Promise.all([...new Set(probes)].map(validate))).filter(Boolean);
        // .de first
  const de = results.find(r => r.isDE);
        const any = results[0];
        const winner = de || any;
        if (winner) { console.log('Website via probing:', winner.url); return winner.url; }
        return null;
}

// ── Combined website finder ───────────────────────────────────────────────
async function findWebsite(companyName, city) {
        const [googleResult, probedResult] = await Promise.all([
                  findWebsiteViaGoogle(companyName, city),
                  findWebsiteByProbing(companyName, city),
                ]);
        // Prefer .de over .com even if Google found a .com
  if (googleResult && probedResult) {
            if (googleResult.includes('.de') || !probedResult.includes('.de')) return googleResult;
            return probedResult; // probed found .de, google found .com
  }
        return googleResult || probedResult || null;
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
                  /(?:Ansprechpartner(?:in)?|HR|Personalreferent(?:in)?|Recruiter(?:in)?|Personalmanager(?:in)?)[\s:]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
                  /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})[,\s]*[-–]\s*(?:Personal|HR|Recruiting|Talent|Bewerbung)/,
                  /(?:Frau|Herr)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})\s*(?:steht|freut|hilft|beantwortet)/i,
                ];
        for (const p of patterns) {
                  const m = text.match(p);
                  if (!m) continue;
                  const fn = cap(m[1]);
                  const ln = cap(m[2]);
                  if (isRealName(fn, ln)) {
                              return { firstName: fn, lastName: ln, position: getHRPosition(m[0]) };
                  }
        }
        return null;
}

// ── CEO/GF extractor — robust for Impressum ──────────────────────────────
function extractCEO(rawHtml) { {
        // Normalize whitespace
  const t = rawHtml.replace(/\s+/g, ' ');
        const patterns = [
                  // "Geschäftsführer: Max Mustermann" or "Geschäftsführerin: Maria Muster"
                  /(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|Vorstand(?:svorsitzende[r]?)?|CEO|Direktor(?:in)?)[\s:,]+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,35})/,
                  // "vertreten durch Max Mustermann" — most reliable pattern in German Impressum
                  /vertreten\s+durch[\s:]+(?:(?:Dipl|Dr|Prof|Ing)[\s\.\-\w]*)?\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,35})/i,
                  // "Max Mustermann, Geschäftsführer"
                  /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,35})\s*[,\-–]\s*(?:Geschäftsführer|Inhaber|CEO|Vorstand)/i,
                  // "Dipl.-Ing. Max Mustermann"
                  /(?:Dipl\.?[\s\-]\w+\.?|Dr\.?|Prof\.?)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,35})/,
                  // "M. Mustermann, Geschäftsführer" — initial style
                  /([A-ZÄÖÜ]\.\s*)([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{2,35})[,\s]+(?:Geschäftsführer|Inhaber|CEO)/i,
                ];

  for (const p of patterns) {
            const m = t.match(p);
            if (!m) continue;
            let fn = (m[1] || '').trim();
            let ln = (m[2] || '').trim();
            // Initial style: "M." → keep as-is for firstName
          if (/^[A-Z]\.$/.test(fn)) {
                      if (isRealName('Max', cap(ln))) { // ln is valid name
                        return { firstName: fn, lastName: cap(ln), position: 'Geschäftsführer/in' };
                      }
                      continue;
          }
            fn = cap(fn); ln = cap(ln);
            if (isRealName(fn, ln)) {
                        console.log('CEO found:', fn, ln);
                        return { firstName: fn, lastName: ln, position: 'Geschäftsführer/in' };
            }
  }

  // Last resort: scan entire impressum text for name near GF keywords
  const gfBlock = t.match(/(?:Geschäftsführung|Vertretungsberechtigte[r]?|Verantwortlich)[^.]{0,200}/i);
        if (gfBlock) {
                  const nameM = gfBlock[0].match(/([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{2,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{2,35})/);
                  if (nameM) {
                              const fn = cap(nameM[1]); const ln = cap(nameM[2]);
                              if (isRealName(fn, ln)) {
                                            console.log('CEO found (block scan):', fn, ln);
                                            return { firstName: fn, lastName: ln, position: 'Geschäftsführer/in' };
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

  // ── Priority 1: jobText ───────────────────────────────────────────────
  if (jobText) {
            const jt = decodeURIComponent(jobText);
            const hr = extractHR(jt);
            if (hr) {
                        return res.status(200).json({ ...hr, email: bestEmail(jt), phone: bestPhone(jt), source: 'jobtext', website: website || null });
            }
            const emailFromJob = bestEmail(jt);
            if (emailFromJob && HR_EMAIL.test(emailFromJob)) {
                        return res.status(200).json({ ...empty, email: emailFromJob, phone: bestPhone(jt), position: 'HR Bewerbungskontakt', source: 'jobtext_email', website: website || null });
            }
  }

  // ── Priority 2: externeUrl ────────────────────────────────────────────
  let extUrlDecoded = null;
        if (externeUrl) { try { extUrlDecoded = decodeURIComponent(externeUrl); } catch(_) {} }
        if (extUrlDecoded) {
                  const extPage = await fetchPage(extUrlDecoded);
                  if (extPage) {
                              const hr = extractHR(extPage.text);
                              const em = bestEmail(extPage.text);
                              if (hr || (em && HR_EMAIL.test(em))) {
                                            return res.status(200).json({ ...(hr || empty), email: hr ? (em || null) : em, phone: bestPhone(extPage.text), source: 'externe_url', website: website || null });
                              }
                  }
        }

  // ── Find website: Google + probing run in parallel ────────────────────
  let base = null;
        if (website) {
                  base = website.startsWith('http') ? website.replace(/\/+$/,'') : 'https://' + website;
        } else {
                  base = await findWebsite(name, city);
        }

  if (!base) {
            console.log('No website found for:', name);
            return res.status(200).json({ ...empty, source: 'no_website' });
  }
        console.log('Base website:', base);

  // ── Fetch all relevant pages in parallel ──────────────────────────────
  const pageList = [
        { url: base + '/karriere',           type: 'career'    },
        { url: base + '/jobs',               type: 'career'    },
        { url: base + '/stellenangebote',    type: 'career'    },
        { url: base + '/career',             type: 'career'    },
        { url: base + '/en/career',          type: 'career'    },
        { url: base + '/kontakt',            type: 'contact'   },
        { url: base + '/ueber-uns',          type: 'about'     },
        { url: base + '/team',               type: 'about'     },
        { url: base + '/unternehmen',        type: 'about'     },
        { url: base,                         type: 'home'      },
            // Impressum in all common variants — CEO lives here
        { url: base + '/impressum',          type: 'impressum' },
        { url: base + '/legal/impressum',    type: 'impressum' },
        { url: base + '/de/impressum',       type: 'impressum' },
        { url: base + '/ueber-uns/impressum',type: 'impressum' },
        { url: base + '/unternehmen/impressum', type: 'impressum' },
            ...(extUrlDecoded ? [{ url: extUrlDecoded, type: 'extern' }] : []),
          ];

  const results = await Promise.all(pageList.map(p => fetchPage(p.url).then(r => r ? { ...p, ...r } : null)));

  let bestEmailFound = null;
        let bestPhoneFound = null;
        let hrContact = null;
        let ceoContact = null;

  for (const page of results) {
            if (!page) continue;
            const em = bestEmail(page.text);
            const ph = bestPhone(page.text);
            bestEmailFound = upgradeEmail(bestEmailFound, em);
            if (ph && !bestPhoneFound) bestPhoneFound = ph;

          // HR on non-impressum pages
          if (!hrContact && page.type !== 'impressum') {
                      const hr = extractHR(page.text);
                      if (hr) {
                                    hrContact = { ...hr, email: em || null, phone: ph || null, source: 'website_hr_' + page.type, website: base };
                                    console.log('HR found on', page.type, ':', hrContact.firstName, hrContact.lastName);
                      }
          }

          // CEO from impressum pages
          if (!ceoContact && page.type === 'impressum') {
                      const ceo = extractCEO(page.text);
                      if (ceo) {
                                    ceoContact = { ...ceo, email: em || null, phone: ph || null, source: 'impressum_ceo', website: base };
                                    console.log('CEO found in impressum:', ceoContact.firstName, ceoContact.lastName);
                      }
          }
  }

  if (hrContact) return res.status(200).json(hrContact);
        if (ceoContact) return res.status(200).json(ceoContact);

  // ── HR email fallback ─────────────────────────────────────────────────
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

  // ── Constructed HR email ──────────────────────────────────────────────
  try {
            const domain = new URL(base).hostname.replace(/^www\./,'');
            return res.status(200).json({
                        ...empty,
                        firstName: 'Bewerbung',
                        lastName: name.split(' ')[0],
                        email: `bewerbung@${domain}`,
                        position: 'HR Bewerbungskontakt',
                        source: 'constructed_email',
                        website: base,
            });
  } catch(_) {}

  return res.status(200).json({ ...empty, website: base, source: 'no_contact_found' });
}
