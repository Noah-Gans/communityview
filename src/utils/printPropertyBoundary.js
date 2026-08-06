/** True when a print element is the listing property outline. */
export function isPropertyBoundaryElement(el) {
  if (!el || typeof el !== 'object') return false;
  if (el.mapStyleVariant === 'boundary') return true;
  if (el.label === 'Property Boundary') return true;
  if (el.tool === 'polygon_boundary') return true;
  return false;
}

/** True when the map editor already has a property boundary. */
export function hasPropertyBoundary(printElements) {
  return Array.isArray(printElements) && printElements.some(isPropertyBoundaryElement);
}
