// find-contact.js v3
// Priority: 1) jobText  2) externeUrl  3) Website HR  4) Impressum CEO  5) HR email fallback  6) constructed email
// CEO aus Impressum ist immer valider Fallback - "Vertreten durch" wird zuverlässig erkannt

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────

function normCompany(name) {
      return name.toLowerCase()
        .replace(/\bgmbh\s*&\s*co\.?\s*kg\b|\bgmbh\s*&\s*co\b|\bgmbh\b|\bag\b|\bse\b|\bkg\b|\be\.v\.\b|\bohg\b|\bug\b|\bgrp\b|\bgroup\b|\bholding\b/gi, '')
        .replace(/niederlassung\s+\w+/gi, '')
        .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
        .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,'-').replace(/^-+|-+$/g,'');
}

function cap(s) {
      if (!s) return '';
      return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function stripHtml(html) {
      return html
        .replace(/<script[\s\S]*?<\/script>/gi,'')
        .replace(/<style[\s\S]*?<\/style>/gi,'')
        .replace(/<br\s*\/?>/gi,' ')
        .replace(/<\/p>/gi,' ')
        .replace(/<[^>]+>/g,' ')
        .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
        .replace(/\s+/g,' ').trim();
}

const HR_EMAIL   = /(?:bewerbung|hr|personal|karriere|recruiting|jobs|talent|bewerb)@/i;
const SKIP_EMAIL = /^(noreply|no-reply|donotreply|bounce|mailer-daemon|postmaster)@/i;
const GENERIC    = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb|anfrage|sekretariat|team|web|online)@/i;

function bestEmail(text) {
      const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
        .map(m => m[0]).filter(e => !SKIP_EMAIL.test(e));
      if (!all.length) return null;
      // Prefer .de over .com for German companies
  const deEmails = all.filter(e => e.endsWith('.de'));
      const pool = deEmails.length ? deEmails : all;
      return pool.find(e => HR_EMAIL.test(e)) || pool.find(e => !GENERIC.test(e)) || pool[0];
}

function upgradeEmail(cur, cand) {
      if (!cand) return cur;
      if (!cur) return cand;
      // prefer .de
  if (cand.endsWith('.de') && !cur.endsWith('.de')) return cand;
      if (HR_EMAIL.test(cand) && !HR_EMAIL.test(cur)) return cand;
      if (!GENERIC.test(cand) && GENERIC.test(cur)) return cand;
      return cur;
}

function bestPhone(text) {
      const m1 = text.match(/(?:Tel(?:efon|\.)?|Fon|Phone|Mobil|Telefonnummer)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i);
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
      'Lesen','Schreiben','Suchen','Finden','Mehr','Alle','Hier','Unsere','Ihrem','Ihrer',
      'Kontakt','Karriere','Bewerbung','Impressum','Datenschutz','Stellenangebote','Leistungen',
      'Produkte','Loesungen','Referenzen','Unternehmen','Standorte','Aktuelles','Presse',
    ]);

function isRealName(fn, ln) {
      if (!fn || !ln) return false;
      // Strip titles for check
  const fnClean = fn.replace(/^(Dr\.|Prof\.|Dipl\.|Ing\.|M\.A\.|B\.A\.|Mag\.)\s*/i,'').trim();
      if (fnClean.length < 2 || ln.length < 2) return false;
      if (BLACKLIST.has(fnClean) || BLACKLIST.has(ln)) return false;
      if (!/^[A-ZÄÖÜ]/.test(fnClean)) return false;
      if (!/^[A-ZÄÖÜ]/.test(ln)) return false;
      if (/\d/.test(fnClean) || /\d/.test(ln)) return false;
      if (fnClean.length > 25 || ln.length > 35) return false;
      return true;
}

function getHRPosition(ctx) {
      const t = (ctx || '').toLowerCase();
      if (t.includes('personalleiter') || t.includes('hr-leiter') || t.includes('leiter personal')) return 'Personalleiter/in';
      if (t.includes('personal') || t.includes('human resources')) return 'HR Manager/in';
      if (t.includes('recruit')) return 'Recruiter/in';
      if (t.includes('talent')) return 'Talent Acquisition';
      if (t.includes('bewerbung')) return 'Bewerbungsmanagement';
      return 'HR Ansprechpartner/in';
}

