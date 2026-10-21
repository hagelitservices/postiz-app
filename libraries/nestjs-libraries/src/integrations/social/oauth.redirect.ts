// Kaido (I4): The app moved to the address of the product page, but the OAuth
// apps of LinkedIn, Meta and Google only know the previous address. Their
// redirect URIs keep using OAUTH_FRONTEND_URL (that host forwards the callback
// to FRONTEND_URL); TikTok is registered with FRONTEND_URL and does not use this.
export const oauthFrontendUrl = () =>
  process.env.OAUTH_FRONTEND_URL || process.env.FRONTEND_URL;
