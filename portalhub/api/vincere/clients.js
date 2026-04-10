import { kv } from '@vercel/kv';

const CACHE_KEY   = 'vincere_clients_v2';
const IDS_KEY     = 'vincere_ids_v2';
const CACHE_TTL   = 86400; // 24 hours

async function getVincereHeaders(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  const token  = cookies.vincere_token;
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;
  const headers = { 'id-token': token, 'x-api-key': apiKey };
  if (appId) headers['app-id'] = appId;
  return { token, tenant, headers };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
      .map(c => { const i = c.indexOf('='); return [c.slice(0,i).trim(), c.slice(i+1)]; })
  );
  if (!cookies.vincere_token) return res.status(401).json({ error: 'not_authenticated' });

  const { action, batch } = req.query;

  // ─── ACTION: READ CACHE ───────────────────────────────────────────────────
  if (!action) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) {
        return res.status(200).json({ clients: cached.clients, grouped: cached.grouped, fromCache: true, cachedAt: cached.at });
      }
      // Check if IDs are loaded (init done but details still loading)
      const ids = await kv.get(IDS_KEY);
      if (ids) return res.status(200).json({ needsLoad: true, totalIds: ids.length, message: 'IDs loaded, details loading…' });
      return res.status(200).json({ needsInit: true, message: 'Cache empty, run init first' });
    } catch(e) {
      return res.status(200).json({ needsInit: true, error: e.message });
    }
  }

  // ─── ACTION: INIT — Load all IDs ─────────────────────────────────────────
  if (action === 'init') {
    const { token, tenant, headers } = await getVincereHeaders(req);
    if (!token) return res.status(401).json({ error: 'not_authenticated' });

    try {
      // Clear old cache
      await kv.del(CACHE_KEY);
      await kv.del(IDS_KEY);

      // Load all company IDs from search
      const allIds = [];
      let start = 0, total = 9999;

      while (start < total) {
        const r = await fetch(
          'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name,status;sort=name asc?keyword=&start=' + start + '&rows=500',
          { headers }
        );
        if (!r.ok) break;
        const d = await r.json();
        const items = d.result?.items || [];
        total = d.result?.total || 0;
        items.forEach(c => allIds.push({ id: c.id, name: c.name }));
        if (items.length < 500) break;
        start += 500;
      }

      // Store IDs in KV for 25h
      await kv.set(IDS_KEY, allIds, { ex: 90000 });
      return res.status(200).json({ ok: true, totalIds: allIds.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── ACTION: LOAD BATCH — Fetch details for batch N ───────────────────────
  if (action === 'load') {
    const { token, tenant, headers } = await getVincereHeaders(req);
    if (!token) return res.status(401).json({ error: 'not_authenticated' });

    const batchN    = parseInt(batch || '0', 10);
    const batchSize = 25;

    try {
      // Get IDs from KV
      const allIds = await kv.get(IDS_KEY);
      if (!allIds) return res.status(400).json({ error: 'Run init first' });

      const batchIds = allIds.slice(batchN * batchSize, (batchN + 1) * batchSize);
      const hasMore  = (batchN + 1) * batchSize < allIds.length;

      // Fetch details in parallel
      const newClients = (await Promise.all(
        batchIds.map(async item => {
          try {
            const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + item.id, { headers });
            if (!r.ok) return null;
            const d = await r.json();
            if (!d.stage_status) return null;
            return { id: item.id, name: d.company_name || item.name, status: d.stage_status, website: d.website || null, careersite_url: d.careersite_url || null };
          } catch(e) { return null; }
        })
      )).filter(Boolean);

      // Get existing partial cache and append
      const existing = await kv.get(CACHE_KEY + '_partial') || [];
      const allClients = [...existing, ...newClients];

      if (!hasMore) {
        // Build final grouped cache
        const grouped = {};
        for (const c of allClients) {
          const k = c.status || 'Kein Status';
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(c);
        }
        await kv.set(CACHE_KEY, { clients: allClients, grouped, at: Date.now() }, { ex: CACHE_TTL });
        await kv.del(CACHE_KEY + '_partial');
        await kv.del(IDS_KEY);
        return res.status(200).json({ done: true, total: allClients.length, hasMore: false });
      } else {
        await kv.set(CACHE_KEY + '_partial', allClients, { ex: 90000 });
        return res.status(200).json({ done: false, hasMore: true, nextBatch: batchN + 1, loaded: allClients.length, totalIds: allIds.length, processed: (batchN + 1) * batchSize });
      }
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── ACTION: CLEAR CACHE ─────────────────────────────────────────────────
  if (action === 'clear') {
    try {
      await kv.del(CACHE_KEY);
      await kv.del(IDS_KEY);
      await kv.del(CACHE_KEY + '_partial');
      return res.status(200).json({ ok: true, message: 'Cache cleared' });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
