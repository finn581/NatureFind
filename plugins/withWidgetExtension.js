/**
 * Expo config plugin: adds a WidgetKit "Park of the Day" widget extension to the iOS build.
 *
 * What this does:
 * 1. Copies ParkWidget.swift into the ios build directory under a ParkWidgetExtension/ folder.
 * 2. Creates the widget extension's Info.plist with WidgetKit configuration.
 * 3. Modifies the Xcode project (pbxproj) to add:
 *    - A PBXGroup for the widget extension source files
 *    - A new PBXNativeTarget for the widget extension (app_extension type)
 *    - Sources and Resources build phases
 *    - Correct build settings (Swift 5, deployment target, bundle ID, WidgetKit framework)
 *    - A target dependency from the main app to the widget extension
 *    - An "Embed App Extensions" copy-files build phase on the main app target
 */

const { withXcodeProject, withDangerousMod, withPlugins } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');
const plist = require('@expo/plist');

const WIDGET_TARGET_NAME = 'ParkWidgetExtension';
const WIDGET_BUNDLE_ID_SUFFIX = '.ParkWidget';
const SWIFT_FILE_NAME = 'ParkWidget.swift';

// ──────────────────────────────────────────────────────────
// Step 1: Copy widget source files into the ios/ build dir
// ──────────────────────────────────────────────────────────
function withWidgetFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const widgetDir = path.join(iosRoot, WIDGET_TARGET_NAME);

      // Create widget extension directory
      if (!fs.existsSync(widgetDir)) {
        fs.mkdirSync(widgetDir, { recursive: true });
      }

      // Copy Swift file
      const srcSwift = path.join(__dirname, 'widget', SWIFT_FILE_NAME);
      const dstSwift = path.join(widgetDir, SWIFT_FILE_NAME);
      fs.copyFileSync(srcSwift, dstSwift);
      console.log(`[withWidgetExtension] Copied ${SWIFT_FILE_NAME} to ${widgetDir}`);

      // Create Info.plist for the widget extension
      const bundleId = config.ios?.bundleIdentifier || 'com.finn581.parkfinder';
      const infoPlistContent = {
        CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
        CFBundleDisplayName: 'Park of the Day',
        CFBundleExecutable: '$(EXECUTABLE_NAME)',
        CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
        CFBundleInfoDictionaryVersion: '6.0',
        CFBundleName: '$(PRODUCT_NAME)',
        CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
        CFBundleShortVersionString: config.version || '1.0.0',
        CFBundleVersion: config.ios?.buildNumber || '1',
        NSExtension: {
          NSExtensionPointIdentifier: 'com.apple.widgetkit-extension',
        },
      };

      const infoPlistPath = path.join(widgetDir, 'Info.plist');
      fs.writeFileSync(infoPlistPath, plist.default.build(infoPlistContent), 'utf8');
      console.log(`[withWidgetExtension] Created Info.plist at ${widgetDir}`);

      // Create entitlements file (empty, but required for signing)
      const entitlements = {
        // Widget extensions inherit the app group if needed; empty is valid
      };
      const entitlementsPath = path.join(widgetDir, `${WIDGET_TARGET_NAME}.entitlements`);
      fs.writeFileSync(entitlementsPath, plist.default.build(entitlements), 'utf8');
      console.log(`[withWidgetExtension] Created entitlements at ${widgetDir}`);

      return config;
    },
  ]);
}

