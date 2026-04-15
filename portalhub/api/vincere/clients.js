import { Redis } from '@upstash/redis';

const CACHE_KEY = 'vincere_clients_v7';
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

  // SCAN: loads 10 ID-pages sequentially + fetches their details
  // offset=0 → companies 0-99, offset=100 → 100-199, etc.
  // All sequential → zero rate limiting, always completes within 10s
  if(action==='scan'){
    const offset = parseInt(req.query.offset||'0', 10);
    const pageSize = 10; // Vincere returns 10 per page
    const pagesPerScan = 10; // 10 pages × 10 companies = 100 companies per scan
    const found = [];

    for(let p = 0; p < pagesPerScan; p++){
      const start = offset + p * pageSize;
      try{
        // Load IDs for this page
        const sr = await fetch(
          'https://'+tenant+'.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start='+start+'&rows=500',
          {headers:vh(), signal:AbortSignal.timeout(5000)}
        );
        if(!sr.ok) continue;
        const sd = await sr.json();
        const items = sd.result?.items || [];
        const total = sd.result?.total || 0;

        // Fetch detail for each ID on this page
        for(const item of items){
          try{
            const dr = await fetch(
              'https://'+tenant+'.vincere.io/api/v2/company/'+item.id,
              {headers:vh(), signal:AbortSignal.timeout(5000)}
            );
            if(!dr.ok) continue;
            const dd = await dr.json();
            const label = STATUS_MAP[dd.status_id];
            if(label) found.push({id:item.id,name:dd.company_name||item.name,status:label,status_id:dd.status_id,website:dd.website||null,careersite_url:dd.careersite_url||null});
          }catch(e){}
        }

        // If this was the last page of results, signal done
        if(items.length === 0 || start + pageSize >= total){
          return res.status(200).json({clients:found, nextOffset: offset + (p+1)*pageSize, done:true, total});
        }
      }catch(e){}
    }

    return res.status(200).json({clients:found, nextOffset: offset + pagesPerScan * pageSize, done:false});
  }

  // SAVE TO CACHE
  if(action==='save'&&req.method==='POST'){
    const clients = req.body?.clients||[];
    const grouped = {};
    for(const c of clients){const k=c.status;if(!grouped[k])grouped[k]=[];grouped[k].push(c);}
    await getRedis().set(CACHE_KEY,JSON.stringify({clients,grouped,at:Date.now()}),{ex:CACHE_TTL});
    return res.status(200).json({ok:true,total:clients.length,statuses:Object.keys(grouped)});
  }

  // CLEAR
  if(action==='clear'){ await getRedis().del(CACHE_KEY); return res.status(200).json({ok:true}); }

  return res.status(400).json({error:'Unknown action'});
}
