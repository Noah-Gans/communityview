// Per-map agent/contact-card stored on the map doc as `agentProfile`.
//
// The map builder stamps this from the owner's account profile on save (mode:
// 'account' + field snapshot) for backend/share consumers. Display resolves
// through account defaults; per-map custom overrides are no longer edited in
// the product UI (backend may still set mode: 'custom' when needed).

const str = (v) => String(v == null ? '' : v).trim();

export function createEmptyAgentProfile() {
  return {
    mode: 'account',
    name: '',
    title: '',
    brokerage: '',
    email: '',
    phone: '',
    website: '',
    photoUrl: '',
    photoStoragePath: '',
    logoUrl: '',
    logoStoragePath: '',
  };
}

/** Coerce anything (Firestore doc, partial patch, null) into a full profile object. */
export function normalizeAgentProfile(raw) {
  const base = createEmptyAgentProfile();
  if (!raw || typeof raw !== 'object') return base;
  return {
    mode: raw.mode === 'custom' ? 'custom' : 'account',
    name: str(raw.name),
    title: str(raw.title),
    brokerage: str(raw.brokerage),
    email: str(raw.email),
    phone: str(raw.phone),
    website: str(raw.website),
    photoUrl: str(raw.photoUrl),
    photoStoragePath: str(raw.photoStoragePath),
    logoUrl: str(raw.logoUrl),
    logoStoragePath: str(raw.logoStoragePath),
  };
}

/** True when the profile actually customizes anything (mode custom + any field). */
export function agentProfileHasCustomValues(raw) {
  const p = normalizeAgentProfile(raw);
  if (p.mode !== 'custom') return false;
  return Boolean(
    p.name ||
      p.title ||
      p.brokerage ||
      p.email ||
      p.phone ||
      p.website ||
      p.photoUrl ||
      p.logoUrl
  );
}

/**
 * Build the account fallback object from the useUser() profile + auth user.
 * Shape matches what {@link resolveAgentProfile} expects for `account`.
 */
export function accountAgentDefaults(userProfile, user) {
  const p = userProfile || {};
  const name = [p.firstName, p.lastName].map(str).filter(Boolean).join(' ');
  return {
    name,
    title: '',
    brokerage: '',
    email: str(p.contactEmail) || str(user?.email),
    phone: str(p.contactPhone),
    website: str(p.contactWebsite),
    photoUrl: str(p.profilePhotoUrl),
    logoUrl: str(p.firmLogoUrl),
  };
}

/**
 * Resolve the effective agent card fields for a map: custom per-map values win,
 * with per-field fallback to the account. When mode is 'account', the account
 * values are used verbatim.
 * @param {object|null} agentProfile per-map profile stored on the map
 * @param {object} account account defaults (see {@link accountAgentDefaults})
 */
export function resolveAgentProfile(agentProfile, account = {}) {
  const p = normalizeAgentProfile(agentProfile);
  const acct = account || {};
  if (p.mode !== 'custom') {
    return {
      name: str(acct.name),
      title: str(acct.title),
      brokerage: str(acct.brokerage),
      email: str(acct.email),
      phone: str(acct.phone),
      website: str(acct.website),
      photoUrl: str(acct.photoUrl),
      logoUrl: str(acct.logoUrl),
    };
  }
  return {
    name: p.name || str(acct.name),
    title: p.title || str(acct.title),
    brokerage: p.brokerage || str(acct.brokerage),
    email: p.email || str(acct.email),
    phone: p.phone || str(acct.phone),
    website: p.website || str(acct.website),
    photoUrl: p.photoUrl || str(acct.photoUrl),
    logoUrl: p.logoUrl || str(acct.logoUrl),
  };
}
