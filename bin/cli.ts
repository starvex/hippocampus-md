#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(msg: string, color = COLORS.reset) {
  console.log(`${color}${msg}${COLORS.reset}`);
}

function logStep(step: string) {
  log(`  → ${step}`, COLORS.cyan);
}

function logSuccess(msg: string) {
  log(`  ✓ ${msg}`, COLORS.green);
}

function logWarning(msg: string) {
  log(`  ⚠ ${msg}`, COLORS.yellow);
}

function logError(msg: string) {
  log(`  ✗ ${msg}`, COLORS.red);
}

async function init() {
  console.log('');
  log('🧠 hippocampus.md - Context Lifecycle Extension', COLORS.cyan);
  log('   Memory that decays like biology', COLORS.dim);
  console.log('');

  const piExtensionsDir = join(homedir(), '.pi', 'extensions');
  const configPath = join(homedir(), '.pi', 'hippocampus.config.json');

  // Step 1: Create .pi/extensions directory if needed
  logStep('Checking Pi extensions directory...');
  if (!existsSync(piExtensionsDir)) {
    mkdirSync(piExtensionsDir, { recursive: true });
    logSuccess(`Created ${piExtensionsDir}`);
  } else {
    logSuccess('Extensions directory exists');
  }

  // Step 2: Copy hippocampus.ts
  logStep('Installing hippocampus extension...');
  const sourceFile = join(__dirname, '..', 'extension', 'hippocampus.ts');
  const destFile = join(piExtensionsDir, 'hippocampus.ts');

  if (!existsSync(sourceFile)) {
    logError(`Source file not found: ${sourceFile}`);
    logWarning('Try reinstalling: npm install -g hippocampus-md');
    process.exit(1);
  }

  if (existsSync(destFile)) {
    logWarning('hippocampus.ts already exists, backing up...');
    copyFileSync(destFile, `${destFile}.backup`);
  }

  copyFileSync(sourceFile, destFile);
  logSuccess(`Installed to ${destFile}`);

  // Step 3: Create default config if needed
  logStep('Setting up configuration...');
  if (!existsSync(configPath)) {
    const defaultConfig = {
      enabled: true,
      debug: false,
      logPath: '/tmp/hippocampus-debug.log',
      decay: {
        decision: 0.03,
        user_intent: 0.05,
        context: 0.12,
        tool_result: 0.2,
        ephemeral: 0.35,
      },
      retention: {
        sparse: 0.25,
        compress: 0.65,
      },
      sparseIndex: {
        enabled: true,
        path: join(homedir(), '.pi', 'hippocampus-index.json'),
      },
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    logSuccess(`Created config at ${configPath}`);
  } else {
    logSuccess('Config already exists');
  }

  // Step 4: Remind about Pi config
  console.log('');
  log('📋 Final step - Update your Pi config:', COLORS.yellow);
  console.log('');
  log('   In ~/.pi/config.json, set:', COLORS.dim);
  log('   {', COLORS.dim);
  log('     "compaction": {', COLORS.dim);
  log('       "mode": "default"  // not "safeguard"', COLORS.dim);
  log('     }', COLORS.dim);
  log('   }', COLORS.dim);
  console.log('');
  
  log('✅ Installation complete!', COLORS.green);
  console.log('');
  log('🔗 Docs: https://hippocampus.md', COLORS.dim);
  log('📖 GitHub: https://github.com/starvex/hippocampus-md', COLORS.dim);
  console.log('');
}

async function status() {
  log('🧠 hippocampus.md status', COLORS.cyan);
  console.log('');

  const extensionPath = join(homedir(), '.pi', 'extensions', 'hippocampus.ts');
  const configPath = join(homedir(), '.pi', 'hippocampus.config.json');
  const indexPath = join(homedir(), '.pi', 'hippocampus-index.json');
  const logPath = '/tmp/hippocampus-debug.log';

  // Check extension
  if (existsSync(extensionPath)) {
    logSuccess(`Extension installed: ${extensionPath}`);
  } else {
    logError('Extension not installed');
  }

  // Check config
  if (existsSync(configPath)) {
    logSuccess(`Config exists: ${configPath}`);
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      log(`     enabled: ${config.enabled}`, COLORS.dim);
      log(`     debug: ${config.debug}`, COLORS.dim);
    } catch {
      logWarning('Config exists but could not be parsed');
    }
  } else {
    logWarning('No config file (using defaults)');
  }

  // Check sparse index
  if (existsSync(indexPath)) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      const count = Object.keys(index.entries || {}).length;
      logSuccess(`Sparse index: ${count} entries`);
    } catch {
      logWarning('Sparse index exists but could not be parsed');
    }
  } else {
    log('  ○ No sparse index yet (created on first compaction)', COLORS.dim);
  }

  // Check debug log
  if (existsSync(logPath)) {
    const stats = readFileSync(logPath, 'utf-8').split('\n').length;
    logSuccess(`Debug log: ${stats} lines at ${logPath}`);
  } else {
    log('  ○ No debug log yet', COLORS.dim);
  }

  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';

  switch (command) {
    case 'init':
    case 'install':
      await init();
      break;
    case 'status':
      await status();
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(`
🧠 hippocampus.md - Context Lifecycle Extension

Usage:
  npx hippocampus-md init     Install extension to ~/.pi/extensions/
  npx hippocampus-md status   Check installation status
  npx hippocampus-md help     Show this help

Docs: https://hippocampus.md
GitHub: https://github.com/starvex/hippocampus-md
`);
      break;
    default:
      logError(`Unknown command: ${command}`);
      console.log('Run "npx hippocampus-md help" for usage');
      process.exit(1);
  }
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
