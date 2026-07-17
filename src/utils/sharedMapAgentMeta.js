import { accountAgentDefaults, resolveAgentProfile } from './agentProfile';

export function formatAgentWebsiteHref(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function formatAgentWebsiteLabel(url) {
  return String(url || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

/** Build display meta for agent/contact block on public shared maps and tours. */
export function buildSharedMapAgentMeta(data = {}) {
  const listingAgent = data.listingAgent || {};
  const agentProfile = data.agentProfile || {};
  return {
    agentTitle:
      data.agentTitle ||
      listingAgent.title ||
      agentProfile.title ||
      '',
    agentBrokerage:
      data.agentBrokerage ||
      listingAgent.brokerage ||
      agentProfile.brokerage ||
      '',
    agentName:
      data.agentName ||
      listingAgent.name ||
      data.contact?.name ||
      data.agent?.name ||
      [data.firstName, data.lastName].filter(Boolean).join(' ') ||
      '',
    agentEmail:
      data.agentEmail ||
      listingAgent.email ||
      data.contact?.email ||
      data.agent?.email ||
      data.contactEmail ||
      '',
    agentPhone:
      data.agentPhone ||
      listingAgent.phone ||
      data.contact?.phone ||
      data.agent?.phone ||
      data.contactPhone ||
      '',
    agentWebsite:
      data.agentWebsite ||
      listingAgent.website ||
      data.contact?.website ||
      data.agent?.website ||
      data.contactWebsite ||
      '',
    agentPhoto:
      data.profilePhotoUrl ||
      data.agentPhotoUrl ||
      listingAgent.photoUrl ||
      '',
    agentLogo:
      data.firmLogoUrl ||
      data.agentLogoUrl ||
      listingAgent.logoUrl ||
      data.brandLogoUrl ||
      data.agent?.logoUrl ||
      '',
  };
}

/**
 * Merge saved map fields with account profile (print PDF / share footer).
 * The per-map `agentProfile` override wins (custom values, with per-field
 * fallback to the account); the listing snapshot stays as a deeper fallback.
 */
export function buildPrintAgentMetaFromSources(mapData = {}, userProfile = null, user = null) {
  const account = accountAgentDefaults(userProfile, user);
  const resolved = resolveAgentProfile(mapData?.agentProfile, account);
  return buildSharedMapAgentMeta({
    ...mapData,
    agentName: resolved.name,
    agentTitle: resolved.title,
    agentBrokerage: resolved.brokerage,
    agentEmail: resolved.email,
    agentPhone: resolved.phone,
    agentWebsite: resolved.website,
    profilePhotoUrl: resolved.photoUrl,
    agentPhotoUrl: resolved.photoUrl,
    firmLogoUrl: resolved.logoUrl,
    agentLogoUrl: resolved.logoUrl,
  });
}
