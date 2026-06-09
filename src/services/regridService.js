import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseConfig';

const regridApiFn = functions ? httpsCallable(functions, 'regridApi') : null;

function formatRegridCallableError(error) {
  const code = error?.code ? String(error.code) : '';
  const details =
    typeof error?.details === 'string'
      ? error.details
      : error?.details != null
        ? JSON.stringify(error.details)
        : '';
  const message =
    (error?.message ? String(error.message) : '') ||
    details ||
    String(error || 'Regrid request failed');
  if (code === 'functions/unauthenticated') {
    return 'Sign in required to load property details.';
  }
  if (code === 'functions/failed-precondition') {
    return message;
  }
  if (code === 'functions/invalid-argument') {
    return message || 'Invalid Regrid request.';
  }
  if (code === 'functions/internal' && /does not support/i.test(message)) {
    return message;
  }
  if (code === 'functions/internal' && /401|403|token/i.test(message)) {
    return `${message} The Regrid API token on the server may be expired or missing — update Firebase functions config with your new Regrid token.`;
  }
  if (code === 'functions/internal' && message === 'INTERNAL') {
    return details || 'Regrid API request failed. Check Firebase function logs.';
  }
  return message;
}

async function callRegridApi(payload) {
  if (!regridApiFn) {
    throw new Error('Firebase Functions is not available (Regrid API requires sign-in).');
  }
  try {
    const result = await regridApiFn(payload);
    return result.data;
  } catch (error) {
    throw new Error(formatRegridCallableError(error));
  }
}

/** GET app.regrid.com/api/v2/{route} via Cloud Function (token stays on server). */
export async function regridRestGet(route, queryParams = {}) {
  return callRegridApi({
    operation: 'restGet',
    route: String(route || '').replace(/^\/+/, ''),
    queryParams,
  });
}

export async function fetchRegridParcelTileJson() {
  return callRegridApi({ operation: 'parcelTileJson' });
}

/**
 * Proxy Regrid batch API (POST/GET/DELETE).
 * @returns {{ ok: true, json?: object, text?: string }}
 */
export async function regridBatchRequest({ method = 'GET', path, queryParams = {}, body }) {
  return callRegridApi({
    operation: 'batch',
    method,
    path,
    queryParams,
    body,
  });
}
