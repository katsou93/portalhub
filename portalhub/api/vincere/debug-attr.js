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
  const results = {};

  // Test various attribute endpoints
  const eps = [
    '/api/v2/contact/attribute/category',
    '/api/v2/contact/attribute',  
    '/api/v2/meta/contact/attribute',
    '/api/v2/contact/attribute/category?name=Engineering',
  ];
  for(const ep of eps) {
    try {
      const r = await fetch('https://'+tenant+'.vincere.io'+ep, {headers:h});
      const t = await r.text();
      results[ep] = {status:r.status, body:t.substring(0,300)};
    } catch(e) { results[ep]={error:e.message}; }
  }
  return res.status(200).json(results);
}
