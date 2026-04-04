#!/usr/bin/env node
/**
 * Postinstall script: patches @rnmapbox/maps Swift files for MapboxMaps SDK v11.
 *
 * Problem: MapboxMaps v11.3+ introduced a SwiftUI `struct Viewport` that conflicts
 * with rnmapbox-maps v10's `typealias ViewportManager = Viewport`. Also, the
 * `NSNumber.CGFloat` extension in MapboxMaps is `internal`, causing build errors
 * when accessed from rnmapbox-maps code.
 */

const fs = require('fs');
const path = require('path');

const RNMBX = path.join(__dirname, '..', 'node_modules', '@rnmapbox', 'maps', 'ios', 'RNMBX');

if (!fs.existsSync(RNMBX)) {
  console.log('[fix-rnmapbox-ios] @rnmapbox/maps not found, skipping.');
  process.exit(0);
}

function patch(filename, replacements) {
  const filePath = path.join(RNMBX, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[fix-rnmapbox-ios] WARNING: ${filename} not found`);
    return;
  }
  let src = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, src, 'utf8');
    console.log(`[fix-rnmapbox-ios] Patched ${filename}`);
  } else {
    console.log(`[fix-rnmapbox-ios] ${filename} already patched or pattern not found`);
  }
}

// RNMBXViewport.swift: Fix ViewportManager typealias collision + CGFloat conversions
patch('RNMBXViewport.swift', [
  ['typealias ViewportManager = Viewport', 'typealias ViewportManager = MapboxMaps.ViewportManager'],
  ['result.top = top.CGFloat', 'result.top = CGFloat(top.doubleValue)'],
  ['result.bottom = bottom.CGFloat', 'result.bottom = CGFloat(bottom.doubleValue)'],
  ['result.left = left.CGFloat', 'result.left = CGFloat(left.doubleValue)'],
  ['result.right = right.CGFloat', 'result.right = CGFloat(right.doubleValue)'],
]);

// RNMBXCamera.swift: Fix optional CGFloat conversions
patch('RNMBXCamera.swift', [
  ['options.minZoom = self.minZoomLevel?.CGFloat', 'options.minZoom = self.minZoomLevel.map { CGFloat($0.doubleValue) }'],
  ['options.maxZoom = self.maxZoomLevel?.CGFloat', 'options.maxZoom = self.maxZoomLevel.map { CGFloat($0.doubleValue) }'],
]);

// RNMBXMarkerView.swift: Fix anchor CGFloat conversions (single idempotent replacement)
patch('RNMBXMarkerView.swift', [
  [
    'guard let anchor = anchor, let anchorX = anchor["x"]?.CGFloat, let anchorY = anchor["y"]?.CGFloat else {\n      return .zero\n    }\n          \n    let x = (anchorX * 2 - 1) * (size.width / 2) * -1\n    let y = (anchorY * 2 - 1) * (size.height / 2)',
    'guard let anchor = anchor,\n          let anchorXNum = anchor["x"],\n          let anchorYNum = anchor["y"] else {\n      return .zero\n    }\n    let anchorX = CGFloat(anchorXNum.doubleValue)\n    let anchorY = CGFloat(anchorYNum.doubleValue)\n          \n    let x = (anchorX * 2 - 1) * (size.width / 2) * -1\n    let y = (anchorY * 2 - 1) * (size.height / 2)',
  ],
]);

// RNMBXMapView.swift: Fix panDecelerationFactor CGFloat conversion
patch('RNMBXMapView.swift', [
  ['options.panDecelerationFactor = panDecelerationFactor.CGFloat', 'options.panDecelerationFactor = CGFloat(panDecelerationFactor.doubleValue)'],
]);

// RNMBXPointAnnotation.swift: Fix iconOffset CGFloat conversions
patch('RNMBXPointAnnotation.swift', [
  [
    'annotation.iconOffset = [size.width * (anchor["x"]?.CGFloat ?? 0.0) * -1.0, size.height * (anchor["y"]?.CGFloat ?? 0.0) * -1.0]',
    'annotation.iconOffset = [size.width * CGFloat(anchor["x"]?.doubleValue ?? 0.0) * -1.0, size.height * CGFloat(anchor["y"]?.doubleValue ?? 0.0) * -1.0]',
  ],
]);

console.log('[fix-rnmapbox-ios] Done.');
