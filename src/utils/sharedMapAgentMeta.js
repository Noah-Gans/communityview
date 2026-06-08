/** Build display meta for agent/contact block on public shared maps and tours. */
export function buildSharedMapAgentMeta(data = {}) {
  const listingAgent = data.listingAgent || {};
  return {
    agentName:
      data.agentName ||
      listingAgent.name ||
      data.contact?.name ||
      data.agent?.name ||
      '',
    agentEmail:
      data.agentEmail ||
      listingAgent.email ||
      data.contact?.email ||
      data.agent?.email ||
      '',
    agentPhone:
      data.agentPhone ||
      listingAgent.phone ||
      data.contact?.phone ||
      data.agent?.phone ||
      '',
    agentPhoto:
      data.agentPhotoUrl ||
      listingAgent.photoUrl ||
      data.profilePhotoUrl ||
      '',
    agentLogo:
      data.agentLogoUrl ||
      listingAgent.logoUrl ||
      data.brandLogoUrl ||
      data.agent?.logoUrl ||
      '',
  };
}
