import { useState, useEffect, useCallback } from "react";

const C = {
  bg:'#080F1C',bg2:'#0D1626',bg3:'#121E30',bg4:'#172338',
  border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',
  text:'#E8EEF8',muted:'rgba(232,238,248,0.55)',faint:'rgba(232,238,248,0.28)',
  blue:'#4B8EF0',blueDim:'rgba(75,142,240,0.13)',blueLight:'#88B4F7',blueBorder:'rgba(75,142,240,0.25)',
  green:'#22C55E',greenDim:'rgba(34,197,94,0.11)',greenLight:'#4ADE80',greenBorder:'rgba(34,197,94,0.22)',
  amber:'#F59E0B',amberDim:'rgba(245,158,11,0.11)',amberLight:'#FCD34D',amberBorder:'rgba(245,158,11,0.25)',
  violet:'#A78BFA',violetDim:'rgba(167,139,250,0.11)',violetLight:'#C4B5FD',violetBorder:'rgba(167,139,250,0.25)',
  red:'#F87171',redDim:'rgba(248,113,113,0.10)',
};

const goVincere = () => { window.location.href = '/api/vincere/auth'; };

async function searchBA({ terms, wo, umkreis, angebotsart='1', page=1, size=50, zeitarbeit=false }) {
  const p = new URLSearchParams();
  if (terms.length) p.set('was', terms.join(' '));
  if (wo) p.set('wo', wo);
  if (umkreis > 0) p.set('umkreis', String(umkreis));
  p.set('angebotsart', angebotsart); p.set('page', String(page)); p.set('size', String(size));
  p.set('zeitarbeit', zeitarbeit ? 'true' : 'false');
  const r = await fetch('/api/jobs?' + p);
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error||'Fehler '+r.status); }
  return r.json();
}

async function fetchAI(terms) {
  const r = await fetch('/api/ai', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:500,
      messages:[{role:'user',content:'Recruiting-Experte DE. Suchbegriffe: "'+terms.join(', ')+'". Gib 8 verwandte Jobtitel auf Deutsch und einen Markt-Insight. Nur JSON: {"suggestions":["..."],"insight":"..."}'}] })
  });
  const d = await r.json();
  return JSON.parse(d.content[0].text.replace(/```json|```/g,'').trim());
}

async function loadVincereCompanies() {
  try {
    const r = await fetch('/api/vincere/companies?start=0');
    if (r.status === 401) return null;
    const d = await r.json();
    return { names: d.names || [], connected: true };
  } catch(e) { return null; }
}

async function addToVincere(name, city, postcode, website, jobText) {
  try {
    const r = await fetch('/api/vincere/add-company', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name, city, postcode, website, jobText})
    });
    if(!r.ok) return {ok:false, error:'HTTP '+r.status};
    return await r.json();
  } catch(e) { return {ok:false, error:e.message}; }
}

function fmt(d) {
  if (!d) return '—';
  const diff = Math.floor((Date.now()-new Date(d))/86400000);
  if (diff===0) return 'heute'; if (diff===1) return '1 Tag';
  if (diff<7) return diff+' Tage'; if (diff<14) return '1 Woche';
  return Math.floor(diff/7)+' Wochen';
}
function mapA(a) { return {1:'Arbeitsstelle',2:'Ausbildung',4:'Praktikum'}[a]||'Sonstiges'; }
function nameMatch(a,b) {
  if (!a||!b) return false;
  const norm = s => s.toLowerCase().replace(/gmbh & co\.? kg|gmbh & co/gi,'').replace(/\bgmbh\b|\bag\b|\bkg\b|\bse\b|\bev\b/gi,'').replace(/[^a-z0-9äöüß]/g,' ').replace(/\s+/g,' ').trim();
  const na=norm(a), nb=norm(b);
  if (!na||!nb) return false;
  if (na===nb||na.includes(nb)||nb.includes(na)) return true;
  const wa=na.split(' ').filter(w=>w.length>3), wb=nb.split(' ').filter(w=>w.length>3);
  if (!wa.length||!wb.length) return false;
  const shorter=wa.length<=wb.length?wa:wb, longer=wa.length<=wb.length?wb:wa;
  return shorter.filter(w=>longer.some(lw=>lw.includes(w)||w.includes(lw))).length/shorter.length>=0.6;
}
function parseJob(j) {
  // Extract contact text from job description fields
  const jobText = [j.arbeitgeberdarstellung, j.stellenbeschreibung, j.taetigkeit]
    .filter(Boolean).join(' ').substring(0, 500);
  return { id:j.hashId||j.refnr||Math.random().toString(36), title:j.titel||'—',
    company:j.arbeitgeber||'—', city:j.arbeitsort?.ort||'—',
    postcode:j.arbeitsort?.plz||'', country:'DE',
    jobText: jobText || '',
    posted:fmt(j.aktuelleVeroeffentlichungsdatum), type:mapA(j.angebotsart), refnr:j.refnr };
}

