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

interface Platform {
  name: string;
  baseDir: string;
  extensionsDir: string;
  configName: string;
}

function detectPlatform(): Platform {
  const home = homedir();
  
  // Check for Clawdbot/Moltbot first (most specific)
  const clawdbotDir = join(home, '.clawdbot');
  if (existsSync(clawdbotDir)) {
    return {
      name: 'Clawdbot',
      baseDir: clawdbotDir,
      extensionsDir: join(clawdbotDir, 'extensions'),
      configName: 'clawdbot.json',
    };
  }
  
  // Check for OpenClaw
  const openclawDir = join(home, '.openclaw');
  if (existsSync(openclawDir)) {
    return {
      name: 'OpenClaw',
      baseDir: openclawDir,
      extensionsDir: join(openclawDir, 'extensions'),
      configName: 'openclaw.json',
    };
  }
  
  // Default to Pi
  const piDir = join(home, '.pi');
  return {
    name: 'Pi',
    baseDir: piDir,
    extensionsDir: join(piDir, 'extensions'),
    configName: 'config.json',
  };
}

async function init() {
  console.log('');
  log('🧠 hippocampus.md - Context Lifecycle Extension', COLORS.cyan);
  log('   Memory that decays like biology', COLORS.dim);
  console.log('');

  // Auto-detect platform
  const platform = detectPlatform();
  logStep(`Detected platform: ${platform.name}`);
  logSuccess(`Using ${platform.baseDir}`);
  
  const extensionsDir = platform.extensionsDir;
  const configPath = join(platform.baseDir, 'hippocampus.config.json');

  // Step 1: Create extensions directory if needed
  logStep('Checking extensions directory...');
  if (!existsSync(extensionsDir)) {
    mkdirSync(extensionsDir, { recursive: true });
    logSuccess(`Created ${extensionsDir}`);
  } else {
    logSuccess('Extensions directory exists');
  }

  // Step 2: Copy hippocampus.ts
  logStep('Installing hippocampus extension...');
  // __dirname is dist/bin/, so go up two levels to reach package root
  const sourceFile = join(__dirname, '..', '..', 'extension', 'hippocampus.ts');
  const destFile = join(extensionsDir, 'hippocampus.ts');

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
        path: join(platform.baseDir, 'hippocampus-index.json'),
      },
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    logSuccess(`Created config at ${configPath}`);
  } else {
    logSuccess('Config already exists');
  }

  // Step 4: Remind about platform config
  console.log('');
  log('📋 Final step - Update your config:', COLORS.yellow);
  console.log('');
  const mainConfigPath = join(platform.baseDir, platform.configName);
  log(`   In ${mainConfigPath}, set:`, COLORS.dim);
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

  // Auto-detect platform
  const platform = detectPlatform();
  log(`  Platform: ${platform.name}`, COLORS.dim);
  console.log('');

  const extensionPath = join(platform.extensionsDir, 'hippocampus.ts');
  const configPath = join(platform.baseDir, 'hippocampus.config.json');
  const indexPath = join(platform.baseDir, 'hippocampus-index.json');
  const logPath = '/tmp/hippocampus-debug.log';

  // Check extension
  if (existsSync(extensionPath)) {
    logSuccess(`Extension installed: ${extensionPath}`);
  } else {
    logError(`Extension not installed at ${extensionPath}`);
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

  // Check main platform config for compaction mode
  const mainConfigPath = join(platform.baseDir, platform.configName);
  if (existsSync(mainConfigPath)) {
    try {
      const mainConfig = JSON.parse(readFileSync(mainConfigPath, 'utf-8'));
      const mode = mainConfig?.compaction?.mode || 'unknown';
      if (mode === 'default') {
        logSuccess(`Compaction mode: ${mode} ✓`);
      } else {
        logWarning(`Compaction mode: ${mode} (needs "default" for hippocampus to work)`);
      }
    } catch {
      logWarning('Could not read main config');
    }
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

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_DECAY_RATES: Record<string, number> = {
  decision: 0.03,
  user_intent: 0.05,
  context: 0.12,
  tool_result: 0.20,
  ephemeral: 0.35,
  unknown: 0.15,
};

const DEFAULT_IMPORTANCE: Record<string, number> = {
  decision: 0.90,
  user_intent: 0.80,
  context: 0.50,
  tool_result: 0.30,
  ephemeral: 0.10,
  unknown: 0.40,
};

function hashContent(str: string): string {
  let hash = 5381;
  for (let i = 0; i < Math.min(str.length, 500); i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function classifyEntry(text: string): string {
  const lower = text.toLowerCase();
  
  // Check for explicit hippocampus tags
  const tagMatch = text.match(/<!--\s*hippocampus:\s*type=(\w+)/);
  if (tagMatch) return tagMatch[1];
  
  // Decision markers
  const decisionMarkers = ['decided', 'decision', 'will do', 'plan:', 'approach:', 'решил', 'решение', 'план:', '✅', '→'];
  if (decisionMarkers.some(m => lower.includes(m))) return 'decision';
  
  // User intent
  if (lower.includes('user wants') || lower.includes('roman wants') || lower.includes('requested')) return 'user_intent';
  
  // Tool output
  if (lower.includes('```') || lower.includes('output:') || lower.includes('error:')) return 'tool_result';
  
  // Ephemeral
  if (lower.includes('heartbeat') || lower.includes('no changes') || lower.length < 50) return 'ephemeral';
  
  return 'context';
}

function calculateRetention(importance: number, age: number, type: string, sparseThreshold: number): number {
  const lambda = DEFAULT_DECAY_RATES[type] || 0.15;
  const floor = type === 'decision' ? 0.50 : type === 'user_intent' ? 0.35 : 0;
  const raw = importance * Math.exp(-lambda * age);
  return Math.max(floor, raw);
}

function parseMarkdownEntries(content: string): Array<{ text: string; explicitScore: number | null; tokens: number }> {
  const entries: Array<{ text: string; explicitScore: number | null; tokens: number }> = [];
  const sections = content.split(/\n(?=##?\s)|(?:\n\n)+/);
  
  for (const section of sections) {
    const text = section.trim();
    if (!text || (text.startsWith('<!--') && text.endsWith('-->'))) continue;
    
    const scoreMatch = text.match(/<!--\s*hippocampus:.*?score=([\d.]+)/);
    const explicitScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;
    
    entries.push({ text, explicitScore, tokens: Math.ceil(text.length / 4) });
  }
  
  return entries;
}

interface ScoredItem {
  t: number;
  type: string;
  score: number;
  hash: string;
  summary: string;
  tokens: number;
}

async function score(filePath: string) {
  log('🧠 hippocampus.md - Memory Scoring', COLORS.cyan);
  console.log('');
  
  const resolvedPath = join(process.cwd(), filePath);
  
  if (!existsSync(resolvedPath)) {
    logError(`File not found: ${resolvedPath}`);
    process.exit(1);
  }
  
  logStep(`Scoring: ${resolvedPath}`);
  
  const content = readFileSync(resolvedPath, 'utf-8');
  const entries = parseMarkdownEntries(content);
  const total = entries.length;
  
  const sparseThreshold = 0.25;
  const compressThreshold = 0.65;
  
  const scored: ScoredItem[] = entries.map((entry, index) => {
    const type = classifyEntry(entry.text);
    const age = total - 1 - index;
    let importance = DEFAULT_IMPORTANCE[type] || 0.40;
    
    // Size penalty
    if (entry.tokens > 1000) importance = Math.max(0.1, importance - 0.15);
    
    const retention = entry.explicitScore !== null 
      ? entry.explicitScore 
      : calculateRetention(importance, age, type, sparseThreshold);
    
    return {
      t: Date.now(),
      type,
      score: Math.round(retention * 100) / 100,
      hash: hashContent(entry.text),
      summary: entry.text.slice(0, 200).replace(/\n/g, ' '),
      tokens: entry.tokens,
    };
  });
  
  const stats = {
    total: scored.length,
    sparse: scored.filter(e => e.score < sparseThreshold).length,
    compressed: scored.filter(e => e.score >= sparseThreshold && e.score < compressThreshold).length,
    kept: scored.filter(e => e.score >= compressThreshold).length,
    totalTokens: scored.reduce((sum, e) => sum + e.tokens, 0),
  };
  
  console.log('');
  logSuccess(`${stats.total} entries scored`);
  log(`     → ${stats.sparse} sparse (score < ${sparseThreshold})`, COLORS.dim);
  log(`     → ${stats.compressed} compressed (${sparseThreshold} ≤ score < ${compressThreshold})`, COLORS.dim);
  log(`     → ${stats.kept} kept (score ≥ ${compressThreshold})`, COLORS.dim);
  log(`     → ${stats.totalTokens} total tokens`, COLORS.dim);
  
  // Write output
  const outputPath = resolvedPath.replace(/\.md$/, '.scores.json');
  const output = {
    generated: new Date().toISOString(),
    source: filePath,
    agent: process.env.AGENT_ID || 'unknown',
    config: { sparseThreshold, compressThreshold },
    stats,
    items: scored,
  };
  
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log('');
  logSuccess(`Scores written to: ${outputPath}`);
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
    case 'score':
      if (!args[1]) {
        logError('Missing file path');
        console.log('Usage: npx hippocampus-md score <memory-file.md>');
        process.exit(1);
      }
      await score(args[1]);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(`
🧠 hippocampus.md - Context Lifecycle Extension

Usage:
  npx hippocampus-md init              Install extension (auto-detects Pi/OpenClaw)
  npx hippocampus-md status            Check installation status
  npx hippocampus-md score <file.md>   Score a memory file
  npx hippocampus-md help              Show this help

Examples:
  npx hippocampus-md score memory/2026-02-03.md
  npx hippocampus-md score ~/clawd/memory/today.md

Supported platforms:
  • Pi (~/.pi/)
  • OpenClaw (~/.openclaw/)
  • Clawdbot (~/.clawdbot/)

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
