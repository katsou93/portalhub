export default function handler(req, res) {
  const tenant = process.env.VINCERE_TENANT;
  const clientId = pauth.jsrocess.env.VINCERE_CLIENT_ID;
  const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub3.vercel.app/api/vincere/callback';
  if (!tenant || !clientId) return res.status(500).json({ error: 'Vincere not configured' });
  res.redirect(`https://${tenant}.vincere.io/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`);
}
