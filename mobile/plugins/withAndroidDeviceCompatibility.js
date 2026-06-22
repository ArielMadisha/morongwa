/**
 * Broaden Google Play device compatibility (phones + tablets such as JTY K108).
 *
 * Play excludes devices when the manifest marks hardware as required=true even
 * though the app only uses those features optionally at runtime (camera, mic,
 * GPS, telephony). Budget 10" tablets (Spreadtrum SC7731, armeabi-v7a) often
 * lack phone radio or report incomplete feature lists.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

/** Mark optional so tablets without phone/camera still appear in Play catalog. */
const OPTIONAL_HARDWARE_FEATURES = [
  'android.hardware.telephony',
  'android.hardware.telephony.gsm',
  'android.hardware.telephony.cdma',
  'android.software.telephony',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.front',
  'android.hardware.camera.any',
  'android.hardware.camera.flash',
  'android.hardware.microphone',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.wifi',
  'android.hardware.wifi.direct',
  'android.hardware.bluetooth',
  'android.hardware.bluetooth_le',
  'android.hardware.sensor.accelerometer',
  'android.hardware.sensor.compass',
  'android.hardware.sensor.gyroscope',
  'android.hardware.sensor.light',
  'android.hardware.sensor.proximity',
  'android.hardware.touchscreen',
  'android.hardware.touchscreen.multitouch',
  'android.hardware.touchscreen.multitouch.distinct',
  'android.hardware.touchscreen.multitouch.jazzhand',
  'android.hardware.faketouch',
  'android.hardware.screen.portrait',
  'android.hardware.screen.landscape',
  'android.hardware.opengles.aep',
  'android.hardware.vulkan.level',
  'android.hardware.vulkan.version',
  'android.hardware.usb.host',
  'android.hardware.nfc',
  'android.hardware.nfc.hce',
  'android.hardware.fingerprint',
  'android.hardware.biometrics.face',
  'android.software.leanback',
  'android.software.live_wallpaper',
  'android.software.app_widgets',
  'android.hardware.type.television',
  'android.hardware.type.automotive',
  'android.hardware.type.watch',
];

function ensureUsesFeatureOptional(manifest, featureName) {
  if (!manifest.manifest) manifest.manifest = {};
  if (!manifest.manifest['uses-feature']) {
    manifest.manifest['uses-feature'] = [];
  }
  const list = manifest.manifest['uses-feature'];
  const existing = list.find((item) => item?.$?.['android:name'] === featureName);
  if (existing) {
    existing.$['android:required'] = 'false';
    return;
  }
  list.push({
    $: {
      'android:name': featureName,
      'android:required': 'false',
    },
  });
}

/** Demote every uses-feature injected by Expo/RN deps (camera, mic, etc.). */
function demoteAllHardwareFeatures(manifest) {
  const list = manifest.manifest?.['uses-feature'];
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (item?.$) {
      item.$['android:required'] = 'false';
    }
  }
}

function ensureSupportsScreens(manifest) {
  if (!manifest.manifest) manifest.manifest = {};
  const list = manifest.manifest['supports-screens'];
  const desired = {
    'android:smallScreens': 'true',
    'android:normalScreens': 'true',
    'android:largeScreens': 'true',
    'android:xlargeScreens': 'true',
    'android:anyDensity': 'true',
    'android:resizeable': 'true',
  };
  if (Array.isArray(list) && list.length > 0) {
    for (const entry of list) {
      if (entry?.$) Object.assign(entry.$, desired);
    }
    return;
  }
  manifest.manifest['supports-screens'] = [{ $: desired }];
}

function withAndroidDeviceCompatibility(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    demoteAllHardwareFeatures(manifest);
    for (const feature of OPTIONAL_HARDWARE_FEATURES) {
      ensureUsesFeatureOptional(manifest, feature);
    }
    ensureSupportsScreens(manifest);
    return config;
  });
}

module.exports = withAndroidDeviceCompatibility;