function Spin() { return <span style={{display:'inline-block',width:13,height:13,border:'2px solid rgba(255,255,255,0.18)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}} />; }
function Tag({label,onRemove}) {
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,background:C.blueDim,border:'1px solid '+C.blueBorder,color:C.blueLight,fontSize:12.5,padding:'4px 11px',borderRadius:100,fontWeight:500}}>
    {label}{onRemove&&<span onClick={onRemove} style={{cursor:'pointer',opacity:.55,fontSize:13}}>×</span>}
  </span>;
}
function Chip({label,active,onClick,col=C.blue}) {
  return <button onClick={onClick} style={{background:active?col+'20':'rgba(255,255,255,0.04)',color:active?col:C.muted,border:'1px solid '+(active?col+'44':C.border2),padding:'5px 14px',borderRadius:100,fontSize:12,fontWeight:active?600:400,cursor:'pointer',fontFamily:'inherit'}}>{label}</button>;
}
function Card({children,style}) { return <div style={{background:C.bg2,border:'1px solid '+C.border2,borderRadius:14,overflow:'hidden',...style}}>{children}</div>; }

function VBadge({company,names,onAdd,adding}) {
  const inV = names.some(n=>nameMatch(n,company));
  if (inV) return <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100,background:'rgba(34,197,94,0.15)',color:C.greenLight,border:'1px solid '+C.greenBorder,whiteSpace:'nowrap'}}>✓ Im Vincere</span>;
  return <button onClick={onAdd} disabled={adding} style={{background:adding?'rgba(75,142,240,0.3)':C.blue,color:'#fff',border:'none',borderRadius:8,padding:'5px 13px',fontSize:11.5,fontWeight:700,cursor:adding?'wait':'pointer',fontFamily:'inherit',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
    {adding?<><Spin/>…</>:'+ Vincere'}
  </button>;
}

function JobCard({job,names,onAdd,addingId}) {
  const [hov,setHov]=useState(false);
  const init=(job.company||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
  const inV=names.some(n=>nameMatch(n,job.company));
  const baUrl=job.refnr?'https://www.arbeitsagentur.de/jobsuche/jobdetail/'+job.refnr:null;
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      onClick={e=>{if(baUrl&&!e.target.closest('button'))window.open(baUrl,'_blank');}}
      style={{background:hov?C.bg3:C.bg2,border:'1px solid '+(inV?C.greenBorder:C.border2),borderRadius:12,padding:'13px 16px',display:'flex',alignItems:'center',gap:13,transition:'all .15s',cursor:baUrl?'pointer':'default'}}>
      <div style={{width:40,height:40,borderRadius:9,background:inV?C.greenDim:C.bg4,border:'1px solid '+(inV?C.greenBorder:C.border2),display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:inV?C.greenLight:C.muted,flexShrink:0}}>{init}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13.5,fontWeight:600,color:C.text,marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{job.title}{baUrl&&<span style={{fontSize:10,color:C.faint,marginLeft:8}}>↗</span>}</div>
        <div style={{fontSize:12,color:C.muted}}>{job.company} · {job.city}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}}>
        <span style={{fontSize:11,color:C.faint}}>{job.posted}</span>
        <span style={{fontSize:10.5,background:C.bg3,border:'1px solid '+C.border,color:C.faint,padding:'2px 7px',borderRadius:5}}>{job.type}</span>
        <VBadge company={job.company} names={names} onAdd={()=>onAdd(job.company, job.city, job.postcode, null, job.jobText)} adding={addingId===job.company} />
      </div>
    </div>
  );
}

