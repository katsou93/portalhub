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

  const today = new Date().toISOString().split('T')[0]+'T00:00:00.000Z';

  // Create company with head_quarter as string, then GET it back to see all fields
  const createR = await fetch('https://'+tenant+'.vincere.io/api/v2/company',{
    method:'POST', headers:h,
    body:JSON.stringify({company_name:'TEST Adresse Debug',registration_date:today,head_quarter:'93342 Kirchroth'})
  });
  const created = await createR.json();

  if(!createR.ok) return res.status(200).json({createFailed:created});

  // GET the company back to see what fields were saved
  const getR = await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+created.id,{headers:h});
  const detail = await getR.json();

  // Delete test company
  await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+created.id,{method:'DELETE',headers:h});

  // Return ALL fields to see what was saved
  return res.status(200).json({created,detail});
}
