import { Redis } from '@upstash/redis';

const CACHE_KEY   = 'vincere_clients_v3';
const CACHE_TTL   = 86400;

function getRedis() {
  return new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
}

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const trimmed = c.trim();
    const idx = trimmed.indexOf('=');
    if (idx > 0) cookies[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1);
  });
  return cookies;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req);
  const token   = cookies.vincere_token;
  const tenant  = process.env.VINCERE_TENANT;
  const apiKey  = process.env.VINCERE_API_KEY;
  const appId   = process.env.VINCERE_APP_ID;
  const { action } = req.query;

  function vh() {
    const h = { 'id-token': token, 'x-api-key': apiKey };
    if (appId) h['app-id'] = appId;
    return h;
  }

  // ── READ CACHE ─────────────────────────────────────────────────────────────
  if (!action) {
    if (!token) return res.status(401).json({ error: 'not_authenticated' });
    try {
      const redis  = getRedis();
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return res.status(200).json({ clients: data.clients, grouped: data.grouped, fromCache: true });
      }
      return res.status(200).json({ needsInit: true });
    } catch(e) {
      return res.status(200).json({ needsInit: true, error: e.message });
    }
  }

  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  // ── GET ONE PAGE OF IDS (called many times from frontend) ──────────────────
  // action=ids&start=N → returns 10 company IDs at offset N
  if (action === 'ids') {
    const start = parseInt(req.query.start || '0', 10);
    try {
      const r = await fetch(
        'https://' + tenant + '.vincere.io/api/v2/company/search/fl=id,name;sort=name asc?keyword=&start=' + start + '&rows=500',
        { headers: vh() }
      );
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const d = await r.json();
      const items = d.result?.items || [];
      const total = d.result?.total || 0;
      return res.status(200).json({ items: items.map(c => ({ id: c.id, name: c.name })), total, start });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── GET DETAIL FOR ONE COMPANY (called per company with stage_status) ───────
  if (action === 'detail') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const r = await fetch('https://' + tenant + '.vincere.io/api/v2/company/' + id, { headers: vh() });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const d = await r.json();
      if (!d.stage_status) return res.status(200).json({ skip: true });
      return res.status(200).json({
        id: parseInt(id),
        name: d.company_name,
        status: d.stage_status,
        website: d.website || null,
        careersite_url: d.careersite_url || null,
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── SAVE FINAL CLIENTS TO CACHE ────────────────────────────────────────────
  if (action === 'save' && req.method === 'POST') {
    try {
      const body = req.body;
      const clients = body.clients || [];
      const grouped = {};
      for (const c of clients) {
        const k = c.status || 'Kein Status';
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(c);
      }
      const redis = getRedis();
      await redis.set(CACHE_KEY, JSON.stringify({ clients, grouped, at: Date.now() }), { ex: CACHE_TTL });
      return res.status(200).json({ ok: true, total: clients.length, statuses: Object.keys(grouped) });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── CLEAR ──────────────────────────────────────────────────────────────────
  if (action === 'clear') {
    try {
      const redis = getRedis();
      await redis.del(CACHE_KEY);
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
