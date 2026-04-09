export default function handler(req, res) {
  const tenant     = process.env.VINCERE_TENANT;
  const clientId   = process.env.VINCERE_CLIENT_ID;
  const appId      = process.env.VINCERE_APP_ID;
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';

  if (!tenant || !clientId) {
    return res.status(500).send('Missing: VINCERE_TENANT=' + tenant + ' VINCERE_CLIENT_ID=' + clientId);
  }

  // Vincere OAuth2 authorize URL - id parameter is the app_id
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
  });
  if (appId) params.set('id', appId);

  const authUrl = 'https://' + tenant + '.vincere.io/oauth2/authorize?' + params.toString();
  return res.redirect(302, authUrl);
}
