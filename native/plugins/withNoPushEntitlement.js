const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');
/* Phone-only build: reminders are local notifications, which need no entitlement. Prebuild adds expo-notifications'
 * own plugin whenever the package is installed, and its default asks for Apple's push entitlement, which a Personal
 * Team cannot sign. This takes that entitlement and the remote-notification background mode back out. */
module.exports = function withNoPushEntitlement(config) {
  config = withEntitlementsPlist(config, config => {
    delete config.modResults['aps-environment'];
    return config;
  });
  return withInfoPlist(config, config => {
    const modes = config.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const kept = modes.filter(m => m !== 'remote-notification');
      if (kept.length) config.modResults.UIBackgroundModes = kept; else delete config.modResults.UIBackgroundModes;
    }
    return config;
  });
};
