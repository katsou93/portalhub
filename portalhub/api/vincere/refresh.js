// Helper: refresh Vincere token using refresh_token cookie
export async function refreshToken(req, res) {
  const cookieStr = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieStr.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    }).filter(([k]) => k)
  );

  const refreshTok = cookies.vincere_refresh_token;
  const clientId = process.env.VINCERE_CLIENT_ID;
  if (!refreshTok || !clientId) return null;

  try {
    const r = await fetch('https://id.vincere.io/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshTok,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const newToken = data.id_token || data.access_token;
    if (!newToken) return null;

    // Set new cookies on response
    const cookieOpts = '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400';
    res.setHeader('Set-Cookie', [
      'vincere_token=' + newToken + cookieOpts,
    ]);
    return newToken;
  } catch (e) {
    return null;
  }
}

// Helper: get valid token (with auto-refresh)
export async function getToken(req, res) {
  const cookieStr = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieStr.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    }).filter(([k]) => k)
  );

  const token = cookies.vincere_token;
  if (!token) return null;

  // Test if token is valid with a lightweight call
  const tenant = process.env.VINCERE_TENANT;
  const apiKey = process.env.VINCERE_API_KEY;
  const testRes = await fetch(`https://${tenant}.vincere.io/api/v2/company/search/fl=id?rows=1`, {
    headers: { 'id-token': token, 'x-api-key': apiKey },
  });

  if (testRes.ok) return token;
  if (testRes.status === 401) {
    // Token expired - try refresh
    return await refreshToken(req, res);
  }
  return token; // other error, return as-is
}
