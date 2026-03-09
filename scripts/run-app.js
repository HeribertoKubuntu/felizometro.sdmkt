#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function parseArgs(argv) {
  const args = { appId: '', list: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if ((token === '--app' || token === '-a') && argv[i + 1]) {
      args.appId = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--list' || token === '-l') {
      args.list = true;
    }
  }

  return args;
}

function loadApps() {
  const appsPath = path.join(process.cwd(), 'config', 'apps.json');
  const raw = fs.readFileSync(appsPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.apps)) {
    throw new Error('config/apps.json debe tener un arreglo "apps"');
  }

  return parsed.apps;
}

function getAppConfig(apps, appId) {
  if (!appId && apps.length > 0) {
    return apps[0];
  }

  return apps.find((entry) => entry.id === appId);
}

function runElectron(appConfig) {
  const electronBinary = require('electron');
  const mainFile = path.join(process.cwd(), 'src', 'main.js');

  const child = spawn(electronBinary, [mainFile], {
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_CONFIG_JSON: JSON.stringify(appConfig),
    },
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function printApps(apps) {
  console.log('Apps disponibles:');
  apps.forEach((entry) => {
    console.log(`- ${entry.id}: ${entry.name} (${entry.url})`);
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apps = loadApps();

  if (args.list) {
    printApps(apps);
    return;
  }

  const selected = getAppConfig(apps, args.appId);

  if (!selected) {
    console.error('No se encontro la app solicitada. Usa --list para ver IDs.');
    process.exit(1);
  }

  runElectron(selected);
}

main();
