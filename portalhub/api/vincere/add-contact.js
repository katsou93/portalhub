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

  const { firstName, lastName, email, position, companyId } = req.body||{};
  if(!firstName || !lastName || !companyId) {
    return res.status(400).json({error:'firstName, lastName and companyId required'});
  }

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  const contactPayload = {
    first_name: firstName,
    last_name: lastName,
    registration_date: today,
    company_id: parseInt(companyId),
  };
  if(email) contactPayload.email = email;
  if(position) contactPayload.job_title = position;

  try {
    const r = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{
      method:'POST', headers, body:JSON.stringify(contactPayload)
    });
    const data = await r.json();
    if(!r.ok) return res.status(200).json({ok:false, vincereError:data});
    return res.status(200).json({ok:true, id:data.id, name:firstName+' '+lastName});
  } catch(e) {
    return res.status(500).json({ok:false, error:e.message});
  }
}
