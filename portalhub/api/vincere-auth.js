// Vincere OAuth2 – Step 1: Redirect to Vincere Login
export default function handler(req, res) {
    const domain = process.env.VINCERE_DOMAIN;
    const clientId = process.env.VINCERE_CLIENT_ID;
    const redirectUri = process.env.VINCERE_REDIRECT_URI || 'https://portalhub-coral.vercel.app/api/vincere-callback';

  if (!domain || !clientId) {
    return res.status(500).json({ error: 'Vincere not configured' });
  }

    const authUrl = `https://${domain}.vincere.io/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    res.redirect(authUrl);
}
