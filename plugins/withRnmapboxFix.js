/**
 * Expo config plugin: fixes @rnmapbox/maps v10 compatibility with MapboxMaps SDK v11.
 *
 * What this does:
 * 1. Adds RNMBX_11 to SWIFT_ACTIVE_COMPILATION_CONDITIONS for the rnmapbox-maps pod target.
 *    (Required because MapboxMaps SDK v11 introduced a SwiftUI `struct Viewport` that
 *     shadows the UIKit `ViewportManager` used by rnmapbox-maps v10's #if RNMBX_11 guard.)
 * 2. Injects a postinstall script via the node postinstall hook to patch NSNumber.CGFloat
 *    inaccessibility issues in Swift source files.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const RNMBX_11_SNIPPET = `
    # ── @rnmapbox/maps v10 + MapboxMaps SDK v11 compatibility ──────────────────
    # MapboxMaps SDK v11 introduced a SwiftUI struct 'Viewport' that conflicts with
    # rnmapbox-maps' typealias. RNMBX_11 guards the correct API paths.
    installer.pods_project.targets.each do |target|
      if target.name == 'rnmapbox-maps'
        target.build_configurations.each do |config|
          swift_flags = config.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] || '$(inherited)'
          unless swift_flags.include?('RNMBX_11')
            config.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = "\#{swift_flags} RNMBX_11"
          end
        end
      end
    end
    # ──────────────────────────────────────────────────────────────────────────
`;

const withRnmapboxPodfileFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Only inject if not already present
      if (podfile.includes('RNMBX_11')) {
        return config;
      }

      // Insert before the closing `end` of the post_install block, after react_native_post_install
      const insertAfter = 'react_native_post_install(';
      const insertIdx = podfile.indexOf(insertAfter);
      if (insertIdx === -1) {
        console.warn('[withRnmapboxFix] Could not find react_native_post_install in Podfile');
        return config;
      }

      // Find the end of the react_native_post_install call block
      const afterCall = podfile.indexOf('\n    )', insertIdx);
      if (afterCall === -1) {
        console.warn('[withRnmapboxFix] Could not find end of react_native_post_install call');
        return config;
      }

      const insertPoint = afterCall + '\n    )'.length;
      podfile = podfile.slice(0, insertPoint) + '\n' + RNMBX_11_SNIPPET + podfile.slice(insertPoint);
      fs.writeFileSync(podfilePath, podfile, 'utf8');
      console.log('[withRnmapboxFix] Injected RNMBX_11 flag into Podfile');
      return config;
    },
  ]);
};

module.exports = withRnmapboxPodfileFix;
