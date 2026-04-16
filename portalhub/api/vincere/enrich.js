export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  try {
    const query = encodeURIComponent('"' + name + '" ' + (city||'') + ' Impressum');
    const googleUrl = 'https://www.google.com/search?q=' + query + '&hl=de&gl=de&num=3';

    const r = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
    });

    if(!r.ok) return res.status(200).json({url:null, error:'Google '+r.status});

    const html = await r.text();

    // Extract first non-Google organic result
    const matches = [...html.matchAll(/href="/url?q=(https?://(?!(?:www.google|youtube|facebook|wikipedia|xing|linkedin|kununu|instagram|twitter|tiktok)[^"]*)[^"&]+)/g)];

    if(!matches.length) return res.status(200).json({url:null, error:'no results'});

    const url = decodeURIComponent(matches[0][1]);
    const website = new URL(url).origin;

    return res.status(200).json({ url, website });
  } catch(e) {
    return res.status(200).json({url:null, error:e.message});
  }
}
