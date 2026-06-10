// find-contact.js v6 - clean rewrite, CEO from Impressum rawHtml
// Priority: 1)jobText 2)externeUrl 3)Website HR 4)Impressum CEO 5)Email fallback 6)constructed

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

function normCompany(n) {
          return n.toLowerCase()
            .replace(/\bgmbh\s*&\s*co\.?\s*kg\b|\bgmbh\b|\bag\b|\bse\b|\bkg\b|\bug\b|\bgrp\b|\bgroup\b|\bholding\b/gi, '')
            .replace(/niederlassung\s+\w+/gi, '')
            .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
if(fc.length>25||ln.length>35)return false; if(/-[a-z]/.test(ln))return false;}
function cap(s) { return s ? s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : ''; }
function stripHtml(h) { return h.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim(); }

const HR_EMAIL   = /(?:bewerbung|hr|personal|karriere|recruiting|jobs|talent|bewerb)@/i;
const SKIP_EMAIL = /^(noreply|no-reply|donotreply|bounce|mailer-daemon|postmaster)@/i;
const GENERIC    = /^(info|kontakt|post|mail|office|hallo|hello|support|service|sales|vertrieb|anfrage|sekretariat|team|web)@/i;

function bestEmail(text) {
          const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m=>m[0]).filter(e=>!SKIP_EMAIL.test(e));
          if (!all.length) return null;
          const de = all.filter(e=>e.endsWith('.de'));
          const pool = de.length ? de : all;
          return pool.find(e=>HR_EMAIL.test(e)) || pool.find(e=>!GENERIC.test(e)) || pool[0];
}
function upgradeEmail(cur,cand) { if(!cand)return cur; if(!cur)return cand; if(cand.endsWith('.de')&&!cur.endsWith('.de'))return cand; if(HR_EMAIL.test(cand)&&!HR_EMAIL.test(cur))return cand; if(!GENERIC.test(cand)&&GENERIC.test(cur))return cand; return cur; }
function bestPhone(text) { const m1=text.match(/(?:Tel(?:efon|\.)?|Fon|Phone|Mobil)[\s.:]*([+\d][\d\s()\-\/]{7,18})/i); if(m1)return m1[1].trim().replace(/\s+/g,' '); const m2=text.match(/(?:^|\s)((?:\+49|0)[\d\s()\-\/]{8,18})(?:\s|$)/m); if(m2)return m2[1].trim().replace(/\s+/g,' '); return null; }

const BL = new Set(['Engineering','Software','Solutions','Systems','Services','Technologies','Consulting','Business','International','Industrial','Technical','Digital','Applications','Products','Operations','Innovation','Automation','Division','Manufacturing','Mechanical','Electrical','Electronic','Management','Development','Research','Design','Quality','Production','Gmbh','Gruppe','Group','Holding','Corporate','Kontakt','Karriere','Bewerbung','Impressum','Datenschutz','Stellenangebote','Leistungen','Produkte','Unternehmen','Standorte','Aktuelles','Presse']);
function isRealName(fn,ln) { const fc=fn.replace(/^(Dr\.|Prof\.|Dipl\.|Ing\.)\s*/i,'').trim(); if(fc.length<2||ln.length<2)return false; if(BL.has(fc)||BL.has(ln))return false; if(!/^[A-ZÄÖÜ]/.test(fc)||!/^[A-ZÄÖÜ]/.test(ln))return false; if(/\d/.test(fc)||/\d/.test(ln))return false; if(fc.length>25||ln.length>35)return false; return true; }
function getHRPos(c) { const t=(c||'').toLowerCase(); if(t.includes('personalleiter'))return 'Personalleiter/in'; if(t.includes('personal')||t.includes('human resources'))return 'HR Manager/in'; if(t.includes('recruit'))return 'Recruiter/in'; if(t.includes('talent'))return 'Talent Acquisition'; return 'HR Ansprechpartner/in'; }

