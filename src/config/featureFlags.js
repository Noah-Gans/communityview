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
