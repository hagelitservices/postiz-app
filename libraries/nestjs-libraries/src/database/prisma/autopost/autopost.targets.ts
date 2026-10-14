// Kaido (TikTok Content Sharing Guidelines, "Intended Use"): "An app that copies
// arbitrary contents from other platforms to TikTok" is not acceptable. Auto
// Post turns any RSS feed into posts, so TikTok is never one of its targets -
// neither in the channel picker nor when the feed fires with "all channels".
export const AUTOPOST_EXCLUDED_PROVIDERS = ['tiktok'];

export const isAutopostTarget = (integration: {
  identifier?: string | null;
  providerIdentifier?: string | null;
}) =>
  !AUTOPOST_EXCLUDED_PROVIDERS.includes(
    integration.providerIdentifier || integration.identifier || ''
  );