// ── CEO extractor - speziell fuer deutsches Impressum ────────────────────
function extractCEO(text) {
      // Pattern 1: "Vertreten durch:\nDr. Andreas J. Ness\nDietmar B. Ness"
  // Multi-line: after "Vertreten durch" grab next 1-3 name lines
  const vertrBlock = text.match(/[Vv]ertreten\s+durch[:\s]+([^\n]{3,80})/);
      if (vertrBlock) {
              const line = vertrBlock[1].trim();
              // Remove titles, get name parts
        const cleaned = line
                .replace(/^(Dr\.|Prof\.|Dipl\.-?Ing\.|Dipl\.-?\w+\.?|M\.A\.|B\.Sc\.|Mag\.)\s*/gi,'')
                .replace(/[,;].*$/,'') // cut after comma (multiple GF)
          .trim();
              const parts = cleaned.split(/\s+/).filter(p => p.length > 1 && !/^[A-Z]\.$/.test(p));
              if (parts.length >= 2) {
                        const fn = cap(parts[0]);
                        const ln = cap(parts[parts.length - 1]);
                        if (isRealName(fn, ln)) {
                                    return { firstName: fn, lastName: ln, position: 'Geschäftsführer/in' };
                        }
              }
      }

  // Pattern 2: "Geschäftsführer: Max Mustermann" inline
  const patterns = [
          /(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|Vorstand(?:svorsitzender)?|CEO|Leitung|Direktor(?:in)?)[\s:]+(?:(?:Dr|Prof|Dipl|Ing)\.[\s\-]?\w+\.?\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+(?:[A-Z]\.\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
          // "Max Mustermann, Geschäftsführer"
          /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+(?:[A-Z]\.\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})[,\s]+(?:Geschäftsführer|Inhaber|CEO|Vorstand)/,
        ];

  for (const p of patterns) {
          const m = text.match(p);
          if (m && m[1] && m[2]) {
                    const fn = cap(m[1]);
                    const ln = cap(m[2]);
                    if (isRealName(fn, ln)) {
                                return { firstName: fn, lastName: ln, position: 'Geschäftsführer/in' };
                    }
          }
  }
      return null;
}

// ── HR extractor ──────────────────────────────────────────────────────────
function extractHR(text) {
      const patterns = [
              /(?:Ansprechpartner(?:in)?|Ihre?\s+Kontakt(?:person)?|HR|Personalreferent(?:in)?|Recruiter(?:in)?)[\s:]+(?:(?:Dr|Prof)\.[\s])?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
              /(?:Frau|Herr)\s+(?:(?:Dr|Prof)\.[\s])?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})\s*[,\-–|]\s*(?:Personal|HR|Recruiting|Bewerbung|Talent)/i,
              /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})\s*[,\-–]\s*(?:Personal(?:leiterin?|referentin?|abteilung)?|HR[-\s]?Manager(?:in)?|Recruit(?:er(?:in)?|ing)|Talent)/,
            ];
      for (const p of patterns) {
              const m = text.match(p);
              if (m && m[1] && m[2]) {
                        const fn = cap(m[1]);
                        const ln = cap(m[2]);
                        if (isRealName(fn, ln)) {
                                    return { firstName: fn, lastName: ln, position: getHRPosition(m[0]) };
                        }
              }
      }
      return null;
}