function SearchView({names,onAdd,addingId,setSH,connected}) {
  const [input,setInput]=useState('');
  const [terms,setTerms]=useState([]);
  const [wo,setWo]=useState('');
  const [umkreis,setUmkreis]=useState(50);
  const [angebotsart,setAngebotsart]=useState('1');
  const [zeitarbeit,setZeitarbeit]=useState(false);
  const [loading,setLoading]=useState(false);
  const [jobs,setJobs]=useState([]);
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(1);
  const [error,setError]=useState('');
  const [searched,setSearched]=useState(false);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiData,setAiData]=useState(null);
  const [showF,setShowF]=useState(false);
  const [bulkAdding,setBulkAdding]=useState(false);
  const [bulkDone,setBulkDone]=useState(0);

  const doSearch=useCallback(async(t,pg=1,append=false)=>{
    if(!t.length)return; setLoading(true); setError('');
    try {
      const d=await searchBA({terms:t,wo:wo||'',umkreis:wo?umkreis:0,angebotsart,page:pg,size:50,zeitarbeit});
      const parsed=(d.stellenangebote||[]).map(j=>parseJob(j));
      setJobs(prev=>append?[...prev,...parsed]:parsed);
      setTotal(d.maxErgebnisse||0); setPage(pg); setSearched(true);
      setSH(h=>[{id:Date.now(),terms:t,hits:d.maxErgebnisse||parsed.length,wo:wo||'',time:new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})},...h.slice(0,19)]);
    } catch(e){setError(e.message);setSearched(true);}
    setLoading(false);
  },[wo,umkreis,angebotsart,zeitarbeit]);

  const run=()=>{const v=input.trim();const all=v&&!terms.includes(v)?[...terms,v]:terms;if(v){setTerms(all);setInput('');}if(all.length)doSearch(all,1,false);};

  const addAll=async()=>{
    const newJobs=jobs.filter(j=>j.company&&j.company!=='—'&&!names.some(n=>nameMatch(n,j.company)));
    const seen=new Set(); const unique=newJobs.filter(j=>{if(seen.has(j.company))return false;seen.add(j.company);return true;});
    if(!unique.length)return; setBulkAdding(true); setBulkDone(0);
    for(const j of unique){await onAdd(j.company,j.city,j.postcode,null,j.jobText);setBulkDone(d=>d+1);}
    setBulkAdding(false);
  };

  const newC=[...new Set(jobs.map(j=>j.company).filter(c=>c&&c!=='—'&&!names.some(n=>nameMatch(n,c))))];
  const pages=Math.ceil(total/50);
  const RADII=[0,25,50,100,200];
  const AARTEN=[{val:'1',label:'Arbeitsstellen'},{val:'2',label:'Ausbildung'},{val:'4',label:'Praktikum'}];

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h1 style={{fontFamily:'Instrument Serif,Georgia,serif',fontSize:'1.9rem',fontWeight:400,color:C.text}}>Jobsuche</h1>
        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
          <span style={{fontSize:13,color:C.muted}}>Bundesagentur für Arbeit · Live-Daten</span>
          <span style={{fontSize:10,fontWeight:700,background:C.greenDim,color:C.greenLight,border:'1px solid '+C.greenBorder,borderRadius:100,padding:'2px 8px'}}>LIVE</span>
          {connected&&<span style={{fontSize:10,fontWeight:700,background:C.violetDim,color:C.violetLight,border:'1px solid '+C.violetBorder,borderRadius:100,padding:'2px 8px'}}>Vincere verbunden</span>}
        </div>
      </div>
      <Card style={{padding:16,marginBottom:12}}>
        <div style={{display:'flex',gap:8,marginBottom:terms.length?12:0}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Berufsbezeichnung eingeben…"
            style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid '+C.border2,borderRadius:9,padding:'11px 14px',fontSize:13.5,color:C.text,fontFamily:'inherit',outline:'none'}}/>
          <button onClick={run} disabled={loading} style={{background:loading?'rgba(75,142,240,0.4)':C.blue,color:'#fff',border:'none',borderRadius:9,padding:'11px 24px',fontSize:14,fontWeight:700,cursor:loading?'wait':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:8}}>
            {loading?<><Spin/>Suche…</>:'Suchen'}
          </button>
          <button onClick={async()=>{if(!terms.length||aiLoading)return;setAiLoading(true);setAiData(null);try{setAiData(await fetchAI(terms));}catch(e){}setAiLoading(false);}}
            disabled={!terms.length||aiLoading}
            style={{background:terms.length?C.violetDim:'rgba(255,255,255,0.03)',border:'1px solid '+(terms.length?C.violetBorder:C.border2),color:terms.length?C.violetLight:C.faint,borderRadius:9,padding:'11px 16px',fontSize:13,fontWeight:600,cursor:terms.length?'pointer':'not-allowed',fontFamily:'inherit',display:'flex',alignItems:'center',gap:8}}>
            {aiLoading?<><Spin/>KI…</>:'✦ KI'}
          </button>
          <button onClick={()=>setShowF(f=>!f)} style={{background:showF?C.blueDim:'rgba(255,255,255,0.04)',border:'1px solid '+(showF?C.blueBorder:C.border2),color:showF?C.blueLight:C.muted,borderRadius:9,padding:'11px 15px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>⚙ {showF?'▲':'▼'}</button>
        </div>
        {terms.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:showF?14:0}}>{terms.map(t=><Tag key={t} label={t} onRemove={()=>setTerms(ts=>ts.filter(x=>x!==t))}/>)}</div>}
        {showF&&<div style={{borderTop:'1px solid '+C.border,paddingTop:14,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:C.faint}}>Ort:</span>
            <input value={wo} onChange={e=>setWo(e.target.value)} placeholder="Stadt oder PLZ"
              style={{width:240,background:'rgba(255,255,255,0.04)',border:'1px solid '+C.border2,borderRadius:8,padding:'7px 12px',fontSize:13,color:C.text,fontFamily:'inherit',outline:'none'}}/>
            {RADII.map(r=><Chip key={r} label={r===0?'exakt':r+' km'} active={umkreis===r} onClick={()=>setUmkreis(r)}/>)}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:C.faint}}>Typ:</span>
            {AARTEN.map(a=><Chip key={a.val} label={a.label} active={angebotsart===a.val} onClick={()=>setAngebotsart(a.val)} col={C.violet}/>)}
          </div>
          <label onClick={()=>setZeitarbeit(z=>!z)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
            <div style={{width:36,height:20,borderRadius:100,background:zeitarbeit?C.blue:'rgba(255,255,255,0.08)',border:'1px solid '+(zeitarbeit?C.blue:C.border2),position:'relative',transition:'all .2s'}}>
              <div style={{position:'absolute',top:2,left:zeitarbeit?18:2,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
            </div>
            <span style={{fontSize:13,color:C.muted}}>Zeitarbeitsstellen einschließen</span>
          </label>
        </div>}
      </Card>
      {aiData&&<Card style={{padding:16,marginBottom:12,border:'1px solid '+C.violetBorder}}>
        <div style={{fontSize:13,fontWeight:700,color:C.violetLight,marginBottom:8}}>✦ KI-Vorschläge</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
          {aiData.suggestions?.map(s=><button key={s} onClick={()=>!terms.includes(s)&&setTerms(t=>[...t,s])}
            style={{background:'rgba(167,139,250,0.08)',border:'1px dashed rgba(167,139,250,0.3)',color:C.violetLight,fontSize:12,padding:'4px 12px',borderRadius:100,cursor:'pointer',fontFamily:'inherit'}}>+ {s}</button>)}
        </div>
        {aiData.insight&&<div style={{fontSize:12.5,color:C.muted}}>{aiData.insight}</div>}
      </Card>}
      {searched&&<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        <span style={{fontSize:13.5,fontWeight:600,color:C.text}}>{loading?'Suche läuft…':error?'Fehler':total.toLocaleString('de-DE')+' Stellen gefunden'}</span>
        {connected&&!loading&&newC.length>0&&<button onClick={addAll} disabled={bulkAdding}
          style={{background:bulkAdding?'rgba(167,139,250,0.3)':C.violet,color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:12.5,fontWeight:700,cursor:bulkAdding?'wait':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:8}}>
          {bulkAdding?<><Spin/>{bulkDone}/{newC.length} …</>:'+ Alle '+newC.length+' neuen → Vincere'}
        </button>}
        <div style={{flex:1}}/>
      </div>}
      {error&&<Card style={{padding:18,background:C.redDim,marginBottom:12}}><div style={{fontSize:13.5,color:C.red}}>⚠ {error}</div></Card>}
      {!searched&&<div style={{textAlign:'center',padding:'80px 20px',color:C.faint}}>
        <div style={{fontSize:44,marginBottom:14,opacity:.3}}>⌕</div>
        <p style={{fontSize:15,color:C.muted}}>Suchbegriff eingeben und suchen</p>
        {connected&&<p style={{fontSize:12.5,marginTop:6}}>Grün = bereits im Vincere · Blau = noch nicht drin</p>}
      </div>}
      <div style={{display:'flex',flexDirection:'column',gap:7}}>
        {jobs.map(j=><JobCard key={j.id} job={j} names={names} onAdd={onAdd} addingId={addingId}/>)}
      </div>
      {jobs.length>0&&page<pages&&<div style={{textAlign:'center',paddingTop:20}}>
        <button onClick={()=>doSearch(terms,page+1,true)} disabled={loading}
          style={{background:C.bg3,border:'1px solid '+C.border2,color:C.text,borderRadius:9,padding:'10px 28px',fontSize:13,cursor:'pointer',fontFamily:'inherit',display:'inline-flex',alignItems:'center',gap:9}}>
          {loading?<><Spin/>Laden…</>:'Weitere 50 · noch '+(total-jobs.length)+' verbleibend'}
        </button>
      </div>}
    </div>
  );
}

