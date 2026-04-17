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

  const { name, city, postcode, website, jobText } = req.body||{};
  if(!name) return res.status(400).json({error:'name required'});

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  // ── STEP 1: Create company ────────────────────────────────────────────────
  const companyPayload = { company_name: name, registration_date: today };
  if(city||postcode) companyPayload.head_quarter = [postcode,city].filter(Boolean).join(' ');
  if(website) companyPayload.website = website;

  const compR = await fetch('https://'+tenant+'.vincere.io/api/v2/company',{
    method:'POST',headers,body:JSON.stringify(companyPayload)
  });
  const compData = await compR.json();
  if(!compR.ok) return res.status(200).json({ok:false,vincereError:compData});

  const companyId = compData.id;
  const result = {ok:true, id:companyId, name:compData.company_name, contact:null};

  // ── STEP 2: Add Location ──────────────────────────────────────────────────
  if(city||postcode) {
    try {
      await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+companyId+'/location',{
        method:'POST',headers,
        body:JSON.stringify({location_name:[postcode,city].filter(Boolean).join(' '),city:city||'',postcode:postcode||'',country_code:'DE',country:'Germany'})
      });
    }catch(e){}
  }

  // ── STEP 3: Find contact (call find-contact endpoint) ─────────────────────
  try {
    const baseUrl = process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://portalhub3.vercel.app';
    const contactParams = new URLSearchParams({name, city:city||''});
    if(website) contactParams.set('website', website);
    if(jobText) contactParams.set('jobText', jobText);

    const findR = await fetch(baseUrl+'/api/vincere/find-contact?'+contactParams, {
      headers:{'Cookie':req.headers.cookie||''},
      signal:AbortSignal.timeout(8000)
    });
    const contact = findR.ok ? await findR.json() : null;

    // ── STEP 4: Create contact in Vincere if found ────────────────────────
    if(contact && contact.firstName && contact.lastName) {
      const contactPayload = {
        first_name: contact.firstName,
        last_name: contact.lastName,
        registration_date: today,
        company_id: companyId,
      };
      if(contact.email) contactPayload.email = contact.email;
      if(contact.position) contactPayload.job_title = contact.position;

      const contactR = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{
        method:'POST',headers,body:JSON.stringify(contactPayload)
      });
      const contactData = await contactR.json();

      if(contactR.ok) {
        result.contact = {
          id: contactData.id,
          name: contact.firstName+' '+contact.lastName,
          email: contact.email||null,
          position: contact.position||null,
          source: contact.source||null,
        };
      }
    }
  }catch(e){}

  return res.status(200).json(result);
}
