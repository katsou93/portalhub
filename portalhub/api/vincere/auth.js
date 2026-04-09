export default function handler(req, res) {
  const clientId    = process.env.VINCERE_CLIENT_ID;
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';

  if (!clientId) return res.status(500).send('Missing VINCERE_CLIENT_ID');

  // Vincere OAuth uses id.vincere.io as the auth server (not tenant URL)
  const authUrl = 'https://id.vincere.io/oauth2/authorize'
    + '?client_id=' + clientId
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&response_type=code';

  return res.redirect(302, authUrl);
}