function MonitoringView({connected}) {
  const [clients,setClients]=useState([]);
  const [grouped,setGrouped]=useState({});
  const [loading,setLoading]=useState(false);
  const [openGroups,setOpenGroups]=useState({});
  const [scanning,setScanning]=useState({});
  const [scanResults,setScanResults]=useState({});
  const [scanningAll,setScanningAll]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0});
  const [loadProgress,setLoadProgress]=useState({processed:0,total:0});

  useEffect(()=>{
    if(!connected)return;
    setLoading(true);
    setLoadProgress({processed:0,total:0,phase:'Prüfe Cache…'});

    const applyClients = (clients) => {
      const grouped = {};
      for(const co of clients){const k=co.status;if(!grouped[k])grouped[k]=[];grouped[k].push(co);}
      setClients(clients);setGrouped(grouped);
      setOpenGroups(prev=>{const o={...prev};Object.keys(grouped).forEach(k=>{if(!(k in o))o[k]=true;});return o;});
    };

    const run = async () => {
      // 1. Check cache
      const cr = await fetch('/api/vincere/clients');
      const cd = await cr.json();
      if(cd.fromCache && cd.clients){ applyClients(cd.clients); setLoading(false); return; }

      // 2. Scan: each call processes 100 companies fully on the server
      // Sequential IDs + details, no rate limiting, always within timeout
      const allClients = [];
      let offset = 0;
      let done = false;
      let total = 0;

      setLoadProgress({processed:0,total:0,phase:'Scanne Vincere CRM…'});

      while(!done){
        try{
          const r = await fetch('/api/vincere/clients?action=scan&offset='+offset);
          if(!r.ok) break;
          const d = await r.json();
          (d.clients||[]).forEach(co=>allClients.push(co));
          done = d.done || false;
          offset = d.nextOffset || (offset+100);
          if(d.total) total = d.total;
          setLoadProgress({processed:offset,total:total||offset+1,phase:allClients.length+' Kunden gefunden…'});
          if(allClients.length>0) applyClients([...allClients]);
        }catch(e){ break; }
      }

      // 3. Save to Redis cache
      if(allClients.length>0){
        await fetch('/api/vincere/clients?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clients:allClients})});
      }
      setLoading(false);
    };

    run().catch(()=>setLoading(false));
  },[connected]);

  const scanCompany=async(company)=>{
    const url=company.careersite_url||company.website;
    if(!url){setScanResults(p=>({...p,[company.id]:{error:'Keine Website',jobs:[]}}));return;}
    setScanning(p=>({...p,[company.id]:true}));
    try{
      const r=await fetch('/api/vincere/scrape?url='+encodeURIComponent(url));
      let data;
      try{ data=await r.json(); }catch(e){ data={jobs:[],error:'Keine gültige Antwort vom Server'}; }
      setScanResults(p=>({...p,[company.id]:data}));
    }catch(e){setScanResults(p=>({...p,[company.id]:{error:e.message,jobs:[]}}));}
    setScanning(p=>({...p,[company.id]:false}));
  };

  const scanAll=async()=>{
    const withWeb=clients.filter(c=>c.website||c.careersite_url);
    setScanningAll(true);setProgress({done:0,total:withWeb.length});
    for(const c of withWeb){await scanCompany(c);setProgress(p=>({...p,done:p.done+1}));}
    setScanningAll(false);
  };

  function getStyle(status){
    const s=(status||'').toUpperCase();
    if(s.includes('HOT')||s.includes('PRIO'))return{bg:'rgba(239,68,68,0.12)',border:'rgba(239,68,68,0.35)',text:'#FCA5A5'};
    if(s.includes('KEY'))return{bg:'rgba(34,197,94,0.12)',border:'rgba(34,197,94,0.35)',text:'#4ADE80'};
    if(s.includes('UPLOAD'))return{bg:'rgba(14,165,233,0.12)',border:'rgba(14,165,233,0.35)',text:'#7DD3FC'};
    if(s.includes('ACCOUNT')&&!s.includes('PRE'))return{bg:'rgba(167,139,250,0.12)',border:'rgba(167,139,250,0.35)',text:'#C4B5FD'};
    if(s.includes('PRE'))return{bg:'rgba(245,158,11,0.12)',border:'rgba(245,158,11,0.35)',text:'#FCD34D'};
    return{bg:'rgba(255,255,255,0.05)',border:'rgba(255,255,255,0.12)',text:C.text};
  }

  if(!connected)return(
    <div style={{textAlign:'center',padding:'80px 20px'}}>
      <div style={{fontSize:44,marginBottom:16,opacity:.3}}>📊</div>
      <p style={{fontSize:15,color:C.muted,marginBottom:16}}>Bitte zuerst Vincere verbinden</p>
      <button onClick={goVincere} style={{background:C.amber,color:'#000',border:'none',borderRadius:9,padding:'10px 22px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Vincere verbinden →</button>
    </div>
  );

  const totalJobs=Object.values(scanResults).reduce((s,r)=>s+(r.jobs?.length||0),0);
  const withWeb=clients.filter(c=>c.website||c.careersite_url).length;

  return(
    <div>
      <div style={{marginBottom:20,display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontFamily:'Instrument Serif,Georgia,serif',fontSize:'1.9rem',fontWeight:400,color:C.text}}>Monitoring</h1>
          <p style={{color:C.muted,fontSize:13,marginTop:4}}>{clients.length} Kunden · {withWeb} mit Website · {totalJobs > 0 ? totalJobs+' Stellen gefunden' : ''}</p>
        </div>
        {!loading&&clients.length>0&&!scanningAll&&(
          <button onClick={scanAll} style={{background:C.violet,color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:8}}>
            🔍 Alle {withWeb} scannen
          </button>
        )}
        {scanningAll&&<div style={{background:C.bg2,border:'1px solid '+C.violetBorder,borderRadius:9,padding:'10px 20px',fontSize:13,color:C.violetLight,display:'flex',alignItems:'center',gap:10}}><Spin/>{progress.done}/{progress.total} gescannt…</div>}
      </div>

      {loading&&<div style={{padding:'12px 18px',background:C.bg2,border:'1px solid '+C.border2,borderRadius:12,display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
        <Spin/>
        <span style={{fontSize:13,color:C.muted}}>{loadProgress.phase||'Lade…'}{loadProgress.total>0?' · '+loadProgress.processed+'/'+loadProgress.total:''}</span>
      </div>}

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([status,companies])=>{
          const isOpen=openGroups[status];
          const st=getStyle(status);
          const gJobs=companies.reduce((s,c)=>s+(scanResults[c.id]?.jobs?.length||0),0);
          return(
            <div key={status} style={{background:C.bg2,border:'1px solid '+C.border2,borderRadius:14,overflow:'hidden'}}>
              <div onClick={()=>setOpenGroups(p=>({...p,[status]:!p[status]}))}
                style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',userSelect:'none'}}>
                <span style={{fontSize:12,color:C.faint}}>{isOpen?'▼':'▶'}</span>
                <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:100,background:st.bg,color:st.text,border:'1px solid '+st.border,whiteSpace:'nowrap'}}>{status}</span>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>{companies.length} Unternehmen</span>
                {gJobs>0&&<span style={{fontSize:12,color:C.greenLight,background:C.greenDim,border:'1px solid '+C.greenBorder,padding:'2px 8px',borderRadius:100}}>✓ {gJobs} Stellen</span>}
                <div style={{flex:1}}/>
                <span style={{fontSize:12,color:C.faint}}>{companies.filter(c=>c.website||c.careersite_url).length} mit Website</span>
              </div>
              {isOpen&&<div style={{borderTop:'1px solid '+C.border}}>
                {companies.map(company=>{
                  const result=scanResults[company.id];
                  const isScanning=scanning[company.id];
                  const hasWeb=company.website||company.careersite_url;
                  return(
                    <div key={company.id} style={{padding:'12px 18px',borderBottom:'1px solid '+C.border}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                        <div style={{flex:1,minWidth:180}}>
                          <div style={{fontSize:13.5,fontWeight:600,color:C.text}}>{company.name}</div>
                          {hasWeb&&<a href={company.careersite_url||company.website} target="_blank" rel="noreferrer" style={{fontSize:11,color:C.faint,textDecoration:'none'}} onClick={e=>e.stopPropagation()}>
                            ↗ {(company.careersite_url||company.website||'').replace(/^https?:\/\/www\./,'').substring(0,50)}
                          </a>}
                          {!hasWeb&&<span style={{fontSize:11,color:C.red,opacity:.6}}>Keine Website</span>}
                        </div>
                        {!result&&<button onClick={()=>scanCompany(company)} disabled={isScanning||!hasWeb}
                          style={{background:hasWeb?C.blue:'rgba(255,255,255,0.05)',color:hasWeb?'#fff':C.faint,border:'none',borderRadius:7,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:hasWeb?'pointer':'not-allowed',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
                          {isScanning?<><Spin/>Scanne…</>:'🔍 Scannen'}
                        </button>}
                        {result&&!result.error&&<span style={{fontSize:12,color:C.greenLight,whiteSpace:'nowrap'}}>✓ {result.jobs?.length||0} Stellen</span>}
                        {result?.error&&<span style={{fontSize:11,color:C.red,opacity:.7}}>{result.error}</span>}
                      </div>
                      {result?.jobs?.length>0&&<div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4}}>
                        {result.jobs.map((job,ji)=>(
                          <a key={ji} href={job.url} target="_blank" rel="noreferrer"
                            style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:C.bg4,borderRadius:7,textDecoration:'none',border:'1px solid '+C.border}}>
                            <span style={{fontSize:12,color:C.text,flex:1}}>{job.title}</span>
                            <span style={{fontSize:10,color:C.faint}}>↗</span>
                          </a>
                        ))}
                      </div>}
                    </div>
                  );
                })}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard({acts,connected,vCount,setView}) {
  return(
    <div>
      <div style={{marginBottom:26}}>
        <p style={{color:C.muted,fontSize:13,marginBottom:4}}>{new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        <h1 style={{fontFamily:'Instrument Serif,Georgia,serif',fontSize:'1.9rem',fontWeight:400,color:C.text}}>Guten Morgen — <em style={{fontStyle:'italic',color:C.blue}}>Ihr Überblick.</em></h1>
      </div>
      {!connected&&<div style={{marginBottom:22,padding:'16px 20px',background:'rgba(245,158,11,0.08)',border:'1px solid '+C.amberBorder,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:C.amberLight,marginBottom:4}}>⚠ Vincere nicht verbunden</div>
          <div style={{fontSize:12.5,color:C.muted}}>Verbinde dein Vincere CRM um alle Funktionen zu nutzen</div>
        </div>
        <button onClick={goVincere} style={{background:C.amber,color:'#000',border:'none',borderRadius:9,padding:'10px 22px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>Vincere verbinden →</button>
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:22}}>
        {[{v:connected?vCount:'—',l:'Firmen im Vincere',c:C.violet},{v:'∞',l:'Verfügbare Stellen (BA)',c:C.green},{v:connected?'✓':'✗',l:'Vincere Status',c:connected?C.green:C.amber},{v:acts.length,l:'Aktivitäten',c:C.blue}]
          .map((s,i)=><div key={i} style={{background:C.bg2,border:'1px solid '+C.border2,borderRadius:12,padding:'18px 20px'}}>
            <div style={{fontSize:'2rem',fontWeight:700,color:s.c,fontFamily:'Instrument Serif,Georgia,serif',lineHeight:1,marginBottom:6}}>{s.v}</div>
            <div style={{fontSize:12,color:C.muted}}>{s.l}</div>
          </div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:14}}>
        <Card>
          <div style={{padding:'13px 18px',borderBottom:'1px solid '+C.border,fontSize:13,fontWeight:600,color:C.text}}>Letzte Aktivitäten</div>
          <div style={{padding:'8px 12px'}}>
            {acts.length===0&&<div style={{padding:'20px',textAlign:'center',color:C.faint,fontSize:13}}>Noch keine Aktivitäten</div>}
            {acts.map(a=><div key={a.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 6px',borderBottom:'1px solid '+C.border}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:a.col,marginTop:5,flexShrink:0}}/>
              <div style={{flex:1,fontSize:13,color:C.text}}>{a.text}</div>
              <span style={{fontSize:11,color:C.faint,flexShrink:0}}>{a.time}</span>
            </div>)}
          </div>
        </Card>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <Card style={{padding:18}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Schnellsuche</div>
            <button onClick={()=>setView('search')} style={{width:'100%',background:C.blue,color:'#fff',border:'none',borderRadius:8,padding:'10px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>⌕ Jetzt suchen</button>
          </Card>
          {connected&&<Card style={{padding:18,border:'1px solid '+C.violetBorder}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Vincere CRM</div>
            <div style={{fontSize:28,fontWeight:700,color:C.violet,fontFamily:'Instrument Serif,Georgia,serif'}}>{vCount}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>Unternehmen im System</div>
            <div style={{marginTop:12,display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(34,197,94,0.1)',borderRadius:8,border:'1px solid '+C.greenBorder}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:C.green}}/>
              <span style={{fontSize:12,color:C.greenLight}}>Verbunden</span>
            </div>
          </Card>}
        </div>
      </div>
    </div>
  );
}

function History({sh,setView}) {
  return(
    <div>
      <h1 style={{fontFamily:'Instrument Serif,Georgia,serif',fontSize:'1.9rem',fontWeight:400,color:C.text,marginBottom:22}}>Suchverlauf</h1>
      {!sh.length&&<div style={{textAlign:'center',padding:'80px 20px',color:C.faint}}>Noch keine Suchen</div>}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {sh.map(h=><Card key={h.id} style={{padding:'13px 18px',display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:20,color:C.blue,opacity:.5}}>⌕</span>
          <div style={{flex:1}}>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:4}}>{h.terms.map(t=><Tag key={t} label={t}/>)}</div>
            <span style={{fontSize:11.5,color:C.faint}}>{h.wo?h.wo+' · ':''}{h.hits?.toLocaleString('de-DE')} Treffer</span>
          </div>
          <span style={{fontSize:12,color:C.faint}}>{h.time}</span>
          <button onClick={()=>setView('search')} style={{background:C.blueDim,border:'1px solid '+C.blueBorder,color:C.blueLight,borderRadius:8,padding:'6px 14px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Erneut suchen</button>
        </Card>)}
      </div>
    </div>
  );
}

export default function App() {
  const [view,setView]=useState('dashboard');
  const [acts,setActs]=useState([]);
  const [sh,setSH]=useState([]);
  const [connected,setConnected]=useState(false);
  const [vNames,setVNames]=useState([]);
  const [addingId,setAddingId]=useState(null);

  useEffect(()=>{
    const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap';document.head.appendChild(l);
    const s=document.createElement('style');s.textContent='*{box-sizing:border-box;margin:0;padding:0}body{background:#080F1C;font-family:"DM Sans",sans-serif;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}input::placeholder{color:rgba(232,238,248,0.26)}input:focus{border-color:rgba(75,142,240,0.55)!important}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:100px}';document.head.appendChild(s);
    const p=new URLSearchParams(window.location.search);
    const crm=p.get('crm');
    if(crm)window.history.replaceState({},'','/');
    if(crm==='connected'){
      setConnected(true);
      setActs(a=>[{id:Date.now(),type:'crm',text:'Vincere CRM verbunden ✓',time:new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}),col:C.green},...a]);
    }
    loadVincereCompanies().then(d=>{
      if(!d)return;
      setConnected(true);
      if(d.names&&d.names.length>0)setVNames(d.names);
    });
  },[]);

  const handleAdd=async(name, city, postcode, website, jobText)=>{
    setAddingId(name);
    try{
      const result = await addToVincere(name, city, postcode, website, jobText);
      if(result && result.ok){
        setVNames(p=>[...p,name]);
        const loc=[postcode,city].filter(Boolean).join(' ');
        const contactInfo = result.contact ? ' · '+result.contact.name+(result.contact.email?' ('+result.contact.email+')':'') : '';
        setActs(a=>[{id:Date.now(),text:'✓ '+name+(loc?' · '+loc:'')+contactInfo,time:new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}),col:C.violet},...a]);
      } else {
        const err=result?.vincereError?JSON.stringify(result.vincereError).substring(0,60):(result?.error||'Fehler');
        setActs(a=>[{id:Date.now(),text:'⚠ '+name+': '+err,time:new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}),col:C.red},...a]);
      }
      return result?.ok||false;
    }catch(e){
      setActs(a=>[{id:Date.now(),text:'⚠ Fehler: '+e.message,time:new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}),col:C.red},...a]);
      return false;
    }finally{
      setAddingId(null);
    }
  };

  const nav=[
    {id:'dashboard',icon:'◧',label:'Dashboard'},
    {id:'search',icon:'⌕',label:'Jobsuche'},
    {id:'monitoring',icon:'📊',label:'Monitoring'},
    {id:'history',icon:'◷',label:'Verlauf',badge:sh.length},
  ];

  return(
    <div style={{display:'flex',height:'100vh',background:C.bg,fontFamily:"'DM Sans',sans-serif",color:C.text,overflow:'hidden'}}>
      <div style={{width:220,flexShrink:0,background:C.bg2,borderRight:'1px solid '+C.border2,display:'flex',flexDirection:'column',padding:'0 10px 14px'}}>
        <div style={{padding:'18px 8px 16px',borderBottom:'1px solid '+C.border,marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:32,height:32,background:C.blue,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>◎</div>
            <span style={{fontWeight:700,fontSize:'1.07rem',color:C.text,letterSpacing:'-.025em'}}>Portal<span style={{color:C.blue}}>Hub</span></span>
            <span style={{marginLeft:'auto',fontSize:9,fontWeight:700,background:C.greenDim,color:C.greenLight,border:'1px solid '+C.greenBorder,borderRadius:100,padding:'2px 7px',flexShrink:0}}>LIVE</span>
          </div>
        </div>
        <nav style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
          {nav.map(item=>(
            <button key={item.id} onClick={()=>setView(item.id)}
              style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 12px',borderRadius:9,cursor:'pointer',fontFamily:'inherit',
                background:view===item.id?C.blueDim:'transparent',border:'1px solid '+(view===item.id?C.blueBorder:'transparent'),
                color:view===item.id?C.blueLight:C.muted,fontSize:13,fontWeight:view===item.id?600:400,transition:'all .12s',textAlign:'left'}}>
              <span style={{fontSize:14,width:16,textAlign:'center',flexShrink:0}}>{item.icon}</span>
              <span style={{flex:1}}>{item.label}</span>
              {item.badge>0&&<span style={{background:C.amberDim,color:C.amberLight,fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:100,border:'1px solid '+C.amberBorder}}>{item.badge}</span>}
            </button>
          ))}
          <div style={{marginTop:8,borderTop:'1px solid '+C.border,paddingTop:8}}>
            {connected
              ?<div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px'}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:C.green}}/>
                  <span style={{fontSize:12,color:C.greenLight}}>Vincere aktiv</span>
                </div>
              :<button onClick={goVincere} style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 12px',borderRadius:9,background:'rgba(245,158,11,0.1)',border:'1px solid '+C.amberBorder,color:C.amberLight,fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                  <span>🔗</span><span>Vincere verbinden</span>
                </button>}
          </div>
        </nav>
        <div style={{borderTop:'1px solid '+C.border,paddingTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:9,padding:'6px 4px'}}>
            <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,'+C.blue+','+C.violet+')',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>JD</div>
            <div>
              <div style={{fontSize:12.5,fontWeight:600,color:C.text}}>Jana Dietrich</div>
              <div style={{fontSize:11,color:C.faint}}>Professional Plan</div>
            </div>
          </div>
        </div>
      </div>
      <main style={{flex:1,overflow:'auto',padding:'26px 30px 40px'}}>
        {view==='dashboard'&&<Dashboard acts={acts} connected={connected} vCount={vNames.length} setView={setView}/>}
        {view==='search'&&<SearchView names={vNames} onAdd={handleAdd} addingId={addingId} setSH={setSH} connected={connected}/>}
        {view==='monitoring'&&<MonitoringView connected={connected}/>}
        {view==='history'&&<History sh={sh} setView={setView}/>}
      </main>
    </div>
  );
}
