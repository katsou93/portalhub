export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, error } = req.query;
  if (error) return res.redirect('/?crm=error&reason=' + encodeURIComponent(error));
  if (!code)  return res.status(400).json({ error: 'No code' });

  const clientId    = process.env.VINCERE_CLIENT_ID;
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';

  try {
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
    try { tokenData = JSON.parse(raw); }
    catch (e) {
      console.error('Token not JSON:', raw.substring(0, 200));
      return res.redirect('/?crm=error&reason=token_parse_error');
    }

    if (!tokenRes.ok) {
      console.error('Token failed:', JSON.stringify(tokenData));
      return res.redirect('/?crm=error&reason=' + encodeURIComponent(tokenData.error || 'token_failed'));
    }

    const idToken = tokenData.id_token || tokenData.access_token;
    if (!idToken) return res.redirect('/?crm=error&reason=no_token');

    // Token erfolgreich — direkt als verbunden markieren, kein extra API-Test
    res.setHeader('Set-Cookie', [
      'vincere_token=' + idToken + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600',
      'vincere_domain=' + (process.env.VINCERE_TENANT || '') + '; Path=/; Secure; SameSite=Lax; Max-Age=3600',
    ]);

    return res.redirect('/?crm=connected');

  } catch (e) {
    console.error('Callback error:', e.message);
    return res.redirect('/?crm=error&reason=' + encodeURIComponent(e.message));
  }
}
