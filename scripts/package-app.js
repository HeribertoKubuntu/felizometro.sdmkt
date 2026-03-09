#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {
    appId: '',
    platform: 'linux',
    target: 'dir',
    arch: 'arm64',
    list: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if ((token === '--app' || token === '-a') && argv[i + 1]) {
      args.appId = argv[i + 1];
      i += 1;
      continue;
    }

    if ((token === '--target' || token === '-t') && argv[i + 1]) {
      args.target = argv[i + 1];
      i += 1;
      continue;
    }

    if ((token === '--platform' || token === '-p') && argv[i + 1]) {
      args.platform = argv[i + 1];
      i += 1;
      continue;
    }

    if ((token === '--arch' || token === '-r') && argv[i + 1]) {
      args.arch = argv[i + 1];
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

function buildConfig(appConfig) {
  const distPath = path.join(process.cwd(), 'dist', appConfig.id);
  const buildDir = path.join(process.cwd(), 'build');
  fs.mkdirSync(buildDir, { recursive: true });

  const config = {
    appId: `com.herynativefier.${appConfig.id}`,
    productName: appConfig.name,
    directories: {
      output: distPath,
      buildResources: 'assets',
    },
    files: ['src/**/*', 'package.json'],
    extraMetadata: {
      main: 'src/main.js',
    },
    linux: {
      category: 'Utility',
      executableName: appConfig.id,
    },
    win: {
      artifactName: '${productName}-${version}-${arch}.${ext}',
      target: ['nsis'],
    },
  };

  const updateProvider = appConfig?.autoUpdate?.provider || process.env.AUTO_UPDATE_PROVIDER || 'generic';
  const updateFeedUrl = appConfig?.autoUpdate?.feedUrl || process.env.AUTO_UPDATE_FEED_URL || '';
  const githubOwner = appConfig?.autoUpdate?.githubOwner || process.env.AUTO_UPDATE_GITHUB_OWNER || '';
  const githubRepo = appConfig?.autoUpdate?.githubRepo || process.env.AUTO_UPDATE_GITHUB_REPO || '';

  if (updateProvider === 'generic' && updateFeedUrl) {
    config.publish = [
      {
        provider: 'generic',
        url: updateFeedUrl,
      },
    ];
  }

  if (updateProvider === 'github' && githubOwner && githubRepo) {
    config.publish = [
      {
        provider: 'github',
        owner: githubOwner,
        repo: githubRepo,
        private: Boolean(appConfig?.autoUpdate?.private),
      },
    ];
  }

  if (appConfig.icon) {
    config.linux.icon = appConfig.icon;
    config.win.icon = appConfig.icon;
  }

  const cfgPath = path.join(buildDir, `builder.${appConfig.id}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
  return cfgPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apps = loadApps();

  if (args.list) {
    apps.forEach((entry) => console.log(`- ${entry.id}: ${entry.name}`));
    return;
  }

  const selected = getAppConfig(apps, args.appId);

  if (!selected) {
    console.error('No se encontro la app solicitada. Usa --list para ver IDs.');
    process.exit(1);
  }

  const cfgPath = buildConfig(selected);
  const binary = path.join(process.cwd(), 'node_modules', '.bin', 'electron-builder');
  const normalizedArch = args.arch === 'x86' ? 'ia32' : args.arch;
  const normalizedPlatform = args.platform.toLowerCase();

  const platformSwitch =
    normalizedPlatform === 'win' || normalizedPlatform === 'windows'
      ? '--win'
      : normalizedPlatform === 'mac' || normalizedPlatform === 'darwin'
      ? '--mac'
      : '--linux';

  const argsBuilder = [
    'build',
    '--config',
    cfgPath,
    platformSwitch,
    args.target,
    '--' + normalizedArch,
  ];

  const result = spawnSync(binary, argsBuilder, {
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_CONFIG_JSON: JSON.stringify(selected),
    },
  });

  process.exit(result.status ?? 0);
}

main();
