export function isVectorPmtilesArchiveUrl(template) {
  return (
    typeof template === 'string' &&
    /^https:\/\/.+\.pmtiles(\?|#|$)/i.test(template)
  );
}
