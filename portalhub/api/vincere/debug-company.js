export default async function handler(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie||'').split(';').map(c=>c.trim()).filter(Boolean)
      .map(c=>{const i=c.indexOf('=');return[c.slice(0,i).trim(),c.slice(i+1)];})
  );
  const token = cookies.vincere_token;
  if(!token) return res.status(401).json({error:'not_authenticated'});
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const appId = process.env.VINCERE_APP_ID;
  const h = {'Content-Type':'application/json','id-token':token,'x-api-key':apiKey};
  if(appId) h['app-id']=appId;

  // Look at the locations endpoint for an existing company (Remmert ID 14625)
  const results = {};

  // 1. Check what locations endpoint exists
  const locR = await fetch('https://'+tenant+'.vincere.io/api/v2/company/14625/location',{headers:h});
  results.location_endpoint = {status: locR.status, body: await locR.text().then(t=>t.substring(0,300))};

  // 2. Try POST to location endpoint
  const postR = await fetch('https://'+tenant+'.vincere.io/api/v2/company/14625/location',{
    method:'POST', headers:h,
    body:JSON.stringify({address:'Borgholzhausener Str. 7',city:'Löhne',country_code:'DE',postcode:'32584'})
  });
  results.location_post = {status: postR.status, body: await postR.text().then(t=>t.substring(0,300))};

  return res.status(200).json(results);
}
