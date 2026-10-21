// Gives Android a network security configuration for the Network Demo.
//
// Two things the demo needs, and nothing more. Plain HTTP is permitted to the
// Mac a check runs its server on — 127.0.0.1 and localhost, reached through
// `adb reverse`, and 10.0.2.2, the emulator's name for the Mac — and to
// localhost.charlesproxy.com, a name that resolves to 127.0.0.1, and nowhere
// else. That last one is for a WebView behind a proxy: Chromium sends a
// loopback address around the proxy, so a page from 127.0.0.1 is never seen
// by it, and a name for the same address is. And certificates a person
// installed are trusted as well as the system's, so a debugging proxy's root
// makes MobiumApp's HTTPS readable: the positive control for an app that opted
// in, where an app that did not, as Wikipedia's does not, is the negative one.
// Mobium's docs/PROXY.md has both.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost.charlesproxy.com</domain>
    </domain-config>
</network-security-config>
`;

module.exports = function withNetworkSecurity(config) {
  config = withDangerousMod(config, ['android', async (config) => {
    const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'network_security_config.xml'), CONFIG);
    return config;
  }]);
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return config;
  });
};
