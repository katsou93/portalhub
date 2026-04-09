// Vincere OAuth2 – Step 2: Token Exchange (route: /api/vincere/callback)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?crm=error&reason=' + encodeURIComponent(error));
  }
  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  const domain = process.env.VINCERE_DOMAIN;
  const clientId = process.env.VINCERE_CLIENT_ID;
  const apiKey = process.env.VINCERE_API_KEY;
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';

  try {
    const tokenRes = await fetch(`https://${domain}.vincere.io/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Token exchange failed:', tokenData);
      return res.redirect('/?crm=error&reason=' + encodeURIComponent(JSON.stringify(tokenData)));
    }

    const idToken = tokenData.id_token || tokenData.access_token;

    const testRes = await fetch(`https://${domain}.vincere.io/api/v2/company/find?query=*&limit=1`, {
      headers: { 'id-token': idToken, 'x-api-key': apiKey }
    });

    const status = testRes.ok ? 'connected' : 'token_error';

    res.setHeader('Set-Cookie', [
      `vincere_token=${idToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
      `vincere_status=${status}; Path=/; Secure; SameSite=Lax; Max-Age=3600`
    ]);

    res.redirect('/?crm=' + status);
  } catch (e) {
    console.error('Vincere callback error:', e);
    res.redirect('/?crm=error&reason=' + encodeURIComponent(e.message));
  }
}
