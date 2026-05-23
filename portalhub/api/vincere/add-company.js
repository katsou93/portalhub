export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).end();

  const cookieStr = req.headers.cookie||'';
  const cookies = Object.fromEntries(cookieStr.split(';').map(c=>{
    const[k,...v]=c.trim().split('=');return[k,v.join('=')];
  }));
  let token = cookies.vincere_token;
  if(!token) return res.status(401).json({error:'not_authenticated'});

  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId  = process.env.VINCERE_APP_ID;
  const clientId = process.env.VINCERE_CLIENT_ID;

  // Auto-refresh token if needed
  async function getFreshToken() {
    // Quick test
    const test = await fetch('https://'+tenant+'.vincere.io/api/v2/company/search/fl=id?rows=1', {
      headers: {'id-token':token,'x-api-key':apiKey}
    });
    if (test.ok) return token;
    // Token expired - try refresh
    const refreshToken = cookies.vincere_refresh_token;
    if (!refreshToken || !clientId) return token;
    const r = await fetch('https://id.vincere.io/oauth2/token', {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:refreshToken})
    });
    if (!r.ok) return token;
    const data = await r.json();
    const newToken = data.id_token || data.access_token;
    if (!newToken) return token;
    const expiresIn = data.expires_in || 3600;
    // Set new token cookie
    const existing = res.getHeader('Set-Cookie') || [];
    const arr = Array.isArray(existing) ? existing : [existing];
    arr.push('vincere_token='+newToken+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+expiresIn);
    if (data.refresh_token) arr.push('vincere_refresh_token='+data.refresh_token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
    res.setHeader('Set-Cookie', arr);
    return newToken;
  }

  token = await getFreshToken();
  const headers = {'Content-Type':'application/json','id-token':token,'x-api-key':apiKey};

  const { name, city, postcode, website } = req.body||{};
  if(!name) return res.status(400).json({error:'name required'});

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  // Build company payload - registration_date required by Vincere
  const companyPayload = { 
    company_name: name, 
    registration_date: today,
    stage: 'COMPANY',
  };
  if(city||postcode) companyPayload.head_quarter = [postcode,city].filter(Boolean).join(' ');
  if(website) companyPayload.website = website;

  try {
    const compR = await fetch('https://'+tenant+'.vincere.io/api/v2/company',{
      method:'POST', headers, body:JSON.stringify(companyPayload)
    });
    const compData = await compR.json();
    console.log('Vincere company POST:', compR.status, JSON.stringify(compData).substring(0, 200));
    if(!compR.ok) return res.status(200).json({ok:false, vincereError:compData, status:compR.status});
    const companyId = compData.id;

    // Add Location (Google Maps field)
    if(city||postcode) {
      try {
        await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+companyId+'/location',{
          method:'POST', headers,
          body:JSON.stringify({
            location_name:[postcode,city].filter(Boolean).join(' '),
            city:city||'', postcode:postcode||'',
            country_code:'DE', country:'Germany'
          })
        });
      } catch(e) {}
    }

    return res.status(200).json({ok:true, id:companyId, name:compData.company_name, website: website||null});
  } catch(e) {
    return res.status(500).json({ok:false, error:e.message});
  }
}