// CEO aus Impressum - erkennt "Vertreten durch:\n\nDr. Andreas J. Ness"
function extractCEO(rawHtml) {
          // Multi-line match on raw HTML (before stripping)
  const m1 = rawHtml.match(/[Vv]ertreten\s+durch[\s:\n]+(?:Dr\.|Prof\.|Dipl\.[-\w]*\.?\s+)?([A-Z][a-zA-ZäöüÄÖÜß\-]{1,20})\s+(?:[A-Z]\.\s+)?([A-Z][a-zA-ZäöüÄÖÜß\-]{1,30})/m);
          if (m1 && m1[1] && m1[2]) { const fn=cap(m1[1]), ln=cap(m1[2]); if(isRealName(fn,ln)) return {firstName:fn, lastName:ln, position:'Geschäftsführer/in'}; }
          // Inline on stripped text
  const t = stripHtml(rawHtml);
          const pats = [
                      /(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|Vorstand|CEO)[:\s]+(?:(?:Dr|Prof|Dipl)\.[-\s\w]*\.?\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+(?:[A-Z]\.\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
                      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+(?:[A-Z]\.\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})[,\s]+(?:Geschäftsführer|Inhaber|CEO|Vorstand)/,
                      /[Vv]ertreten\s+durch[:\s]+(?:(?:Dr|Prof|Dipl)\.[-\s\w]*\.?\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+(?:[A-Z]\.\s+)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
                    ];
          for (const p of pats) { const m=t.match(p); if(m&&m[1]&&m[2]){const fn=cap(m[1]),ln=cap(m[2]);if(isRealName(fn,ln))return{firstName:fn,lastName:ln,position:'Geschäftsführer/in'};} }
          return null;
}

function extractHR(text) {  // Frau/Herr + Name direkt (z.B. in Stellenbeschreibungen)  const frauHerr = text.match(/(?:bei\s+)?(?:Frau|Herr)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/);  if (frauHerr && frauHerr[1] && frauHerr[2]) {    const fn = cap(frauHerr[1]), ln = cap(frauHerr[2]);    if (isRealName(fn, ln)) return { firstName: fn, lastName: ln, position: 'Ansprechpartner/in' };  // Frau/Herr + Name direkt (z.B. in Stellenbeschreibungen)  const frauHerr = text.match(/(?:bei\s+)?(?:Frau|Herr)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/);  if (frauHerr && frauHerr[1] && frauHerr[2]) {  // Frau/Herr + Name direkt (z.B. in Stellenbeschreibungen)
          const pats = [
                      /(?:Ansprechpartner(?:in)?|Ihre?\s+Kontakt(?:person)?|Personalreferent(?:in)?|Recruiter(?:in)?)\s*[:\s]+(?:(?:Dr|Prof)\.\s)?([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})/,
                      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,20})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]{1,30})[,\-\s]+(?:Personal(?:leiterin?|referentin?|abteilung)?|HR[-\s]?Manager(?:in)?|Recruit(?:er(?:in)?|ing)|Talent)/,
                    ];
          for (const p of pats) { const m=text.match(p); if(m&&m[1]&&m[2]){const fn=cap(m[1]),ln=cap(m[2]);if(isRealName(fn,ln))return{firstName:fn,lastName:ln,position:getHRPos(m[0])};} }
          return null;
}

