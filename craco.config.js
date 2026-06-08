/**
 * CRA's source-map-loader follows sourceMappingURL in node_modules. Some @mapbox
 * packages reference paths that don't exist after npm dedupe (ENOENT). Skip
 * node_modules for that loader only — app source maps are unchanged.
 */
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const rules = webpackConfig.module?.rules;
      if (!Array.isArray(rules)) return webpackConfig;

      rules.forEach((rule) => {
        if (
          rule &&
          typeof rule === 'object' &&
          rule.enforce === 'pre' &&
          typeof rule.loader === 'string' &&
          rule.loader.includes('source-map-loader')
        ) {
          rule.exclude = [/node_modules/, /@babel(?:\/|\\{1,2})runtime/];
        }
      });

      return webpackConfig;
    },
  },
};
