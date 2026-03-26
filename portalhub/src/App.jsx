import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  bg:'#080F1C', bg2:'#0D1626', bg3:'#121E30', bg4:'#172338',
  border:'rgba(255,255,255,0.06)', border2:'rgba(255,255,255,0.11)', border3:'rgba(255,255,255,0.18)',
  text:'#E8EEF8', muted:'rgba(232,238,248,0.55)', faint:'rgba(232,238,248,0.28)',
  blue:'#4B8EF0', blueDim:'rgba(75,142,240,0.13)', blueLight:'#88B4F7', blueBorder:'rgba(75,142,240,0.25)',
  green:'#22C55E', greenDim:'rgba(34,197,94,0.11)', greenLight:'#4ADE80', greenBorder:'rgba(34,197,94,0.22)',
  amber:'#F59E0B', amberDim:'rgba(245,158,11,0.11)', amberLight:'#FCD34D', amberBorder:'rgba(245,158,11,0.25)',
  violet:'#A78BFA', violetDim:'rgba(167,139,250,0.11)', violetLight:'#C4B5FD', violetBorder:'rgba(167,139,250,0.25)',
  red:'#F87171', redDim:'rgba(248,113,113,0.10)',
};

// ─── API CALL (über eigenen Proxy → kein CORS) ────────────────────────────────
async function searchBA({ terms, wo, umkreis, angebotsart = '1', page = 1, size = 50, zeitarbeit = false }) {
  const params = new URLSearchParams();
  if (terms.length) params.set('was', terms.join(' '));
  if (wo)           params.set('wo', wo);
  if (umkreis > 0)  params.set('umkreis', String(umkreis));
  params.set('angebotsart', angebotsart);
  params.set('page', String(page));
  params.set('size', String(size));
  params.set('zeitarbeit', zeitarbeit ? 'true' : 'false');

  const r = await fetch(`/api/jobs?${params}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Fehler ${r.status}`);
  }
  return r.json();
}

// ─── CLAUDE AI ────────────────────────────────────────────────────────────────
async function fetchAI(terms) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 500,
      messages: [{ role: 'user', content: `Recruiting-Experte DE. Suchbegriffe: "${terms.join(', ')}". Gib 8 verwandte Jobtitel/Synonyme auf Deutsch und einen Markt-Insight (1 Satz). Nur JSON: {"suggestions":["..."],"insight":"..."}` }]
    })
  });
  const d = await r.json();
  return JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim());
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatAge(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return '1 Tag';
  if (diff < 7) return `${diff} Tage`;
  if (diff < 14) return '1 Woche';
  return `${Math.floor(diff / 7)} Wochen`;
}

function mapAngebotsart(a) {
  return { 1: 'Arbeitsstelle', 2: 'Ausbildung', 4: 'Praktikum/Trainee' }[a] || 'Sonstiges';
}

function getCRMStatus(company, crm) {
  if (!company) return 'new';
  const m = crm.find(c => {
    const cn = c.name.toLowerCase(), jn = company.toLowerCase();
    return cn === jn || jn.includes(cn.split(' ')[0]) || cn.split(' ')[0] === jn.split(' ')[0];
  });
  if (!m) return 'new';
  return m.status === 'client' ? 'client' : 'known';
}

function parseJob(j, crm) {
  return {
    id: j.hashId || j.refnr || Math.random().toString(36),
    title: j.titel || '—',
    company: j.arbeitgeber || '—',
    city: j.arbeitsort?.ort || j.arbeitsort?.region || '—',
    region: j.arbeitsort?.region || j.arbeitsort?.bundesland || '—',
    source: 'BA Jobbörse',
    posted: formatAge(j.aktuelleVeroeffentlichungsdatum),
    salary: j.entgelt || null,
    type: mapAngebotsart(j.angebotsart),
    crmStatus: getCRMStatus(j.arbeitgeber, crm),
    refnr: j.refnr,
  };
}

