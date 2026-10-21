// Kaido (I7b): the channels Kaido Publish offers. The "Add Channel" dialog shows only these — the full upstream
// list (WordPress, Slack, Discord, …) displayed unrelated services, which TikTok's app review rejects
// ("does not use or display any third-party or unrelated platforms"). Channels already connected keep working;
// this only narrows what can be added. X stays listed for K1a.
export const KAIDO_CHANNELS = [
  'tiktok',
  'youtube',
  'instagram',
  'facebook',
  'linkedin',
  'linkedin-page',
  'gmb',
  'x',
];

// Kaido (I7d): the organisation used for TikTok's app review demo video offers TikTok only — the review counts the
// logos of other networks in "Add Channel" as displayed third-party platforms. Real organisations keep the full list.
const KAIDO_DEMO_ORGS: Record<string, string[]> = {
  '41d659cc-e55d-4141-8a73-6022ec5f8aa6': ['tiktok'], // „Kaido Publish Demo“
};

export const kaidoChannelsFor = (orgId?: string) =>
  (orgId && KAIDO_DEMO_ORGS[orgId]) || KAIDO_CHANNELS;
