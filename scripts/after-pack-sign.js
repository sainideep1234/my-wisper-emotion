'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

/**
 * electron-builder afterPack hook: ad-hoc sign the finished .app.
 *
 * Without an Apple Developer ID, electron-builder skips signing entirely, so
 * the bundle keeps the prebuilt Electron binary's own signature. We then copy
 * extraResources in and rewrite dylib paths with install_name_tool, which
 * leaves that inherited signature invalid:
 *
 *     codesign --verify Wisper.app
 *     -> code has no resources but signature indicates they must be present
 *
 * macOS will not hold an Accessibility (TCC) grant for a bundle whose signature
 * does not verify, so AXIsProcessTrusted() stays false and auto-paste silently
 * degrades to clipboard-only. Signing ad-hoc with a stable identifier gives the
 * bundle a valid signature and a consistent identity across rebuilds, so the
 * permission survives updates instead of breaking on every release.
 *
 * This is NOT a substitute for Developer ID + notarization; Gatekeeper still
 * quarantines browser downloads. It only fixes signature validity.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const entitlements = path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist');
  const identifier = context.packager.appInfo.id; // com.wisper.emotion

  console.log(`  • ad-hoc signing  app=${appName} identifier=${identifier}`);

  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign', '-',                    // ad-hoc
    '--identifier', identifier,       // stable across rebuilds, unlike "Electron"
    '--options', 'runtime',           // keep hardened runtime
    '--entitlements', entitlements,
    appPath,
  ], { stdio: 'inherit' });

  // Fail the build if the signature still does not verify — shipping an
  // invalid one silently breaks Accessibility for every user.
  execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'inherit' });
  console.log('  • signature verified');
};