function downloadCSV(jobs) {
  const h = ['Titel', 'Unternehmen', 'Stadt', 'Region', 'Quelle', 'Veröffentlicht', 'Typ', 'CRM-Status'];
  const rows = jobs.map(j => [j.title, j.company, j.city, j.region, j.source, j.posted, j.type, j.crmStatus]);
  const csv = [h, ...rows].map(r => r.join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = 'portalhub-export.csv'; a.click(); URL.revokeObjectURL(url);
}

// ─── INIT DATA ────────────────────────────────────────────────────────────────
const INIT_CRM = [
  { id: 1, name: 'Bosch GmbH', status: 'client', industry: 'Automotive', contact: 'Dr. M. Fischer', vacancies: 3 },
  { id: 2, name: 'Siemens AG', status: 'known', industry: 'Industrietechnik', contact: 'T. Bauer', vacancies: 0 },
  { id: 3, name: 'Festo AG & Co. KG', status: 'client', industry: 'Automatisierung', contact: 'S. Meier', vacancies: 1 },
  { id: 4, name: 'Mueller Technik GmbH', status: 'client', industry: 'Maschinenbau', contact: 'K. Müller', vacancies: 2 },
  { id: 5, name: 'BMW AG', status: 'known', industry: 'Automotive', contact: 'R. Weber', vacancies: 0 },
  { id: 6, name: 'KUKA AG', status: 'prospect', industry: 'Robotik', contact: '—', vacancies: 0 },
];
const INIT_ACCOUNTS = [
  { id: 1, name: 'Mueller Technik GmbH', status: 'vacancy', lastChecked: 'vor 47 min', vacancy: 'Automatisierungstechniker SPS', isClient: true },
  { id: 2, name: 'Siemens AG', status: 'ok', lastChecked: 'vor 47 min', vacancy: null, isClient: false },
  { id: 3, name: 'Festo AG & Co. KG', status: 'ok', lastChecked: 'vor 2 Std', vacancy: null, isClient: true },
  { id: 4, name: 'Bosch GmbH', status: 'vacancy', lastChecked: 'vor 1 Std', vacancy: 'Projektleiter Fertigung', isClient: true },
];
const INIT_ACT = [
  { id: 1, type: 'alert', text: 'Neue Vakanz bei Mueller Technik GmbH erkannt', time: '09:14', col: C.amber },
  { id: 2, type: 'search', text: 'Live-Suche: "Mechatroniker Stuttgart" · BA Jobbörse', time: '08:52', col: C.blue },
  { id: 3, type: 'crm', text: 'Festo AG ins CRM übertragen', time: '08:31', col: C.green },
];

const ANGEBOTSARTEN = [{ val: '1', label: 'Arbeitsstellen' }, { val: '2', label: 'Ausbildung' }, { val: '4', label: 'Praktikum' }];
const RADII = [0, 25, 50, 100, 200];

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function Spin() { return <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.18)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />; }
function Tag({ label, onRemove }) { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.blueDim, border: `1px solid ${C.blueBorder}`, color: C.blueLight, fontSize: 12.5, padding: '4px 11px', borderRadius: 100, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}{onRemove && <span onClick={onRemove} style={{ cursor: 'pointer', opacity: .55, fontSize: 13, lineHeight: 1 }}>×</span>}</span>; }
function Chip({ label, active, onClick, col = C.blue }) { return <button onClick={onClick} style={{ background: active ? `${col}20` : 'rgba(255,255,255,0.04)', color: active ? col : C.muted, border: `1px solid ${active ? col + '44' : C.border2}`, padding: '5px 14px', borderRadius: 100, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{label}</button>; }
function Card({ children, style }) { return <div style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 14, overflow: 'hidden', ...style }}>{children}</div>; }
function H1({ children }) { return <h1 style={{ fontFamily: 'Instrument Serif,Georgia,serif', fontSize: '1.9rem', fontWeight: 400, color: C.text, letterSpacing: '-.02em', lineHeight: 1.1 }}>{children}</h1>; }

