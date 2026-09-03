/**
 * Regrid batch reports (POST /batch/points, NDJSON download).
 * Requires Regrid API plan with batch access.
 *
 * Launch: leave unset or false.
 * Dev/staging with batch: REACT_APP_ENABLE_REGRID_BATCH_REPORTS=true
 */
export const REGRID_BATCH_REPORTS_ENABLED =
  typeof process !== 'undefined' &&
  process.env.REACT_APP_ENABLE_REGRID_BATCH_REPORTS === 'true';

/**
 * Guest-edit toggle on the amenity map editor ("allow editing without signing in").
 * Outreach-only control: it disables auth on a shared map, so subscribers must not
 * be able to turn it on. Maps that already have guestEdit saved keep working — this
 * flag only controls whether the toggle is offered.
 *
 * Launch: leave unset or false.
 * Sales/outreach worktree: REACT_APP_ENABLE_GUEST_EDIT_TOGGLE=true
 */
export const GUEST_EDIT_TOGGLE_ENABLED =
  typeof process !== 'undefined' && process.env.REACT_APP_ENABLE_GUEST_EDIT_TOGGLE === 'true';
