export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, name } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    // Fetch the website
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

    // Find career page link if this is the main website
    const careerPatterns = [
      /href="([^"]*(?:karriere|career|jobs|stellenangebot|vacancies|bewerbung)[^"]*)"/gi,
      /href='([^']*(?:karriere|career|jobs|stellenangebot|vacancies|bewerbung)[^']*)'/gi,
    ];

    const careerLinks = new Set();
    for (const pattern of careerPatterns) {
      let m;
      while ((m = pattern.exec(html)) !== null) {
        let link = m[1];
        if (link.startsWith('/')) {
          const base = new URL(url);
          link = base.origin + link;
        } else if (!link.startsWith('http')) {
          continue;
        }
        careerLinks.add(link);
      }
    }

    // Extract job listings from current page
    const jobs = extractJobs(html, url);

    // If no jobs found and career links exist, fetch the first career page
    if (jobs.length === 0 && careerLinks.size > 0) {
      const careerUrl = [...careerLinks][0];
      try {
        const cr = await fetch(careerUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(8000),
        });
        if (cr.ok) {
          const careerHtml = await cr.text();
          const careerJobs = extractJobs(careerHtml, careerUrl);
          return res.status(200).json({ jobs: careerJobs, careerUrl, source: 'career_page', careerLinks: [...careerLinks].slice(0, 5) });
        }
      } catch(e) {}
    }

    return res.status(200).json({ jobs, source: 'main_page', careerLinks: [...careerLinks].slice(0, 5) });

  } catch(e) {
    return res.status(200).json({ jobs: [], error: e.message, url });
  }
}

function extractJobs(html, pageUrl) {
  const jobs = [];
  const seen = new Set();

  // Pattern 1: JSON-LD structured data (most reliable)
  const jsonldPattern = /<script[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonldPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'JobPosting') {
          const title = item.title || item.name || '';
          const url = item.url || '';
          if (title && !seen.has(title)) {
            seen.add(title);
            jobs.push({ title, url: url || pageUrl, source: 'jsonld' });
          }
        }
      }
    } catch(e) {}
  }

  // Pattern 2: Common job listing link patterns
  const linkPattern = /<a[^>]+href="([^"]*(?:job|stelle|career|position|vacanci|bewerbung)[^"]*)"[^>]*>([^<]{5,80})<\/a>/gi;
  while ((m = linkPattern.exec(html)) !== null) {
    let link = m[1], text = m[2].trim().replace(/\s+/g, ' ');
    if (text.length < 5 || text.length > 100) continue;
    if (text.toLowerCase().includes('apply') && text.length < 10) continue;
    if (link.startsWith('/')) {
      try { link = new URL(pageUrl).origin + link; } catch(e) {}
    } else if (!link.startsWith('http')) continue;
    if (!seen.has(text)) {
      seen.add(text);
      jobs.push({ title: text, url: link, source: 'link' });
    }
  }

  // Pattern 3: Common class-based job titles  
  const titlePattern = /class="[^"]*(?:job[-_]?title|position[-_]?name|stelle[-_]?titel|jobtitel|job-name)[^"]*"[^>]*>([^<]{5,100})</gi;
  while ((m = titlePattern.exec(html)) !== null) {
    const text = m[1].trim();
    if (!seen.has(text) && text.length > 4) {
      seen.add(text);
      jobs.push({ title: text, url: pageUrl, source: 'class' });
    }
  }

  return jobs.slice(0, 30);
}