function StatusBadge({ status }) {
  const s = { new: { col: C.greenLight, bg: C.greenDim, label: 'Neuakquise' }, client: { col: C.amberLight, bg: C.amberDim, label: 'Bestandskunde' }, known: { col: C.blueLight, bg: C.blueDim, label: 'Im CRM' } }[status] || { col: C.greenLight, bg: C.greenDim, label: 'Neuakquise' };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: s.bg, color: s.col, border: `1px solid ${s.col}44`, letterSpacing: '.03em', whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function JobCard({ job, onAddCRM, inCRM }) {
  const [hov, setHov] = useState(false);
  const init = (job.company || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? C.bg3 : C.bg2, border: `1px solid ${job.crmStatus === 'client' ? C.amberBorder : job.crmStatus === 'new' ? C.greenBorder : C.border2}`, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 13, transition: 'all .15s' }}>
      <div style={{ width: 40, height: 40, borderRadius: 9, background: C.bg4, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.muted, flexShrink: 0 }}>{init}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
        <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span>{job.company}</span><span style={{ color: C.faint }}>·</span><span>{job.city}</span>
          {job.region && job.region !== job.city && <span style={{ color: C.faint }}>({job.region})</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <StatusBadge status={job.crmStatus} />
        {job.salary && <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 500 }}>{job.salary}</span>}
        <span style={{ fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>{job.posted}</span>
        <span style={{ fontSize: 10.5, background: C.bg3, border: `1px solid ${C.border}`, color: C.faint, padding: '2px 7px', borderRadius: 5 }}>{job.type}</span>
        <button onClick={() => inCRM ? null : onAddCRM(job)}
          style={{ background: inCRM ? C.greenDim : C.blue, color: inCRM ? C.greenLight : '#fff', border: `1px solid ${inCRM ? C.greenBorder : 'transparent'}`, borderRadius: 8, padding: '6px 14px', fontSize: 11.5, fontWeight: 600, cursor: inCRM ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          {inCRM ? 'Im CRM ✓' : '→ CRM'}
        </button>
      </div>
    </div>
  );
}

// ─── SEARCH VIEW ──────────────────────────────────────────────────────────────
function SearchView({ crm, setCrm, setActivities, initialSearch, clearIS, setSH }) {
  const [input, setInput] = useState('');
  const [terms, setTerms] = useState(initialSearch ? [initialSearch] : []);
  const [wo, setWo] = useState('');
  const [umkreis, setUmkreis] = useState(50);
  const [angebotsart, setAngebotsart] = useState('1');
  const [zeitarbeit, setZeitarbeit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [aiError, setAiError] = useState('');
  const [crmAdded, setCrmAdded] = useState(new Set());
  const [confirmJob, setConfirmJob] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const didInit = useRef(false);

  useEffect(() => {
    if (initialSearch && !didInit.current) { setTerms([initialSearch]); clearIS(); didInit.current = true; }
  });

  const doSearch = useCallback(async (searchTerms, searchPage = 1, append = false) => {
    if (!searchTerms.length) return;
    setLoading(true); setError('');
    try {
      const data = await searchBA({ terms: searchTerms, wo: wo || '', umkreis: wo ? umkreis : 0, angebotsart, page: searchPage, size: 50, zeitarbeit });
      const parsed = (data.stellenangebote || []).map(j => parseJob(j, crm));
      setJobs(prev => append ? [...prev, ...parsed] : parsed);
      setTotal(data.maxErgebnisse || 0);
      setPage(searchPage);
      setHasSearched(true);
      setSH(h => [{ id: Date.now(), terms: searchTerms, hits: data.maxErgebnisse || parsed.length, wo: wo || '', time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }, ...h.slice(0, 19)]);
    } catch (e) {
      setError(e.message);
      setHasSearched(true);
    }
    setLoading(false);
  }, [wo, umkreis, angebotsart, zeitarbeit, crm]);

  const runSearch = () => {
    const v = input.trim();
    const allTerms = v && !terms.includes(v) ? [...terms, v] : terms;
    if (v) { setTerms(allTerms); setInput(''); }
    if (allTerms.length) doSearch(allTerms, 1, false);
  };

  const doAI = async () => {
    if (!terms.length) return;
    setAiLoading(true); setAiData(null); setAiError('');
    try { setAiData(await fetchAI(terms)); } catch { setAiError('KI-Anfrage fehlgeschlagen.'); }
    setAiLoading(false);
  };

  const addToCRM = job => {
    if (!crm.find(c => c.name === job.company)) setCrm(p => [...p, { id: Date.now(), name: job.company, status: 'new', industry: '—', contact: '—', vacancies: 1 }]);
    setCrmAdded(s => new Set([...s, job.id]));
    setActivities(a => [{ id: Date.now(), type: 'crm', text: `${job.company} ins CRM (${job.title})`, time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), col: C.green }, ...a]);
    setConfirmJob(null);
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <H1>Jobsuche</H1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Bundesagentur für Arbeit · größte Stellendatenbank Deutschlands · Live-Daten</span>
          <span style={{ fontSize: 10, fontWeight: 700, background: C.greenDim, color: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: 100, padding: '2px 8px' }}>LIVE</span>
        </div>
      </div>

      <Card style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: terms.length ? 12 : 0 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Berufsbezeichnung eingeben (Enter → Term-Tag, mehrere möglich)"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border2}`, borderRadius: 9, padding: '11px 14px', fontSize: 13.5, color: C.text, fontFamily: 'inherit', outline: 'none' }} />
          <button onClick={runSearch} disabled={loading}
            style={{ background: loading ? 'rgba(75,142,240,0.4)' : C.blue, color: '#fff', border: 'none', borderRadius: 9, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? <><Spin />Suche…</> : 'Suchen'}
          </button>
          <button onClick={doAI} disabled={!terms.length || aiLoading}
            style={{ background: terms.length ? C.violetDim : 'rgba(255,255,255,0.03)', border: `1px solid ${terms.length ? C.violetBorder : C.border}`, color: terms.length ? C.violetLight : C.faint, borderRadius: 9, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: terms.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            {aiLoading ? <><Spin />KI…</> : '✦ KI'}
          </button>
          <button onClick={() => setShowFilters(f => !f)}
            style={{ background: showFilters ? C.blueDim : 'rgba(255,255,255,0.04)', border: `1px solid ${showFilters ? C.blueBorder : C.border2}`, color: showFilters ? C.blueLight : C.muted, borderRadius: 9, padding: '11px 15px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ⚙ {showFilters ? '▲' : '▼'}
          </button>
        </div>

        {terms.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: showFilters ? 14 : 0 }}>
            {terms.map(t => <Tag key={t} label={t} onRemove={() => setTerms(ts => ts.filter(x => x !== t))} />)}
            <span style={{ fontSize: 11.5, color: C.faint }}>↳ kombinierte Suche · alle Begriffe</span>
          </div>
        )}

        {showFilters && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.faint, minWidth: 36 }}>Ort:</span>
              <input value={wo} onChange={e => setWo(e.target.value)} placeholder="Stadt, PLZ oder Bundesland (z.B. Stuttgart, Bayern, 70173)"
                style={{ width: 300, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none' }} />
              {RADII.map(r => <Chip key={r} label={r === 0 ? 'exakt' : `${r} km`} active={umkreis === r} onClick={() => setUmkreis(r)} col={C.blue} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.faint, minWidth: 36 }}>Typ:</span>
              {ANGEBOTSARTEN.map(a => <Chip key={a.val} label={a.label} active={angebotsart === a.val} onClick={() => setAngebotsart(a.val)} col={C.violet} />)}
            </div>
            <label onClick={() => setZeitarbeit(z => !z)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <div style={{ width: 36, height: 20, borderRadius: 100, background: zeitarbeit ? C.blue : 'rgba(255,255,255,0.08)', border: `1px solid ${zeitarbeit ? C.blue : C.border2}`, position: 'relative', transition: 'all .2s' }}>
                <div style={{ position: 'absolute', top: 2, left: zeitarbeit ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </div>
              <span style={{ fontSize: 13, color: C.muted }}>Zeitarbeitsstellen einschließen</span>
            </label>
          </div>
        )}
      </Card>

      {(aiData || aiError) && (
        <Card style={{ padding: 16, marginBottom: 12, border: `1px solid ${C.violetBorder}`, background: 'rgba(167,139,250,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.violetLight }}>✦ KI-Suchvorschläge</span>
            {aiData && <span style={{ fontSize: 11.5, color: C.muted }}>Klicken zum Hinzufügen</span>}
          </div>
          {aiError && <p style={{ fontSize: 13, color: C.red }}>{aiError}</p>}
          {aiData && <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {aiData.suggestions?.map(s => (
                <button key={s} onClick={() => !terms.includes(s) && setTerms(t => [...t, s])}
                  style={{ background: terms.includes(s) ? 'rgba(167,139,250,0.22)' : 'rgba(167,139,250,0.08)', border: '1px dashed rgba(167,139,250,0.3)', color: C.violetLight, fontSize: 12, padding: '4px 12px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', fontWeight: terms.includes(s) ? 700 : 400 }}>
                  {terms.includes(s) ? '✓ ' : '+  '}{s}
                </button>
              ))}
            </div>
            {aiData.insight && (
              <div style={{ display: 'flex', gap: 9, padding: '10px 14px', background: 'rgba(167,139,250,0.06)', borderRadius: 9, border: '1px solid rgba(167,139,250,0.15)' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{aiData.insight}</span>
              </div>
            )}
          </>}
        </Card>
      )}

      {hasSearched && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
            {loading ? 'Suche läuft…' : error ? 'Fehler bei der Suche' : `${total.toLocaleString('de-DE')} Stellen gefunden`}
          </span>
          {wo && !loading && !error && <span style={{ fontSize: 12.5, color: C.muted }}>· {wo}{umkreis > 0 ? ` +${umkreis} km` : ''}</span>}
          {!loading && !error && <span style={{ fontSize: 12, color: C.faint }}>· Seite {page} / {totalPages || 1}</span>}
          <div style={{ flex: 1 }} />
          {jobs.length > 0 && <button onClick={() => downloadCSV(jobs)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>↓ CSV Export</button>}
        </div>
      )}

      {error && (
        <Card style={{ padding: 18, border: 'rgba(248,113,113,0.25)', background: C.redDim, marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.red, marginBottom: 4 }}>⚠ Fehler: {error}</div>
        </Card>
      )}

      {!hasSearched && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: C.faint }}>
          <div style={{ fontSize: 44, marginBottom: 14, opacity: .3 }}>⌕</div>
          <p style={{ fontSize: 15, marginBottom: 8, color: C.muted }}>Suchbegriff eingeben und Enter oder „Suchen" drücken</p>
          <p style={{ fontSize: 12.5 }}>Echte Live-Daten · Bundesagentur für Arbeit · Millionen Stellen · Kostenlos</p>
        </div>
      )}

      {!loading && jobs.length === 0 && hasSearched && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: C.faint }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>○</div>
          <p style={{ fontSize: 14 }}>Keine Treffer — anderen Begriff oder anderen Ort probieren</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {jobs.map(job => <JobCard key={job.id} job={job} onAddCRM={j => setConfirmJob(j)} inCRM={crmAdded.has(job.id) || crm.some(c => c.name === job.company)} />)}
      </div>

      {jobs.length > 0 && page < totalPages && (
        <div style={{ textAlign: 'center', paddingTop: 20 }}>
          <button onClick={() => doSearch(terms, page + 1, true)} disabled={loading}
            style={{ background: C.bg3, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 9, padding: '10px 28px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            {loading ? <><Spin />Laden…</> : `Weitere 50 laden · noch ${total - jobs.length} verbleibend`}
          </button>
        </div>
      )}

      {confirmJob && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <Card style={{ padding: 28, maxWidth: 400, width: '90%', border: `1px solid ${C.border3}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>CRM-Eintrag bestätigen</div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Ins CRM übertragen:</p>
            <div style={{ padding: '12px 15px', background: C.bg3, borderRadius: 9, marginBottom: 18, border: `1px solid ${C.border2}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{confirmJob.company}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{confirmJob.title} · {confirmJob.city}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmJob(null)} style={{ background: 'none', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
              <button onClick={() => addToCRM(confirmJob)} style={{ background: C.blue, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Übertragen</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({ accounts, activities, crm, setView, setInitialSearch }) {
  const alerts = accounts.filter(a => a.status === 'vacancy').length;
  const wd = [3, 7, 5, 12, 9, 14, 6], mx = Math.max(...wd);
  const [qs, setQs] = useState('');
  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <H1>Guten Morgen — <em style={{ fontStyle: 'italic', color: C.blue }}>Ihr Überblick.</em></H1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        {[{ v: 7, l: 'Live-Suchen heute', c: C.blue }, { v: '∞', l: 'Verfügbare Stellen (BA)', c: C.green }, { v: accounts.length, l: 'Monitored Accounts', c: C.violet }, { v: alerts, l: 'Aktive Alerts', c: C.amber }].map((s, i) => (
          <div key={i} style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: s.c, fontFamily: 'Instrument Serif,Georgia,serif', lineHeight: 1, marginBottom: 6 }}>{s.v}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.text }}>Letzte Aktivitäten</div>
            <div style={{ padding: '8px 12px' }}>
              {activities.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 6px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.col, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, color: C.text }}>{a.text}</div>
                  <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </Card>
          {alerts > 0 && (
            <Card style={{ border: `1px solid ${C.amberBorder}`, background: 'rgba(245,158,11,0.04)' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.amber, animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.amberLight }}>{alerts} Monitoring-Alert{alerts > 1 ? 's' : ''}</span>
              </div>
              <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accounts.filter(a => a.status === 'vacancy').map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: C.amberDim, border: `1px solid ${C.amberBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.amberLight, flexShrink: 0 }}>
                      {a.name.split(' ').slice(0, 2).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.name}</div>
                      <div style={{ fontSize: 11.5, color: C.amberLight }}>⚡ {a.vacancy}</div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setView('monitoring')} style={{ marginTop: 4, background: 'none', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Monitoring öffnen →</button>
              </div>
            </Card>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Schnellsuche</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={qs} onChange={e => setQs(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && qs.trim()) { setInitialSearch(qs.trim()); setView('search'); } }} placeholder="z.B. Mechatroniker Stuttgart…" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={() => { if (qs.trim()) { setInitialSearch(qs.trim()); setView('search'); } }} style={{ background: C.blue, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>⌕</button>
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: C.greenDim, borderRadius: 8, border: `1px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, color: C.greenLight }}>Live · BA Jobbörse · Serverless Proxy</span>
            </div>
          </Card>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Suchen diese Woche</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 60 }}>
              {wd.map((v, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: '100%', height: (v / mx) * 52, background: i === 6 ? C.blue : C.blueDim, borderRadius: '3px 3px 0 0', border: `1px solid ${i === 6 ? C.blue : 'rgba(75,142,240,0.2)'}` }} />
                  <span style={{ fontSize: 9, color: C.faint }}>{'MDMDFSS'[i]}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>CRM-Status</div>
            {[{ l: 'Bestandskunden', v: crm.filter(c => c.status === 'client').length, c: C.amber }, { l: 'Interessenten', v: crm.filter(c => c.status === 'prospect').length, c: C.violet }, { l: 'Im CRM', v: crm.filter(c => c.status === 'known').length, c: C.blue }].map(s => (
              <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 5, background: C.bg4, borderRadius: 100 }}><div style={{ height: '100%', width: `${crm.length ? (s.v / crm.length) * 100 : 0}%`, background: s.c, borderRadius: 100, transition: 'width .5s' }} /></div>
                <span style={{ fontSize: 11, color: C.muted, minWidth: 18, textAlign: 'right' }}>{s.v}</span>
                <span style={{ fontSize: 11, color: C.faint, minWidth: 110 }}>{s.l}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── MONITORING ───────────────────────────────────────────────────────────────
function MonitoringView({ accounts, setAccounts, setActivities }) {
  const [addInput, setAddInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const add = () => { const n = addInput.trim(); if (!n) return; setAccounts(a => [...a, { id: Date.now(), name: n, status: 'pending', lastChecked: '—', vacancy: null, isClient: false }]); setAddInput(''); };
  const scan = async () => {
    if (!accounts.length) return; setScanning(true); setDone(false);
    await new Promise(r => setTimeout(r, 2200));
    setAccounts(p => p.map(a => a.status === 'pending' ? { ...a, status: 'ok', lastChecked: 'gerade eben' } : { ...a, lastChecked: 'gerade eben' }));
    setActivities(act => [{ id: Date.now(), type: 'search', text: `Monitoring-Scan · ${accounts.length} Accounts geprüft`, time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), col: C.blue }, ...act]);
    setScanning(false); setDone(true); setTimeout(() => setDone(false), 4000);
  };
  return (
    <div>
      <div style={{ marginBottom: 22 }}><H1>Account Monitoring</H1><p style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>Karriereseiten täglich automatisch auf neue Vakanzen prüfen</p></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={addInput} onChange={e => setAddInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Unternehmensname hinzufügen…" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: 9, padding: '10px 14px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={add} style={{ background: C.bg3, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 9, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Hinzufügen</button>
        <button onClick={scan} disabled={scanning || !accounts.length} style={{ background: scanning ? 'rgba(75,142,240,0.18)' : C.blue, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: scanning ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          {scanning ? <><Spin />Scanne…</> : 'Jetzt scannen'}
        </button>
      </div>
      {done && <div style={{ marginBottom: 14, padding: '10px 16px', background: C.greenDim, border: `1px solid ${C.greenBorder}`, borderRadius: 9, fontSize: 13, color: C.greenLight }}>✓ Scan abgeschlossen</div>}
      {!accounts.length && <div style={{ textAlign: 'center', padding: '80px 20px', color: C.faint }}><div style={{ fontSize: 42, marginBottom: 12, opacity: .3 }}>◎</div><p style={{ fontSize: 14 }}>Noch keine Accounts — Namen eingeben</p></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map(a => (
          <Card key={a.id} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderColor: a.status === 'vacancy' ? C.amberBorder : C.border2, background: a.status === 'vacancy' ? 'rgba(245,158,11,0.04)' : C.bg2 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: a.status === 'vacancy' ? C.amberDim : C.bg4, border: `1px solid ${a.status === 'vacancy' ? C.amberBorder : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: a.status === 'vacancy' ? C.amberLight : C.muted, flexShrink: 0 }}>
              {a.name.split(' ').slice(0, 2).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{a.name}</span>
                {a.isClient && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: C.amberDim, color: C.amberLight, border: `1px solid ${C.amberBorder}` }}>Bestandskunde</span>}
              </div>
              {a.status === 'vacancy' && a.vacancy && <div style={{ fontSize: 12.5, color: C.amberLight }}>⚡ {a.vacancy}</div>}
              {a.status === 'ok' && <div style={{ fontSize: 12, color: C.faint }}>Keine Änderung</div>}
              {a.status === 'pending' && <div style={{ fontSize: 12, color: C.faint }}>Ausstehend</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginBottom: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.status === 'vacancy' ? C.amber : a.status === 'ok' ? C.green : C.faint, display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: a.status === 'vacancy' ? C.amberLight : a.status === 'ok' ? C.greenLight : C.faint }}>{a.status === 'vacancy' ? 'Neue Vakanz' : a.status === 'ok' ? 'Keine Änderung' : 'Ausstehend'}</span>
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>Letzte Prüfung: {a.lastChecked}</div>
              <button onClick={() => setAccounts(p => p.filter(x => x.id !== a.id))} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.faint, borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Entfernen</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── CRM ──────────────────────────────────────────────────────────────────────
function CRMView({ crm, setCrm, accounts, setAccounts }) {
  const [q, setQ] = useState(''); const [addIn, setAddIn] = useState('');
  const filtered = crm.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.industry.toLowerCase().includes(q.toLowerCase()));
  const sc = { client: { col: C.amber, bg: C.amberDim }, prospect: { col: C.violet, bg: C.violetDim }, new: { col: C.green, bg: C.greenDim }, known: { col: C.blue, bg: C.blueDim } };
  const add = () => { const n = addIn.trim(); if (!n) return; setCrm(p => [...p, { id: Date.now(), name: n, status: 'new', industry: '—', contact: '—', vacancies: 0 }]); setAddIn(''); };
  const addM = c => { if (!accounts.find(a => a.name === c.name)) setAccounts(a => [...a, { id: Date.now(), name: c.name, status: 'pending', lastChecked: '—', vacancy: null, isClient: c.status === 'client' }]); };
  return (
    <div>
      <div style={{ marginBottom: 22 }}><H1>CRM-Datenbank</H1><p style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>{crm.length} Unternehmen · {crm.filter(c => c.status === 'client').length} Bestandskunden</p></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Suche…" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: 9, padding: '10px 14px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none' }} />
        <input value={addIn} onChange={e => setAddIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Neues Unternehmen…" style={{ width: 220, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: 9, padding: '10px 14px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={add} style={{ background: C.blue, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Hinzufügen</button>
      </div>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 155px 170px 110px 115px 60px', borderBottom: `1px solid ${C.border}` }}>
          {['Unternehmen', 'Status', 'Branche', 'Vakanzen', 'Monitoring', ''].map((h, i) => <div key={i} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</div>)}
        </div>
        {filtered.map((c, i) => {
          const s = sc[c.status] || sc.known; const isM = accounts.some(a => a.name === c.name);
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 155px 170px 110px 115px 60px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ padding: '12px 16px' }}><div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{c.name}</div><div style={{ fontSize: 11.5, color: C.faint }}>{c.contact}</div></div>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}>
                <select value={c.status} onChange={e => setCrm(p => p.map(x => x.id === c.id ? { ...x, status: e.target.value } : x))} style={{ background: s.bg, border: `1px solid ${s.col}44`, color: s.col, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="client">Bestandskunde</option><option value="prospect">Interessent</option><option value="new">Neu</option><option value="known">Im CRM</option>
                </select>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 13, color: C.muted, display: 'flex', alignItems: 'center' }}>{c.industry}</div>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}>{c.vacancies > 0 ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: C.amberDim, color: C.amberLight, border: `1px solid ${C.amberBorder}` }}>{c.vacancies} offen</span> : <span style={{ fontSize: 12, color: C.faint }}>—</span>}</div>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}>{isM ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: C.greenDim, color: C.greenLight, border: `1px solid ${C.greenBorder}` }}>Aktiv ✓</span> : <button onClick={() => addM(c)} style={{ background: 'none', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 7, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>+ Monitor</button>}</div>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}><button onClick={() => setCrm(p => p.filter(x => x.id !== c.id))} style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', color: C.red, borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button></div>
            </div>
          );
        })}
        {!filtered.length && <div style={{ padding: 36, textAlign: 'center', color: C.faint, fontSize: 13 }}>Keine Einträge gefunden.</div>}
      </Card>
    </div>
  );
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
function HistoryView({ history, setView, setInitialSearch }) {
  return (
    <div>
      <div style={{ marginBottom: 22 }}><H1>Suchverlauf</H1><p style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>{history.length} gespeicherte Suchen</p></div>
      {!history.length && <div style={{ textAlign: 'center', padding: '80px 20px', color: C.faint }}><div style={{ fontSize: 42, marginBottom: 12, opacity: .3 }}>◷</div><p style={{ fontSize: 14 }}>Noch keine Suchanfragen</p></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.map(h => (
          <Card key={h.id} style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20, color: C.blue, opacity: .5 }}>⌕</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>{h.terms.map(t => <Tag key={t} label={t} />)}</div>
              <span style={{ fontSize: 11.5, color: C.faint }}>{h.wo ? `${h.wo} · ` : ''}{h.hits?.toLocaleString('de-DE')} Treffer</span>
            </div>
            <span style={{ fontSize: 12, color: C.faint }}>{h.time}</span>
            <button onClick={() => { setInitialSearch(h.terms[0]); setView('search'); }} style={{ background: C.blueDim, border: `1px solid ${C.blueBorder}`, color: C.blueLight, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Erneut suchen</button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('dashboard');
  const [crm, setCrm] = useState(INIT_CRM);
  const [accounts, setAccounts] = useState(INIT_ACCOUNTS);
  const [activities, setActivities] = useState(INIT_ACT);
  const [sh, setSH] = useState([]);
  const [initSearch, setInitSearch] = useState('');

  useEffect(() => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap'; document.head.appendChild(l);
    const s = document.createElement('style'); s.textContent = `*{box-sizing:border-box;margin:0;padding:0}body{background:${C.bg};font-family:'DM Sans',sans-serif;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}input::placeholder{color:rgba(232,238,248,0.26)}input:focus{border-color:rgba(75,142,240,0.55)!important;box-shadow:0 0 0 3px rgba(75,142,240,0.08)!important}select option{background:#0D1626}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:100px}`; document.head.appendChild(s);
  }, []);

  const alerts = accounts.filter(a => a.status === 'vacancy').length;
  const nav = [
    { id: 'dashboard', icon: '◧', label: 'Dashboard', badge: 0 },
    { id: 'search', icon: '⌕', label: 'Jobsuche', badge: 0 },
    { id: 'monitoring', icon: '◎', label: 'Monitoring', badge: alerts },
    { id: 'crm', icon: '◈', label: 'CRM', badge: 0 },
    { id: 'history', icon: '◷', label: 'Verlauf', badge: sh.length },
  ];
  const views = {
    dashboard: <DashboardView accounts={accounts} activities={activities} crm={crm} setView={setView} setInitialSearch={setInitSearch} />,
    search: <SearchView crm={crm} setCrm={setCrm} setActivities={setActivities} initialSearch={initSearch} clearIS={() => setInitSearch('')} setSH={setSH} />,
    monitoring: <MonitoringView accounts={accounts} setAccounts={setAccounts} setActivities={setActivities} />,
    crm: <CRMView crm={crm} setCrm={setCrm} accounts={accounts} setAccounts={setAccounts} />,
    history: <HistoryView history={sh} setView={setView} setInitialSearch={setInitSearch} />,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: "'DM Sans',sans-serif", color: C.text, overflow: 'hidden' }}>
      <div style={{ width: 220, flexShrink: 0, background: C.bg2, borderRight: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', padding: '0 10px 14px' }}>
        <div style={{ padding: '18px 8px 16px', borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: C.blue, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>◎</div>
            <span style={{ fontWeight: 700, fontSize: '1.07rem', color: C.text, letterSpacing: '-.025em' }}>Portal<span style={{ color: C.blue }}>Hub</span></span>
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, background: C.greenDim, color: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: 100, padding: '2px 7px', letterSpacing: '.06em', flexShrink: 0 }}>LIVE</span>
          </div>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', background: view === item.id ? C.blueDim : 'transparent', border: `1px solid ${view === item.id ? C.blueBorder : 'transparent'}`, color: view === item.id ? C.blueLight : C.muted, fontSize: 13, fontWeight: view === item.id ? 600 : 400, transition: 'all .12s', textAlign: 'left' }}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge > 0 && <span style={{ background: C.amberDim, color: C.amberLight, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100, border: `1px solid ${C.amberBorder}` }}>{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${C.blue},${C.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>JD</div>
            <div><div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Jana Dietrich</div><div style={{ fontSize: 11, color: C.faint }}>Professional Plan</div></div>
          </div>
        </div>
      </div>
      <main style={{ flex: 1, overflow: 'auto', padding: '26px 30px 40px' }}>
        {views[view] || views.dashboard}
      </main>
    </div>
  );
}
