export default function handler(req, res) {
  const tenant      = process.env.VINCERE_TENANT;
  const clientId    = process.env.VINCERE_CLIENT_ID;
  const appId       = process.env.VINCERE_APP_ID || 'webapp';
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';

  if (!tenant || !clientId) {
    return res.status(500).send('Missing config');
  }

  // Vincere OAuth2 - requires id=appId parameter
  const authUrl = 'https://' + tenant + '.vincere.io/oauth2/authorize'
    + '?client_id=' + clientId
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&response_type=code'
    + '&id=' + appId;

  return res.redirect(302, authUrl);
}