// ──────────────────────────────────────────────────────────
// Step 2: Modify the Xcode project to add the widget target
// ──────────────────────────────────────────────────────────
function withWidgetTarget(config) {
  return withXcodeProject(config, (config) => {
    const proj = config.modResults;
    const bundleId = config.ios?.bundleIdentifier || 'com.finn581.parkfinder';
    const widgetBundleId = bundleId + WIDGET_BUNDLE_ID_SUFFIX;
    const deploymentTarget = '16.0'; // WidgetKit containerBackground requires iOS 17, but 16.0 is the safe minimum for widget support

    // Check if we already added the target (idempotency)
    if (proj.pbxTargetByName(WIDGET_TARGET_NAME)) {
      console.log(`[withWidgetExtension] Target ${WIDGET_TARGET_NAME} already exists, skipping`);
      return config;
    }

    // --- Add the native target ---
    const target = proj.addTarget(
      WIDGET_TARGET_NAME,
      'app_extension',
      WIDGET_TARGET_NAME,
      widgetBundleId
    );

    // --- Configure build settings for both Debug and Release ---
    const configurations = proj.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (typeof configurations[key] !== 'object') continue;
      const cfg = configurations[key];
      if (!cfg.buildSettings) continue;

      // Only modify configs that belong to our widget target
      const productName = cfg.buildSettings.PRODUCT_NAME;
      if (!productName || !productName.includes(WIDGET_TARGET_NAME)) continue;

      Object.assign(cfg.buildSettings, {
        ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: 'AccentColor',
        ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME: 'WidgetBackground',
        CLANG_ANALYZER_NONNULL: 'YES',
        CLANG_CXX_LANGUAGE_STANDARD: '"gnu++20"',
        CLANG_ENABLE_MODULES: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        CURRENT_PROJECT_VERSION: config.ios?.buildNumber || '1',
        GENERATE_INFOPLIST_FILE: 'NO',
        INFOPLIST_FILE: `${WIDGET_TARGET_NAME}/Info.plist`,
        INFOPLIST_KEY_CFBundleDisplayName: '"Park of the Day"',
        INFOPLIST_KEY_NSHumanReadableCopyright: '""',
        IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
        LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
        MARKETING_VERSION: config.version || '1.0.0',
        PRODUCT_BUNDLE_IDENTIFIER: `"${widgetBundleId}"`,
        PRODUCT_NAME: `"${WIDGET_TARGET_NAME}"`,
        SKIP_INSTALL: 'YES',
        SWIFT_EMIT_LOC_STRINGS: 'YES',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        CODE_SIGN_ENTITLEMENTS: `${WIDGET_TARGET_NAME}/${WIDGET_TARGET_NAME}.entitlements`,
      });
    }

    // --- Add Swift source file to the widget target's Sources build phase ---
    const widgetGroupName = WIDGET_TARGET_NAME;
    const widgetGroup = proj.addPbxGroup(
      [SWIFT_FILE_NAME, 'Info.plist', `${WIDGET_TARGET_NAME}.entitlements`],
      widgetGroupName,
      widgetGroupName
    );

    // Add the widget group to the top-level project group
    const mainGroupId = proj.getFirstProject().firstProject.mainGroup;
    proj.addToPbxGroup(widgetGroup.uuid, mainGroupId);

    // Add Swift file to Sources build phase of the widget target
    proj.addSourceFile(
      `${WIDGET_TARGET_NAME}/${SWIFT_FILE_NAME}`,
      { target: target.uuid },
      widgetGroup.uuid
    );

    // --- Add WidgetKit and SwiftUI frameworks to the widget target ---
    // WidgetKit framework
    proj.addFramework('WidgetKit.framework', {
      target: target.uuid,
      link: true,
    });
    // SwiftUI framework
    proj.addFramework('SwiftUI.framework', {
      target: target.uuid,
      link: true,
    });

    // --- Add target dependency: main app depends on widget extension ---
    const mainTarget = proj.getFirstTarget();
    proj.addTargetDependency(mainTarget.firstTarget.uuid, [target.uuid]);

    // --- Add "Embed App Extensions" copy-files build phase to main target ---
    // This embeds the .appex into the main app bundle
    proj.addBuildPhase(
      [`${WIDGET_TARGET_NAME}.appex`],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      mainTarget.firstTarget.uuid,
      'app_extension'
    );

    console.log(`[withWidgetExtension] Added ${WIDGET_TARGET_NAME} target to Xcode project`);
    return config;
  });
}

// ──────────────────────────────────────────────────────────
// Combined plugin
// ──────────────────────────────────────────────────────────
function withWidgetExtension(config) {
  // Files must be copied first (withDangerousMod runs in prebuild),
  // then the Xcode project is modified
  config = withWidgetFiles(config);
  config = withWidgetTarget(config);
  return config;
}

module.exports = withWidgetExtension;
