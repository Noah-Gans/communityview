const store = new Map();
let seq = 0;
const MAX_BUFFERED = 24;

const MIME = 'application/x-communityview-print-catalog';

export { MIME as PRINT_CATALOG_DRAG_MIME };

/**
 * @param {{ tool: string, label?: string }} payload
 * @returns {string} buffer id
 */
export function registerPrintCatalogDragPayload(payload) {
  const tool = String(payload?.tool || '').trim();
  if (!tool) return '';
  while (store.size >= MAX_BUFFERED) {
    const k = store.keys().next().value;
    if (!k) break;
    store.delete(k);
  }
  const id = `cvpc_${++seq}_${Date.now().toString(36)}`;
  store.set(id, {
    tool,
    label: payload.label ? String(payload.label) : '',
  });
  return id;
}

/** @returns {{ tool: string, label: string } | null} */
export function takePrintCatalogDragPayload(id) {
  if (!id || typeof id !== 'string') return null;
  const raw = store.get(id);
  store.delete(id);
  if (!raw?.tool) return null;
  return {
    tool: String(raw.tool),
    label: raw.label ? String(raw.label) : '',
  };
}

export function isPointLikeCatalogTool(tool) {
  const t = String(tool || '');
  return t === 'note' || t.startsWith('shape_');
}
