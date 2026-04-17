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

  // Test 1: minimal - just first_name
  const t1 = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{
    method:'POST',headers:h,body:JSON.stringify({first_name:'Test'})
  });
  results.test1_firstname_only = {status:t1.status, body:await t1.json()};

  // Test 2: first_name + last_name
  const t2 = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{
    method:'POST',headers:h,body:JSON.stringify({first_name:'Test',last_name:'Person'})
  });
  results.test2_first_last = {status:t2.status, body:await t2.json()};

  // Test 3: first + last + email
  const t3 = await fetch('https://'+tenant+'.vincere.io/api/v2/contact',{
    method:'POST',headers:h,body:JSON.stringify({first_name:'Test',last_name:'Person',email:'test.debug@example.com'})
  });
  const t3data = await t3.json();
  results.test3_with_email = {status:t3.status, body:t3data};

  // If test3 succeeded, delete it and check what fields come back
  if(t3.ok && t3data.id) {
    const getR = await fetch('https://'+tenant+'.vincere.io/api/v2/contact/'+t3data.id,{headers:h});
    results.test3_detail = await getR.json();
    await fetch('https://'+tenant+'.vincere.io/api/v2/contact/'+t3data.id,{method:'DELETE',headers:h});
  }

  return res.status(200).json(results);
}
