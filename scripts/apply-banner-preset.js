#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function main() {
  const presetName = process.argv[2];

  const rootDir = process.cwd();
  const presetsPath = path.join(rootDir, 'config', 'banner-presets.json');
  const appsPath = path.join(rootDir, 'config', 'apps.json');

  const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
  const appsConfig = JSON.parse(fs.readFileSync(appsPath, 'utf8'));

  if (!Array.isArray(appsConfig.apps) || appsConfig.apps.length === 0) {
    console.error('config/apps.json debe incluir al menos una app en el arreglo "apps"');
    process.exit(1);
  }

  const currentBanner = appsConfig.apps[0]?.connectivity?.banner || {};

  if (!presetName || presetName === 'list') {
    console.log(`Presets disponibles: ${Object.keys(presets).join(', ')}`);
    return;
  }

  if (presetName === 'actual') {
    const currentBannerSerialized = JSON.stringify(currentBanner);
    const matchedPreset = Object.entries(presets).find(([, presetValue]) => {
      return JSON.stringify(presetValue) === currentBannerSerialized;
    });

    if (matchedPreset) {
      console.log(`Preset actual: ${matchedPreset[0]}`);
    } else {
      console.log('Preset actual: personalizado (sin coincidencia exacta con presets)');
    }
    return;
  }

  const selectedPreset = presets[presetName];

  if (!selectedPreset) {
    console.error(`Preset no encontrado: ${presetName}`);
    console.error(`Disponibles: ${Object.keys(presets).join(', ')}`);
    process.exit(1);
  }

  appsConfig.apps = appsConfig.apps.map((appEntry) => ({
    ...appEntry,
    connectivity: {
      ...(appEntry.connectivity || {}),
      banner: {
        ...selectedPreset,
      },
    },
  }));

  fs.writeFileSync(appsPath, JSON.stringify(appsConfig, null, 2) + '\n', 'utf8');
  console.log(`Preset aplicado correctamente: ${presetName}`);
}

main();
