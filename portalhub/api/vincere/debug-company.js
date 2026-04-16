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

  // Test different ways to set location - find what Vincere actually saves
  const tests = [
    { company_name:'TEST Loc 1', registration_date:today, head_quarter:'73630 Remshalden' },
    { company_name:'TEST Loc 2', registration_date:today, head_quarter:'Remshalden' },
  ];

  const results = [];
  for(const payload of tests){
    const r = await fetch('https://'+tenant+'.vincere.io/api/v2/company',{method:'POST',headers:h,body:JSON.stringify(payload)});
    const created = await r.json();
    if(r.ok && created.id){
      const dr = await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+created.id,{headers:h});
      const detail = await dr.json();
      // Delete test
      await fetch('https://'+tenant+'.vincere.io/api/v2/company/'+created.id,{method:'DELETE',headers:h});
      results.push({
        payload_head_quarter: payload.head_quarter,
        saved_head_quarter: detail.head_quarter,
        all_location_fields: {
          head_quarter: detail.head_quarter,
          phone: detail.phone,
          external_map: detail.external_map,
        }
      });
    } else {
      results.push({payload_head_quarter: payload.head_quarter, error: created});
    }
  }
  return res.status(200).json(results);
}