// ── Google website finder ─────────────────────────────────────────────────
async function findWebsiteViaGoogle(companyName, city) {
      try {
              const q = encodeURIComponent(`"${companyName}" ${city || ''} Impressum`);
              const r = await fetch(`https://www.google.de/search?q=${q}&num=8&hl=de&gl=de`, {
                        headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' },
                        signal: AbortSignal.timeout(5000),
                        redirect: 'follow',
              });
              if (!r.ok) return null;
              const html = await r.text();
              const norm = normCompany(companyName);
              const words = norm.split('-').filter(w => w.length > 2);
              // Extract result URLs - prefer .de domains
        const allUrls = [...html.matchAll(/href="(https?:\/\/(?!(?:www\.)?google)[^"&]{10,}?)(?:[&"])/g)]
                .map(m => { try { return new URL(m[1]); } catch(_) { return null; } })
                .filter(Boolean);
              // Score each domain
        const scored = [];
              for (const u of allUrls) {
                        const host = u.hostname.replace(/^www\./, '');
                        const hostNorm = host.replace(/[\.\-]/g,'');
                        const isDe = host.endsWith('.de');
                        const nameMatch = words.some(w => w.length > 3 && hostNorm.includes(w));
                        if (nameMatch) {
                                    scored.push({ url: 'https://' + u.hostname, score: isDe ? 2 : 1 });
                        }
              }
              scored.sort((a,b) => b.score - a.score);
              if (scored.length) {
                        console.log('Google found:', scored[0].url);
                        return scored[0].url;
              }
              return null;
      } catch(e) {
              console.log('Google lookup failed:', e.message);
              return null;
      }
}

// ── Domain probing with umlaut variants ──────────────────────────────────
async function findWebsiteByProbing(companyName, city) {
      const norm = normCompany(companyName);
      const words = norm.split('-').filter(w => w.length > 0);
      if (!words.length) return null;

  const slugs = new Set();
      slugs.add(words.slice(0,4).join('-'));
      if (words.length > 2) slugs.add(words.slice(0,3).join('-'));
      if (words.length > 1) slugs.add(words.slice(0,2).join('-'));
      slugs.add(words[0]);
      if (words[0]?.length <= 6) {
              for (const sfx of ['-gmbh','-group','-solutions','-systems','-tech','-service','-gruppe','-ag']) {
                        slugs.add(words[0] + sfx);
              }
      }
      // Also try original name with umlauts kept (browser resolves punycode)
  const origSlug = companyName.toLowerCase()
        .replace(/\s+gmbh.*$/i,'').replace(/\s+ag.*$/i,'').replace(/\s+kg.*$/i,'')
        .replace(/\s+/g,'-').replace(/[^a-z0-9äöüß\-]/g,'');
      if (origSlug.length > 2) slugs.add(origSlug);

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
                    const finalHost = new URL(r.url || url).hostname;
                    // Prefer .de
            return { url: 'https://' + finalHost, isDe: finalHost.endsWith('.de') };
          } catch { clearTimeout(t); return null; }
  };

  const results = (await Promise.all([...new Set(probes)].map(validate))).filter(Boolean);
      // Return .de first
  const de = results.find(r => r.isDe);
      if (de) return de.url;
      if (results[0]) return results[0].url;
      return null;
}

