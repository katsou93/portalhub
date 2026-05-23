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
  const refreshTok = cookies.vincere_refresh_token;
  if (refreshTok && clientId) {
    const test = await fetch('https://'+tenant+'.vincere.io/api/v2/company/search/fl=id?rows=1',{headers:{'id-token':token,'x-api-key':apiKey}});
    if (!test.ok && test.status === 401) {
      const r = await fetch('https://id.vincere.io/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:refreshTok})});
      if (r.ok){const d=await r.json();if(d.id_token||d.access_token){token=d.id_token||d.access_token;res.setHeader('Set-Cookie',['vincere_token='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(d.expires_in||3600)]);}}
    }
  }
  const headers = {'Content-Type':'application/json','id-token':token,'x-api-key':apiKey};

  const { firstName, lastName, email, phone, position, companyId } = req.body||{};
  if(!firstName||!lastName||!companyId) return res.status(400).json({error:'firstName, lastName, companyId required'});

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  const payload = {
    first_name: firstName,
    last_name: lastName,
    registration_date: today,
    company_id: parseInt(companyId),
  };
  if(email) payload.email = email;
  if(position) payload.job_title = position;

  try {
    const r = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{
      method:'POST', headers, body:JSON.stringify(payload)
    });
    const data = await r.json();
    if(!r.ok) return res.status(200).json({ok:false, vincereError:data});

    const contactId = data.id;

    // Add phone via PUT (separate call, non-critical)
    if(phone && contactId) {
      try {
        await fetch('https://'+tenant+'.vincere.io/api/v2/contact/'+contactId,{
          method:'PUT', headers, body:JSON.stringify({phone})
        });
      } catch(e) {}
    }

    return res.status(200).json({ok:true, id:contactId, name:firstName+' '+lastName});
  } catch(e) {
    return res.status(500).json({ok:false, error:e.message});
  }
}
