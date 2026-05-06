export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).end();

  const cookieStr = req.headers.cookie||'';
  const cookies = Object.fromEntries(cookieStr.split(';').map(c=>{
    const[k,...v]=c.trim().split('=');return[k,v.join('=')];
  }));
  const token = cookies.vincere_token;
  if(!token) return res.status(401).json({error:'not_authenticated'});

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;
  const headers = {'Content-Type':'application/json','id-token':token,'x-api-key':apiKey};
  if(appId) headers['app-id']=appId;

  const { firstName, lastName, email, phone, position, companyId, jobs } = req.body||{};
  if(!firstName||!lastName||!companyId) return res.status(400).json({error:'firstName, lastName, companyId required'});

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  // Step 1: Create contact
  const payload = { first_name:firstName, last_name:lastName, registration_date:today, company_id:parseInt(companyId) };
  if(email) payload.email = email;
  if(position) payload.job_title = position;

  const r = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{method:'POST',headers,body:JSON.stringify(payload)});
  const data = await r.json();
  if(!r.ok) return res.status(200).json({ok:false,vincereError:data});
  const contactId = data.id;

  // Step 2: Add phone to contact if available
  if(phone) {
    try {
      await fetch('https://'+tenant+'.vincere.io/api/v2/contact/'+contactId,{
        method:'PUT', headers,
        body:JSON.stringify({phone:phone})
      });
    } catch(e) {}
  }

  // Step 3: Add job attributes (Berufsfeld Engineering/IT)
  if(jobs && jobs.length > 0) {
    try {
      // Determine category: IT or Engineering based on job title keywords
      const itKeywords = /Developer|Entwickler|Administrator|DevOps|Software|Frontend|Backend|Full.?Stack|Data|Cloud|Security|Network|IT|SAP|ERP|CRM|Datenbank|Programmier/i;
      const engKeywords = /Ingenieur|Konstrukteur|Mechatroniker|Elektriker|SPS|Schlosser|Dreher|Fräser|Schweißer|Monteur|Meister|CAD|CNC|Automatisierung|Roboter|Maschinenbau|Verfahrenstechnik|Produktionstechnik|Qualitätssicherung/i;

      for(const jobTitle of jobs.slice(0,5)) {
        const category = itKeywords.test(jobTitle) ? 'IT' : (engKeywords.test(jobTitle) ? 'Engineering' : 'Engineering');

        // Get or create attribute category
        const catR = await fetch('https://'+tenant+'.vincere.io/api/v2/contact/attribute/category',{headers});
        const cats = catR.ok ? await catR.json() : {items:[]};
        const catItems = cats.items || cats.result?.items || [];

        let catId = catItems.find(c => c.name===category)?.id;

        if(!catId) {
          const newCat = await fetch('https://'+tenant+'.vincere.io/api/v2/contact/attribute/category',{
            method:'POST', headers, body:JSON.stringify({name:category})
          });
          if(newCat.ok) { const nc = await newCat.json(); catId = nc.id; }
        }

        if(!catId) continue;

        // Get or create attribute under this category
        const attrR = await fetch('https://'+tenant+'.vincere.io/api/v2/contact/attribute?category_id='+catId,{headers});
        const attrs = attrR.ok ? await attrR.json() : {items:[]};
        const attrItems = attrs.items || attrs.result?.items || [];

        let attrId = attrItems.find(a => a.name===jobTitle)?.id;

        if(!attrId) {
          const newAttr = await fetch('https://'+tenant+'.vincere.io/api/v2/contact/attribute',{
            method:'POST', headers, body:JSON.stringify({name:jobTitle, category_id:catId})
          });
          if(newAttr.ok) { const na = await newAttr.json(); attrId = na.id; }
        }

        if(!attrId) continue;

        // Assign attribute to contact
        await fetch('https://'+tenant+'.vincere.io/api/v2/contact/'+contactId+'/attribute/'+attrId,{
          method:'POST', headers, body:JSON.stringify({})
        });
      }
    } catch(e) {}
  }

  return res.status(200).json({ok:true, id:contactId, name:firstName+' '+lastName});
}