// ── Combined: Google first, probe fallback ────────────────────────────────
async function findWebsite(companyName, city) {
      const [googleResult, probeResult] = await Promise.all([
              findWebsiteViaGoogle(companyName, city),
              findWebsiteByProbing(companyName, city),
            ]);
      // Prefer .de from either source
  const candidates = [googleResult, probeResult].filter(Boolean);
      const de = candidates.find(c => c.endsWith('.de') || c.includes('.de/'));
      const result = de || candidates[0] || null;
      if (result) console.log('Website found:', result);
      return result;
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

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, city, website, jobText, externeUrl } = req.query;
      if (!name) return res.status(400).json({ error: 'name required' });

  const empty = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null };

  // ── Priority 1: jobText (Stellenbeschreibung) ─────────────────────────
  if (jobText) {
          const jt = decodeURIComponent(jobText);
          const hrFromJob = extractHR(jt);
          if (hrFromJob) {
                    return res.status(200).json({
                                ...hrFromJob,
                                email: bestEmail(jt) || null,
                                phone: bestPhone(jt) || null,
                                source: 'jobtext',
                                website: website || null,
                    });
          }
          const emailFromJob = bestEmail(jt);
          if (emailFromJob && HR_EMAIL.test(emailFromJob)) {
                    return res.status(200).json({
                                ...empty, email: emailFromJob, phone: bestPhone(jt),
                                firstName: 'Bewerbung', lastName: name.split(' ')[0],
                                position: 'HR Bewerbungskontakt', source: 'jobtext_email', website: website || null,
                    });
          }
  }

  // ── Priority 2: externeUrl ────────────────────────────────────────────
  let extUrlDecoded = null;
      if (externeUrl) {
              try { extUrlDecoded = decodeURIComponent(externeUrl); } catch(_) {}
      }
      if (extUrlDecoded) {
              const extPage = await fetchPage(extUrlDecoded);
              if (extPage) {
                        const hr = extractHR(extPage.text);
                        const email = bestEmail(extPage.text);
                        if (hr) {
                                    return res.status(200).json({
                                                  ...hr, email: email || null, phone: bestPhone(extPage.text),
                                                  source: 'externe_url', website: website || null,
                                    });
                        }
                        if (email && HR_EMAIL.test(email)) {
                                    return res.status(200).json({
                                                  ...empty, email, phone: bestPhone(extPage.text),
                                                  firstName: 'Bewerbung', lastName: name.split(' ')[0],
                                                  position: 'HR Bewerbungskontakt', source: 'externe_url_email', website: website || null,
                                    });
                        }
              }
      }

  // ── Find website (Google + Probe parallel) ────────────────────────────
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

  // ── Scrape pages in parallel ──────────────────────────────────────────
  const pages = [
      { url: base + '/karriere',         type: 'career'    },
      { url: base + '/jobs',             type: 'career'    },
      { url: base + '/stellenangebote',  type: 'career'    },
      { url: base + '/career',           type: 'career'    },
      { url: base + '/kontakt',          type: 'contact'   },
      { url: base + '/team',             type: 'about'     },
      { url: base + '/ueber-uns',        type: 'about'     },
      { url: base,                       type: 'home'      },
          // Impressum - mehrere Varianten parallel
      { url: base + '/impressum',        type: 'impressum' },
      { url: base + '/impressum/',       type: 'impressum' },
      { url: base + '/de/impressum',     type: 'impressum' },
      { url: base + '/legal/impressum',  type: 'impressum' },
      { url: base + '/rechtliches',      type: 'impressum' },
          ...(extUrlDecoded ? [{ url: extUrlDecoded, type: 'extern' }] : []),
        ];

  const results = await Promise.all(pages.map(p => fetchPage(p.url).then(r => r ? { ...p, ...r } : null)));

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

        // HR Kontakt auf Karriere/Kontakt/About-Seiten
        if (!hrContact && page.type !== 'impressum') {
                  const hr = extractHR(page.text);
                  if (hr) {
                              hrContact = { ...hr, email: em || null, phone: ph || null, source: 'website_' + page.type, website: base };
                              console.log('HR found on', page.type, ':', hrContact.firstName, hrContact.lastName);
                  }
        }

        // CEO aus Impressum
        if (!ceoContact && page.type === 'impressum') {
                  const ceo = extractCEO(page.text);
                  if (ceo) {
                              ceoContact = { ...ceo, email: em || null, phone: ph || null, source: 'impressum_ceo', website: base };
                              console.log('CEO found in impressum:', ceoContact.firstName, ceoContact.lastName);
                  }
        }
  }

  // Reihenfolge: HR > CEO > Email-Fallback > Constructed
  if (hrContact) return res.status(200).json(hrContact);
      if (ceoContact) return res.status(200).json(ceoContact);

  // Priority 5: beste gefundene Email
  if (bestEmailFound) {
          const isHR = HR_EMAIL.test(bestEmailFound);
          return res.status(200).json({
                    ...empty,
                    firstName: isHR ? 'Bewerbung' : 'Personalabteilung',
                    lastName: name.split(/\s+/)[0],
                    email: bestEmailFound,
                    phone: bestPhoneFound,
                    position: isHR ? 'HR Bewerbungskontakt' : 'Ansprechpartner/in',
                    source: 'email_fallback',
                    website: base,
          });
  }

  // Priority 6: bewerbung@domain.de konstruieren
  try {
          const domain = new URL(base).hostname.replace(/^www\./,'');
          return res.status(200).json({
                    ...empty,
                    firstName: 'Bewerbung',
                    lastName: name.split(/\s+/)[0],
                    email: `bewerbung@${domain}`,
                    position: 'HR Bewerbungskontakt',
                    source: 'constructed_email',
                    website: base,
          });
  } catch(_) {}

  return res.status(200).json({ ...empty, website: base, source: 'no_contact_found' });
}
