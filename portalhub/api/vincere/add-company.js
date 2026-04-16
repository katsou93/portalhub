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

  const { name, city, postcode } = req.body||{};
  if(!name) return res.status(400).json({error:'name required'});

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  // Step 1: Create the company
  const payload = { company_name: name, registration_date: today };
  if(city || postcode) payload.head_quarter = [postcode, city].filter(Boolean).join(' ');

  try {
    const r = await fetch('https://'+tenant+'.vincere.io/api/v2/company',{
      method:'POST', headers, body:JSON.stringify(payload)
    });
    const data = await r.json();
    if(!r.ok) return res.status(200).json({ok:false, vincereError:data});

    const companyId = data.id;

    // Step 2: Add Location (the Google Maps location field in Vincere)
    // location_name is required - use "PLZ City" or just city
    if(city || postcode) {
      const locationName = [postcode, city].filter(Boolean).join(' ');
      const locPayload = {
        location_name: locationName,
        city: city || '',
        postcode: postcode || '',
        country_code: 'DE',
        country: 'Germany',
      };
      try {
        await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+companyId+'/location',{
          method:'POST', headers, body:JSON.stringify(locPayload)
        });
      } catch(e) {
        // Location failed but company was created - not critical
      }
    }

    return res.status(200).json({ok:true, id:companyId, name:data.company_name, location:[postcode,city].filter(Boolean).join(' ')});
  } catch(e) {
    return res.status(500).json({ok:false, error:e.message});
  }
}
