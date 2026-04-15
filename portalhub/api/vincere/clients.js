import { Redis } from '@upstash/redis';

const CACHE_KEY = 'vincere_clients_v6';
const CACHE_TTL = 86400;
const STATUS_MAP = { 5:'2 - Key Account', 6:'3 - Account', 8:'4 - Pre Account', 9:'Hot Lead', 10:'Upload', 13:'HOT - PRIO' };

function getRedis() { return new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN }); }

function parseCookies(req) {
  const c = {};
  (req.headers.cookie||'').split(';').forEach(s=>{const t=s.trim();const i=t.indexOf('=');if(i>0)c[t.slice(0,i).trim()]=t.slice(i+1);});
  return c;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();
  const cookies = parseCookies(req);
  const token = cookies.vincere_token;
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;
  const { action } = req.query;
  function vh(){ const h={'id-token':token,'x-api-key':apiKey}; if(appId)h['app-id']=appId; return h; }

  // READ CACHE
  if(!action){
    if(!token) return res.status(401).json({error:'not_authenticated'});
    try{
      const cached = await getRedis().get(CACHE_KEY);
      if(cached){ const d=typeof cached==='string'?JSON.parse(cached):cached; return res.status(200).json({clients:d.clients,grouped:d.grouped,fromCache:true}); }
      return res.status(200).json({needsInit:true});
    }catch(e){ return res.status(200).json({needsInit:true}); }
  }

  if(!token) return res.status(401).json({error:'not_authenticated'});

  // GET IDS PAGE - returns up to 10 IDs from Vincere
  if(action==='ids'){
    const start = parseInt(req.query.start||'0',10);
    const r = await fetch('https://'+tenant+'.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start='+start+'&rows=500',{headers:vh()});
    if(!r.ok) return res.status(r.status).json({error:'search failed'});
    const d = await r.json();
    return res.status(200).json({items:(d.result?.items||[]).map(c=>({id:c.id,name:c.name})),total:d.result?.total||0,start});
  }

  // BATCH - 20 IDs max, parallel calls, completes well within 10s timeout
  if(action==='batch'){
    const ids = (req.query.ids||'').split(',').map(Number).filter(Boolean).slice(0,20);
    if(!ids.length) return res.status(400).json({error:'ids required'});
    const results = (await Promise.all(
      ids.map(async id=>{
        try{
          const r = await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+id,{headers:vh(),signal:AbortSignal.timeout(8000)});
          if(!r.ok) return null;
          const d = await r.json();
          const label = STATUS_MAP[d.status_id];
          if(!label) return null;
          return {id,name:d.company_name,status:label,status_id:d.status_id,website:d.website||null,careersite_url:d.careersite_url||null};
        }catch(e){return null;}
      })
    )).filter(Boolean);
    return res.status(200).json({clients:results});
  }

  // SAVE TO CACHE
  if(action==='save'&&req.method==='POST'){
    const clients = req.body?.clients||[];
    const grouped = {};
    for(const c of clients){const k=c.status||'Kein Status';if(!grouped[k])grouped[k]=[];grouped[k].push(c);}
    await getRedis().set(CACHE_KEY,JSON.stringify({clients,grouped,at:Date.now()}),{ex:CACHE_TTL});
    return res.status(200).json({ok:true,total:clients.length,statuses:Object.keys(grouped)});
  }

  // CLEAR
  if(action==='clear'){ await getRedis().del(CACHE_KEY); return res.status(200).json({ok:true}); }

  return res.status(400).json({error:'Unknown action'});
}
