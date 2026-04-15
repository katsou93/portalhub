export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ jobs: [], error: 'url required' });

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!r.ok) return res.status(200).json({ jobs: [], error: 'HTTP ' + r.status, url });

    const html = await r.text();
    const baseUrl = new URL(url).origin;

    // Find career page links
    const careerPatterns = /href="([^"]*(?:karriere|career|jobs|stellenangebot|vacancies|bewerbung|stellen)[^"]*)"/gi;
    const careerLinks = new Set();
    let m;
    while ((m = careerPatterns.exec(html)) !== null) {
      let link = m[1];
      if (link.startsWith('/')) link = baseUrl + link;
      else if (!link.startsWith('http')) continue;
      if (!link.includes('xing') && !link.includes('linkedin') && !link.includes('facebook')) careerLinks.add(link);
    }

    // Extract jobs from current page
    let jobs = extractJobs(html, url, baseUrl);

    // If no jobs found and we have career links, try the first one
    if (jobs.length === 0 && careerLinks.size > 0) {
      const careerUrl = [...careerLinks][0];
      try {
        const cr = await fetch(careerUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(8000),
        });
        if (cr.ok) {
          const careerHtml = await cr.text();
          jobs = extractJobs(careerHtml, careerUrl, new URL(careerUrl).origin);
          return res.status(200).json({ jobs, careerUrl, source: 'career_page' });
        }
      } catch(e) {}
    }

    return res.status(200).json({ jobs, source: 'main_page', careerLinks: [...careerLinks].slice(0, 5) });

  } catch(e) {
    return res.status(200).json({ jobs: [], error: e.message, url });
  }
}

function extractJobs(html, pageUrl, baseUrl) {
  const jobs = [];
  const seen = new Set();

  // Pattern 1: JSON-LD structured data
  const jsonldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonldRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const list = item['@type'] === 'ItemList' ? (item.itemListElement||[]).map(e=>e.item||e) : [item];
        for (const job of list) {
          if (job['@type'] === 'JobPosting') {
            const title = job.title || job.name || '';
            const jobUrl = job.url || pageUrl;
            if (title && !seen.has(title)) { seen.add(title); jobs.push({ title, url: jobUrl, source: 'jsonld' }); }
          }
        }
      }
    } catch(e) {}
  }

  // Pattern 2: Links with job keywords
  const linkRe = /<a[^>]+href="([^"]*(?:\/job[s\/]|\/stelle[n\/]|\/career|\/position|\/vacanci)[^"]*)"[^>]*>([^<]{5,80})<\/a>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    let link = m[1], text = m[2].trim().replace(/\s+/g, ' ');
    if (text.length < 5 || text.length > 100) continue;
    if (link.startsWith('/')) link = baseUrl + link;
    else if (!link.startsWith('http')) continue;
    if (!seen.has(text)) { seen.add(text); jobs.push({ title: text, url: link, source: 'link' }); }
  }

  // Pattern 3: Common job title classes
  const classRe = /class="[^"]*(?:job[-_]?title|position[-_]?name|stelle[-_]?titel|jobtitel)[^"]*"[^>]*>([^<]{5,100})</gi;
  while ((m = classRe.exec(html)) !== null) {
    const text = m[1].trim();
    if (!seen.has(text) && text.length > 4) { seen.add(text); jobs.push({ title: text, url: pageUrl, source: 'class' }); }
  }

  return jobs.slice(0, 50);
}
