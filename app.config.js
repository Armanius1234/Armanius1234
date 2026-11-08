// Expo reads app.json first and passes it in as `config`; this file only
// changes it for one special build.
//
// PL8_SINGLE_FILE=1 (npm run build:web:single) builds the web version without
// splitting the screens into separate script files, so that everything can be
// packed into one index.html. All other builds use app.json unchanged.
module.exports = ({ config }) => {
  if (process.env.PL8_SINGLE_FILE !== '1') return config;
  return {
    ...config,
    plugins: config.plugins.map((plugin) =>
      plugin === 'expo-router' ? ['expo-router', { asyncRoutes: { web: false, default: false } }] : plugin,
    ),
  };
};
