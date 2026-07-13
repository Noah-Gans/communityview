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
  return {
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

/** Merge saved map fields with account profile (print PDF / share footer). */
export function buildPrintAgentMetaFromSources(mapData = {}, userProfile = null, user = null) {
  const profileName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ');
  return buildSharedMapAgentMeta({
    ...mapData,
    firstName: userProfile?.firstName,
    lastName: userProfile?.lastName,
    contactEmail: userProfile?.contactEmail || user?.email || '',
    contactPhone: userProfile?.contactPhone || '',
    contactWebsite: userProfile?.contactWebsite || '',
    profilePhotoUrl: userProfile?.profilePhotoUrl || mapData?.listingAgent?.photoUrl || '',
    firmLogoUrl: userProfile?.firmLogoUrl || mapData?.listingAgent?.logoUrl || '',
    agentPhotoUrl: userProfile?.profilePhotoUrl || mapData?.agentPhotoUrl || mapData?.listingAgent?.photoUrl || '',
    agentLogoUrl: userProfile?.firmLogoUrl || mapData?.agentLogoUrl || mapData?.listingAgent?.logoUrl || '',
    contact: {
      name:
        mapData?.contact?.name ||
        mapData?.listingAgent?.name ||
        profileName ||
        '',
      email:
        mapData?.contact?.email ||
        mapData?.listingAgent?.email ||
        userProfile?.contactEmail ||
        user?.email ||
        '',
      phone:
        mapData?.contact?.phone ||
        mapData?.listingAgent?.phone ||
        userProfile?.contactPhone ||
        '',
      website:
        mapData?.contact?.website ||
        mapData?.listingAgent?.website ||
        userProfile?.contactWebsite ||
        '',
    },
  });
}
