# 🧠 hippocampus.md

> Context Lifecycle Extension for AI Agents — Memory that decays like biology

[![npm version](https://badge.fury.io/js/hippocampus-md.svg)](https://www.npmjs.com/package/hippocampus-md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

Traditional AI context management treats all information equally — keeping everything until the context window overflows, then brutally summarizing. This is like a human trying to remember every word of every conversation they've ever had.

**hippocampus.md** implements biologically-inspired memory decay:

- **Decisions and commitments** decay slowly (λ = 0.03, half-life ≈ 23 turns)
- **User intents** decay moderately (λ = 0.05, half-life ≈ 14 turns)
- **Context/background** decays faster (λ = 0.12, half-life ≈ 6 turns)
- **Tool results** decay quickly (λ = 0.2, half-life ≈ 3.5 turns)
- **Ephemeral messages** decay rapidly (λ = 0.35, half-life ≈ 2 turns)

## Quick Start

```bash
# Install globally
npm install -g hippocampus-md

# Initialize (auto-detects Pi/OpenClaw/Clawdbot)
npx hippocampus-md init

# Check status
npx hippocampus-md status

# Score a memory file
npx hippocampus-md score memory/2026-02-03.md
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Install extension (auto-detects platform) |
| `status` | Check installation and config |
| `score <file>` | Score a markdown memory file |
| `help` | Show available commands |

## Manual Installation

1. Copy `extension/hippocampus.ts` to `~/.pi/extensions/`
2. Set your Pi config's compaction mode to `"default"` (not `"safeguard"`)

```json
{
  "compaction": {
    "mode": "default"
  }
}
```

## Configuration

The extension creates `~/.pi/hippocampus.config.json` on first run:

```json
{
  "enabled": true,
  "debug": false,
  "logPath": "/tmp/hippocampus-debug.log",
  "decay": {
    "decision": 0.03,
    "user_intent": 0.05,
    "context": 0.12,
    "tool_result": 0.2,
    "ephemeral": 0.35
  },
  "retention": {
    "sparse": 0.25,
    "compress": 0.65
  },
  "sparseIndex": {
    "enabled": true,
    "path": "~/.pi/hippocampus-index.json"
  }
}
```

### Decay Rates (λ)

| Message Type | λ | Half-life | Description |
|-------------|---|-----------|-------------|
| decision | 0.03 | ~23 turns | Architectural choices, commitments |
| user_intent | 0.05 | ~14 turns | Goals, preferences, requests |
| context | 0.12 | ~6 turns | Background info, environment |
| tool_result | 0.2 | ~3.5 turns | API responses, file contents |
| ephemeral | 0.35 | ~2 turns | Greetings, acknowledgments |

### Retention Thresholds

- **score ≥ 0.65**: Keep full message
- **0.25 ≤ score < 0.65**: Compress to summary
- **score < 0.25**: Move to sparse index only

## How It Works

1. **Classification**: Each message is classified by type using heuristic rules
2. **Importance Scoring**: Base importance is calculated from content signals
3. **Decay Application**: Exponential decay based on message age and type
4. **Retention Decision**: Score determines keep/compress/sparse action
5. **Sparse Indexing**: Low-retention items stored as embeddings for later retrieval

### The Math

```
retention_score = base_importance × e^(-λ × age)
```

Where:
- `base_importance`: 0-1 score from content analysis
- `λ`: Type-specific decay rate
- `age`: Message age in turns

## Compression Results

Real-world testing shows:
- **26-48× compression ratios** while maintaining coherence
- **~98% quality** with pattern completion enabled
- **~15% of queries** need sparse index re-fetch

## Part of the Agent Brain Architecture

hippocampus.md is part of a larger vision for AI agent cognition:

- **[defrag.md](https://defrag.md)** — Sleep/consolidation protocol
- **[synapse.md](https://synapse.md)** — Multi-agent memory sharing
- **[hippocampus.md](https://hippocampus.md)** — Context lifecycle (you are here)
- **[neocortex.md](https://neocortex.md)** — Long-term memory format

## Contributing

Issues and PRs welcome at [github.com/starvex/hippocampus-md](https://github.com/starvex/hippocampus-md)

## License

MIT © Roman Godz

---

*"The hippocampus is not a storage device, it's a retrieval system."*
