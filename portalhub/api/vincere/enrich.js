export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();

  const { name, city } = req.query;
  if(!name) return res.status(400).json({error:'name required'});

  const result = { website: null, street: null, postcode: null, city: city||null };

  try {
    // Step 1: Search DuckDuckGo for the company's Impressum
    const query = encodeURIComponent(name + (city?' '+city:'') + ' Impressum');
    const searchUrl = 'https://html.duckduckgo.com/html/?q=' + query;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(6000),
    });
    const searchHtml = await searchRes.text();

    // Extract first organic result URL
    const linkMatch = searchHtml.match(/href="(https?://(?!duckduckgo.com)[^"]+)"/);
    if(!linkMatch) return res.status(200).json(result);

    let siteUrl = linkMatch[1];
    // Get root domain for website field
    try {
      const u = new URL(siteUrl);
      result.website = u.origin;
    } catch(e) {}

    // Step 2: Try to find Impressum page
    // First fetch the homepage to find an Impressum link
    const homeRes = await fetch(result.website, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    const homeHtml = homeRes.ok ? await homeRes.text() : '';

    // Find Impressum link on homepage
    let impressumUrl = null;
    const impMatch = homeHtml.match(/href="([^"]*(?:impressum|imprint|legal|rechtliches)[^"]*)"/i);
    if(impMatch) {
      let link = impMatch[1];
      if(link.startsWith('/')) link = result.website + link;
      else if(!link.startsWith('http')) link = result.website + '/' + link;
      impressumUrl = link;
    }

    // Step 3: Fetch Impressum page (or use homepage if no impressum link found)
    const pageToScrape = impressumUrl || siteUrl;
    const impRes = await fetch(pageToScrape, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    if(!impRes.ok) return res.status(200).json(result);
    const impHtml = await impRes.text();

    // Step 4: Extract German address from Impressum
    // German addresses: "Musterstraße 12, 12345 Musterstadt" or similar
    // Pattern: Street + number, then newline/comma, then PLZ + City
    const addressPatterns = [
      // Street number PLZ City (various separators)
      /([A-ZÄÖÜ][a-zA-ZäöüÄÖÜßs-.]+(?:str(?:aße|.)|gasse|weg|allee|ring|platz|damm|ufer|chaussee)s+d+[a-zA-Z]?)[,s

]+(d{4,5})s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜßs-]+)/gi,
      // PLZ City on its own line (after address)
      /(d{5})s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜßs-]{2,30})(?=[s

<,])/g,
    ];

    // Try full address pattern first
    const fullMatch = addressPatterns[0].exec(impHtml);
    if(fullMatch) {
      result.street = fullMatch[1].trim();
      result.postcode = fullMatch[2].trim();
      result.city = fullMatch[3].trim().replace(/s+/g,' ').split(/[
<,]/)[0].trim();
    } else {
      // Try just PLZ + City
      const plzMatch = addressPatterns[1].exec(impHtml);
      if(plzMatch) {
        result.postcode = plzMatch[1].trim();
        result.city = plzMatch[2].trim().replace(/s+/g,' ').split(/[
<,]/)[0].trim();
      }
    }

    return res.status(200).json(result);
  } catch(e) {
    return res.status(200).json({ ...result, error: e.message });
  }
}
