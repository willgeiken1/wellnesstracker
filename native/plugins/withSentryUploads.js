// Sentry's Expo plugin, with source map and debug symbol uploads only in a build that has SENTRY_AUTH_TOKEN
// (an EAS secret). Without the token the upload is skipped, so local and token-less builds still succeed.
// The token is never read into the app config or written to sentry.properties.
const { withSentry } = require('@sentry/react-native/expo');

module.exports = function withSentryUploads(config, props = {}) {
  return withSentry(config, { ...props, disableAutoUpload: !process.env.SENTRY_AUTH_TOKEN });
};