async function findWebsiteViaGoogle(companyName, city) {
          try {
                      const q = encodeURIComponent('"' + companyName + '" ' + (city||'') + ' Impressum');
                      const r = await fetch('https://www.google.de/search?q=' + q + '&num=8&hl=de&gl=de', {
                                    headers: {'User-Agent':UA,'Accept':'text/html','Accept-Language':'de-DE,de;q=0.9'},
                                    signal: AbortSignal.timeout(5000), redirect: 'follow',
                      });
                      if (!r.ok) return null;
                      const html = await r.text();
                      const norm = normCompany(companyName);
                      const words = norm.split('-').filter(w=>w.length>2);
                      const scored = [];
                      for (const m of html.matchAll(/href="(https?:\/\/(?!(?:www\.)?google)[^"&]{10,}?)(?:[&"])/g)) {
                                    try { const u=new URL(m[1]); const host=u.hostname.replace(/^www\./,''); const hn=host.replace(/[\.\-]/g,''); const isDe=host.endsWith('.de'); if(words.some(w=>w.length>3&&hn.includes(w))) scored.push({url:'https://'+u.hostname,score:isDe?2:1}); } catch(_){}
                      }
                      scored.sort((a,b)=>b.score-a.score);
                      if (scored.length) { console.log('Google:',scored[0].url); return scored[0].url; }
                      return null;
          } catch(e) { console.log('Google failed:',e.message); return null; }
}

async function findWebsiteByProbing(companyName, city) {
          const norm = normCompany(companyName);
          const words = norm.split('-').filter(w=>w.length>0);
          if (!words.length) return null;
          const slugs = new Set();
          slugs.add(words.slice(0,4).join('-'));
          if (words.length>2) slugs.add(words.slice(0,3).join('-'));
          if (words.length>1) slugs.add(words.slice(0,2).join('-'));
          slugs.add(words[0]);
          const orig = companyName.toLowerCase().replace(/\s+gmbh.*$/i,'').replace(/\s+ag.*$/i,'').replace(/\s+kg.*$/i,'').replace(/\s+/g,'-').replace(/[^a-z0-9äöüß\-]/g,'');
          if (orig.length>2) slugs.add(orig);
          const probes = [];
          for (const s of slugs) { probes.push('https://www.'+s+'.de'); probes.push('https://'+s+'.de'); probes.push('https://www.'+s+'.com'); }
          const validate = async (url) => {
                      const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),3000);
                      try { const r=await fetch(url,{headers:{'User-Agent':UA},redirect:'follow',signal:ctrl.signal}); clearTimeout(t); if(!r.ok)return null; const text=(await r.text()).toLowerCase(); const kws=norm.split('-').filter(w=>w.length>3); if(kws.length>0&&!kws.some(k=>text.includes(k)))return null; const fh=new URL(r.url||url).hostname; return {url:'https://'+fh,isDe:fh.endsWith('.de')}; } catch{clearTimeout(t);return null;}
          };
          const results = (await Promise.all([...new Set(probes)].map(validate))).filter(Boolean);
          const de = results.find(r=>r.isDe);
          return de ? de.url : (results[0]?.url||null);
}

async function findWebsite(companyName, city) {
          const [g,p] = await Promise.all([findWebsiteViaGoogle(companyName,city), findWebsiteByProbing(companyName,city)]);
          const candidates = [g,p].filter(Boolean);
          return candidates.find(c=>c.endsWith('.de')) || candidates[0] || null;
}

async function fetchPage(url, timeout=6000) {
          const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),timeout);
          try { const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html','Accept-Language':'de-DE,de;q=0.9'},redirect:'follow',signal:ctrl.signal}); clearTimeout(t); if(!r.ok)return null; const html=await r.text(); return {url:r.url||url,text:stripHtml(html),html}; } catch{clearTimeout(t);return null;}
}

