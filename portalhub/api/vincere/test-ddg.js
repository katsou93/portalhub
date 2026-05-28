export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  
  const results = {};
  
  // Test 1: Simple fetch to httpbin
  try {
    const r1 = await fetch('https://httpbin.org/get', {
      signal: (() => { const c = new AbortController(); setTimeout(()=>c.abort(),3000); return c.signal; })()
    });
    results.httpbin = { status: r1.status, ok: r1.ok };
  } catch(e) { results.httpbin = { error: e.message }; }
  
  // Test 2: DDG POST
  try {
    const r2 = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body: 'q=test&b=&kl=de-de',
      signal: (() => { const c = new AbortController(); setTimeout(()=>c.abort(),5000); return c.signal; })()
    });
    const html = await r2.text();
    results.ddg = { status: r2.status, htmlLen: html.length, first100: html.substring(0,100) };
  } catch(e) { results.ddg = { error: e.message }; }
  
  return res.status(200).json(results);
}
