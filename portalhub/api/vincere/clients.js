import { Redis } from '@upstash/redis';

const CACHE_KEY   = 'vincere_clients_v2';
const IDS_KEY     = 'vincere_ids_v2';
const PARTIAL_KEY = 'vincere_partial_v2';

function getRedis() {
  return new Redis({
    url:   process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [k.slice(0,i).trim(), c.slice(i+1)]; })
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookieStr = req.headers.cookie || '';
  const cookies = {};
  cookieStr.split(';').forEach(c => {
    const trimmed = c.trim();
    const idx = trimmed.indexOf('=');
    if (idx > 0) cookies[trimmed.slice(0,idx).trim()] = trimmed.slice(idx+1);
  });
  const token  = cookies.vincere_token;
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;
  const { action, batch } = req.query;

  function vincereHeaders() {
    const h = { 'id-token': token, 'x-api-key': apiKey };
    if (appId) h['app-id'] = appId;
    return h;
  }

  // ─── READ CACHE ───────────────────────────────────────────────────────────
  if (!action) {
    if (!token) return res.status(401).json({ error: 'not_authenticated' });
    try {
      const redis  = getRedis();
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return res.status(200).json({ clients: data.clients, grouped: data.grouped, fromCache: true });
      }
      const ids = await redis.get(IDS_KEY);
      if (ids) {
        const arr = typeof ids === 'string' ? JSON.parse(ids) : ids;
        return res.status(200).json({ needsLoad: true, totalIds: arr.length });
      }
      return res.status(200).json({ needsInit: true });
    } catch(e) {
      return res.status(200).json({ needsInit: true, error: e.message });
    }
  }

  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  // ─── INIT: Load all IDs ───────────────────────────────────────────────────
  if (action === 'init') {
    try {
      const redis = getRedis();
      await redis.del(CACHE_KEY);
      await redis.del(IDS_KEY);
      await redis.del(PARTIAL_KEY);

      const allIds = [];
      let start = 0, total = 9999;
      while (start < total) {
        const r = await fetch(
          'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name?keyword=&start=' + start + '&rows=500',
          { headers: vincereHeaders() }
        );
        if (!r.ok) {
          const errText = await r.text().catch(() => '');
          console.error('[init] search error', r.status, errText.substring(0, 100));
          // 401 = token expired, stop and return what we have
          if (r.status === 401) break;
          // Other errors: try to continue
          start += 500;
          continue;
        }
        const d = await r.json();
        const items = d.result?.items || [];
        total = d.result?.total || 0;
        console.log('[init] loaded', start, '/', total, '- got', items.length, 'items');
        items.forEach(c => allIds.push({ id: c.id, name: c.name }));
        if (items.length < 500) break;
        start += 500;
      }

      await redis.set(IDS_KEY, JSON.stringify(allIds), { ex: 90000 });
      return res.status(200).json({ ok: true, totalIds: allIds.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── LOAD BATCH ───────────────────────────────────────────────────────────
  if (action === 'load') {
    const batchN    = parseInt(batch || '0', 10);
    const batchSize = 25;
    try {
      const redis  = getRedis();
      const raw    = await redis.get(IDS_KEY);
      if (!raw) return res.status(400).json({ error: 'Run init first' });
      const allIds  = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const slice   = allIds.slice(batchN * batchSize, (batchN + 1) * batchSize);
      const hasMore = (batchN + 1) * batchSize < allIds.length;

      const newClients = (await Promise.all(
        slice.map(async item => {
          try {
            const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers: vincereHeaders() });
            if (!r.ok) return null;
            const d = await r.json();
            if (!d.stage_status) return null;
            return { id: item.id, name: d.company_name || item.name, status: d.stage_status, website: d.website || null, careersite_url: d.careersite_url || null };
          } catch(e) { return null; }
        })
      )).filter(Boolean);

      const existingRaw = await redis.get(PARTIAL_KEY);
      const existing    = existingRaw ? (typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw) : [];
      const allClients  = [...existing, ...newClients];

      if (!hasMore) {
        const grouped = {};
        for (const c of allClients) {
          const k = c.status || 'Kein Status';
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(c);
        }
        await redis.set(CACHE_KEY, JSON.stringify({ clients: allClients, grouped, at: Date.now() }), { ex: 86400 });
        await redis.del(PARTIAL_KEY);
        await redis.del(IDS_KEY);
        return res.status(200).json({ done: true, total: allClients.length, hasMore: false });
      }

      await redis.set(PARTIAL_KEY, JSON.stringify(allClients), { ex: 90000 });
      return res.status(200).json({ done: false, hasMore: true, nextBatch: batchN + 1, loaded: allClients.length, totalIds: allIds.length, processed: (batchN + 1) * batchSize });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── DEBUG: test one search page ────────────────────────────────────────
  if (action === 'debug') {
    // Test with rows=500 to see how many items come back
    const r = await fetch(
      'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name?keyword=&start=0&rows=500',
      { headers: vincereHeaders() }
    );
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch(e) {}
    return res.status(200).json({
      httpStatus: r.status,
      itemCount: parsed?.result?.items?.length,
      total: parsed?.result?.total,
      raw: text.substring(0, 200),
      token: token ? token.substring(0,10)+'...' : 'MISSING'
    });
  }

  // ─── CLEAR ────────────────────────────────────────────────────────────────
  if (action === 'clear') {
    try {
      const redis = getRedis();
      await redis.del(CACHE_KEY);
      await redis.del(IDS_KEY);
      await redis.del(PARTIAL_KEY);
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