export default async function handler(req, res) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-store');
          if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, city, website, jobText, externeUrl } = req.query;
          if (!name) return res.status(400).json({ error: 'name required' });
          const empty = { firstName:null, lastName:null, email:null, phone:null, position:null, source:null, website:null };

  // P1: jobText
  if (jobText) {
              const jt = decodeURIComponent(jobText);
              const hr = extractHR(jt);
              if (hr) return res.status(200).json({ ...hr, email:bestEmail(jt), phone:bestPhone(jt), source:'jobtext', website:website||null });
              const em = bestEmail(jt);
              if (em && HR_EMAIL.test(em)) return res.status(200).json({ ...empty, firstName:'Bewerbung', lastName:name.split(' ')[0], email:em, phone:bestPhone(jt), position:'HR Bewerbungskontakt', source:'jobtext_email', website:website||null });
  }

  // P2: externeUrl
  let extUrl = null;
          if (externeUrl) { try { extUrl = decodeURIComponent(externeUrl); } catch(_){} }
          if (extUrl) {
                      const ep = await fetchPage(extUrl);
                      if (ep) { const hr=extractHR(ep.text); if(hr) return res.status(200).json({...hr,email:bestEmail(ep.text),phone:bestPhone(ep.text),source:'externe_url',website:website||null}); }
          }

  // Find website
  let base = null;
          if (website) base = website.startsWith('http') ? website.replace(/\/+$/,'') : 'https://'+website;
          else base = await findWebsite(name, city);
          if (!base) { console.log('No website:', name); return res.status(200).json({...empty, source:'no_website'}); }
          console.log('Website:', base);

  // Scrape pages
  const pages = [
          {url:base+'/karriere',type:'career'}, {url:base+'/jobs',type:'career'},
          {url:base+'/stellenangebote',type:'career'}, {url:base+'/career',type:'career'},
          {url:base+'/kontakt',type:'contact'}, {url:base+'/team',type:'about'},
          {url:base+'/ueber-uns',type:'about'}, {url:base,type:'home'},
          {url:base+'/impressum',type:'impressum'}, {url:base+'/de/impressum',type:'impressum'},
          {url:base+'/legal/impressum',type:'impressum'}, {url:base+'/rechtliches',type:'impressum'},
              ...(extUrl ? [{url:extUrl,type:'extern'}] : []),
            ];
          const results = await Promise.all(pages.map(p => fetchPage(p.url).then(r => r ? {...p,...r} : null)));

  let bestEmailFound=null, bestPhoneFound=null, hrContact=null, ceoContact=null;
          for (const page of results) {
                      if (!page) continue;
                      const em = bestEmail(page.text); const ph = bestPhone(page.text);
                      bestEmailFound = upgradeEmail(bestEmailFound, em);
                      if (ph && !bestPhoneFound) bestPhoneFound = ph;
                      if (!hrContact && page.type !== 'impressum') {
                                    const hr = extractHR(page.text, page.html);
                                    if (hr) { hrContact = {...hr, email:em||null, phone:ph||null, source:'website_'+page.type, website:base}; console.log('HR:', hrContact.firstName, hrContact.lastName); }
                      }
                      if (!ceoContact && page.type === 'impressum') {
                                    const ceo = extractCEO(page.html || page.text);
                                    if (ceo) { ceoContact = {...ceo, email:em||null, phone:ph||null, source:'impressum_ceo', website:base}; console.log('CEO:', ceoContact.firstName, ceoContact.lastName); }
                      }
          }

  if (hrContact) return res.status(200).json(hrContact);
          if (ceoContact) return res.status(200).json(ceoContact);

  // P5: email fallback
  if (bestEmailFound) {
              const isHR = HR_EMAIL.test(bestEmailFound);
              return res.status(200).json({...empty, firstName:isHR?'Bewerbung':'Personalabteilung', lastName:name.split(/\s+/)[0], email:bestEmailFound, phone:bestPhoneFound, position:isHR?'HR Bewerbungskontakt':'Ansprechpartner/in', source:'email_fallback', website:base});
  }

  // P6: construct bewerbung@domain
  try { const domain = new URL(base).hostname.replace(/^www\./,''); return res.status(200).json({...empty, firstName:'Bewerbung', lastName:name.split(/\s+/)[0], email:'bewerbung@'+domain, position:'HR Bewerbungskontakt', source:'constructed_email', website:base}); } catch(_){}
          return res.status(200).json({...empty, website:base, source:'no_contact_found'});
}
