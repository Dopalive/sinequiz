// Dynamic layer over app.json. Only the web base path is computed here: GitHub Pages serves the app
// under /<repo>/, so the Pages workflow exports with EXPO_WEB_BASE_URL=/sinequiz while local dev and
// every other host keep the root path.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_WEB_BASE_URL ? { baseUrl: process.env.EXPO_WEB_BASE_URL } : {}),
  },
});
