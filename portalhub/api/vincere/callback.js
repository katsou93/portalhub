export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, error } = req.query;
  if (error) return res.redirect('/?crm=error&reason=' + encodeURIComponent(error));
  if (!code) return res.status(400).json({ error: 'No code' });

  const tenant      = process.env.VINCERE_TENANT;
  const clientId    = process.env.VINCERE_CLIENT_ID;
  const apiKey      = process.env.VINCERE_API_KEY;
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';

  try {
    // Token exchange - uses id.vincere.io (not tenant URL)
    const tokenRes = await fetch('https://id.vincere.io/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        client_id:    clientId,
        redirect_uri: redirectUri,
      }).toString()
    });

    const raw = await tokenRes.text();

    let tokenData;
    try {
      tokenData = JSON.parse(raw);
    } catch (e) {
      console.error('Token response not JSON:', raw.substring(0, 300));
      return res.redirect('/?crm=error&reason=token_not_json');
    }

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', JSON.stringify(tokenData));
      return res.redirect('/?crm=error&reason=' + encodeURIComponent(JSON.stringify(tokenData)));
    }

    const idToken = tokenData.id_token || tokenData.access_token;
    if (!idToken) {
      console.error('No token in response:', JSON.stringify(tokenData));
      return res.redirect('/?crm=error&reason=no_token');
    }

    // Test the token against company API
    const testRes = await fetch('https://' + tenant + '.vincere.io/api/v2/company/find?query=*&limit=1', {
      headers: { 'id-token': idToken, 'x-api-key': apiKey }
    });

    const status = testRes.ok ? 'connected' : 'token_error';
    if (!testRes.ok) {
      const testBody = await testRes.text().catch(() => '');
      console.error('API test failed:', testRes.status, testBody.substring(0, 200));
    }

    res.setHeader('Set-Cookie', [
      'vincere_token=' + idToken + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600',
      'vincere_status=' + status + '; Path=/; Secure; SameSite=Lax; Max-Age=3600'
    ]);

    return res.redirect('/?crm=' + status);
  } catch (e) {
    console.error('Vincere callback error:', e.message);
    return res.redirect('/?crm=error&reason=' + encodeURIComponent(e.message));
  }
}
