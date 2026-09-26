// Removes the Push Notifications entitlement that expo-notifications adds.
//
// MobiumApp asks for permission to show *local* notifications — the Dialog
// Demo's prompt — and never receives a remote push, so `aps-environment` is
// not needed. It is also what stops the app being signed for a real iPhone
// with a free Apple ID: a personal team cannot provision Push Notifications,
// and the build fails before it starts. The permission prompt works without
// it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
