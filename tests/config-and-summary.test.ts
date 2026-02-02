import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  loadConfig,
  buildHippocampusSummary,
  DEFAULT_CONFIG,
  type HippocampusConfig,
  type CompactionMessage,
  type ScoredEntry,
  type EntryType
} from '../extension/hippocampus'

// Mock fs operations
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  appendFileSync: vi.fn()
}))

describe('loadConfig', () => {
  const mockExistsSync = vi.mocked(existsSync)
  const mockReadFileSync = vi.mocked(readFileSync)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return default config when no config file exists', () => {
    mockExistsSync.mockReturnValue(false)
    
    const config = loadConfig('/workspace')
    
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(mockExistsSync).toHaveBeenCalledWith('/workspace/hippocampus.config.json')
  })

  it('should load and merge custom config', () => {
    const customConfig = {
      sparseThreshold: 0.3,
      debug: true,
      decayRates: {
        decision: 0.02
      }
    }

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(customConfig))
    
    const config = loadConfig('/workspace')
    
    expect(config.sparseThreshold).toBe(0.3)
    expect(config.debug).toBe(true)
    expect(config.decayRates.decision).toBe(0.02)
    // Should preserve other default values
    expect(config.decayRates.tool_result).toBe(DEFAULT_CONFIG.decayRates.tool_result)
    expect(config.compressThreshold).toBe(DEFAULT_CONFIG.compressThreshold)
  })

  it('should handle invalid JSON gracefully', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('invalid json {')
    
    // Should not throw and return default config
    const config = loadConfig('/workspace')
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('should handle read errors gracefully', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Permission denied')
    })
    
    // Should not throw and return default config
    const config = loadConfig('/workspace')
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('should deeply merge nested config objects', () => {
    const customConfig = {
      retentionFloor: {
        user_intent: 0.4
      },
      decayRates: {
        ephemeral: 0.5
      }
    }

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(customConfig))
    
    const config = loadConfig('/workspace')
    
    // Should merge retention floors
    expect(config.retentionFloor.user_intent).toBe(0.4)
    expect(config.retentionFloor.decision).toBe(DEFAULT_CONFIG.retentionFloor.decision)
    
    // Should merge decay rates
    expect(config.decayRates.ephemeral).toBe(0.5)
    expect(config.decayRates.decision).toBe(DEFAULT_CONFIG.decayRates.decision)
  })
})

describe('buildHippocampusSummary', () => {
  const config = DEFAULT_CONFIG

  const createScoredEntry = (
    index: number,
    type: EntryType,
    retention: number,
    content: string,
    tokenEstimate = 50
  ): ScoredEntry => ({
    index,
    type,
    importance: 0.5,
    retention,
    tokenEstimate,
    summary: '',
    role: type === 'user_intent' ? 'user' : 'assistant',
    contentPreview: content
  })

  const createMessage = (role: string, content: string): CompactionMessage => ({
    role,
    content
  })

  it('should create proper summary structure', () => {
    const scored: ScoredEntry[] = [
      createScoredEntry(0, 'user_intent', 0.8, 'Build a React app with TypeScript'),
      createScoredEntry(1, 'decision', 0.9, 'I will use Vite as the build tool'),
      createScoredEntry(2, 'context', 0.6, 'Let me explain the benefits of Vite'),
      createScoredEntry(3, 'tool_result', 0.3, 'npm install completed successfully'),
      createScoredEntry(4, 'ephemeral', 0.1, 'HEARTBEAT_OK')
    ]

    const messages: CompactionMessage[] = [
      createMessage('user', 'Build a React app with TypeScript'),
      createMessage('assistant', 'I will use Vite as the build tool'),
      createMessage('assistant', 'Let me explain the benefits of Vite'),
      createMessage('tool', 'npm install completed successfully'),
      createMessage('user', 'HEARTBEAT_OK')
    ]

    const summary = buildHippocampusSummary(scored, messages, config)

    // Check basic structure
    expect(summary).toContain('# hippocampus.md Compaction')
    expect(summary).toContain('## Goal')
    expect(summary).toContain('## Active Context (high retention)')
    expect(summary).toContain('## Compressed (mid retention')
    expect(summary).toContain('## Sparse Index (decayed')
    
    // Check metadata comments
    expect(summary).toContain('entries: 5')
    expect(summary).toContain('sparse: 1') // ephemeral
    expect(summary).toContain('compressed: 2') // context and tool_result
    expect(summary).toContain('kept: 2') // user_intent and decision
  })

  it('should extract goals from user_intent entries', () => {
    const scored: ScoredEntry[] = [
      createScoredEntry(0, 'user_intent', 0.8, 'Build a React application'),
      createScoredEntry(1, 'user_intent', 0.7, 'Make it responsive and accessible'),
      createScoredEntry(2, 'user_intent', 0.2, 'This goal should not appear') // Too low retention
    ]

    const messages: CompactionMessage[] = [
      createMessage('user', 'Build a React application'),
      createMessage('user', 'Make it responsive and accessible'),
      createMessage('user', 'This goal should not appear')
    ]

    const summary = buildHippocampusSummary(scored, messages, config)

    expect(summary).toContain('- Build a React application')
    expect(summary).toContain('- Make it responsive and accessible')
    // Low retention entries still appear in sparse section, just not in goals section
    expect(summary.substring(summary.indexOf('## Goal'), summary.indexOf('## Active Context') || summary.indexOf('## Compressed') || summary.indexOf('## Sparse'))).not.toContain('This goal should not appear')
  })

  it('should include prior context when provided', () => {
    const scored: ScoredEntry[] = []
    const messages: CompactionMessage[] = []
    const previousSummary = 'Previous session summary content'

    const summary = buildHippocampusSummary(scored, messages, config, previousSummary)

    expect(summary).toContain('## Prior Context')
    expect(summary).toContain('Previous session summary content')
  })

  it('should respect sparse index token limit', () => {
    const config: HippocampusConfig = {
      ...DEFAULT_CONFIG,
      maxSparseIndexTokens: 50 // Very small limit
    }

    // Create many sparse entries (low retention)
    const scored: ScoredEntry[] = Array(20).fill(null).map((_, i) =>
      createScoredEntry(i, 'tool_result', 0.1, `Tool result ${i}`, 20)
    )

    const messages: CompactionMessage[] = Array(20).fill(null).map((_, i) =>
      createMessage('tool', `Tool result ${i}`)
    )

    const summary = buildHippocampusSummary(scored, messages, config)

    // Should indicate some entries were dropped
    expect(summary).toContain('additional entries dropped')
  })

  it('should categorize entries correctly by retention thresholds', () => {
    const scored: ScoredEntry[] = [
      createScoredEntry(0, 'decision', 0.9, 'High retention entry'),      // kept
      createScoredEntry(1, 'context', 0.5, 'Medium retention entry'),     // compressed
      createScoredEntry(2, 'tool_result', 0.1, 'Low retention entry')     // sparse
    ]

    const messages: CompactionMessage[] = [
      createMessage('assistant', 'High retention entry'),
      createMessage('assistant', 'Medium retention entry'), 
      createMessage('tool', 'Low retention entry')
    ]

    const summary = buildHippocampusSummary(scored, messages, config)

    // Check that entries appear in correct sections
    expect(summary.indexOf('High retention entry')).toBeLessThan(
      summary.indexOf('Medium retention entry')
    )
    expect(summary.indexOf('Medium retention entry')).toBeLessThan(
      summary.indexOf('Low retention entry')
    )

    // Check retention scores are included
    expect(summary).toContain('(r=0.90)')
    expect(summary).toContain('(r=0.50)')
  })

  it('should calculate compression statistics correctly', () => {
    const scored: ScoredEntry[] = [
      createScoredEntry(0, 'context', 0.8, 'Entry 1', 1000),
      createScoredEntry(1, 'context', 0.8, 'Entry 2', 2000),
      createScoredEntry(2, 'tool_result', 0.2, 'Entry 3', 500)
    ]

    const messages: CompactionMessage[] = [
      createMessage('assistant', 'Entry 1'),
      createMessage('assistant', 'Entry 2'),
      createMessage('tool', 'Entry 3')
    ]

    const summary = buildHippocampusSummary(scored, messages, config)

    // Should contain statistics
    expect(summary).toContain('3500tok →') // Original tokens
    expect(summary).toContain('× compression)')
  })

  it('should handle empty input gracefully', () => {
    const summary = buildHippocampusSummary([], [], config)

    expect(summary).toContain('# hippocampus.md Compaction')
    expect(summary).toContain('entries: 0')
    expect(summary).toContain('0tok → 0tok')
  })

  it('should format different entry types correctly in sections', () => {
    const scored: ScoredEntry[] = [
      createScoredEntry(0, 'tool_result', 0.1, 'File read completed', 100),
      createScoredEntry(1, 'user_intent', 0.1, 'Read this file please', 50),
      createScoredEntry(2, 'decision', 0.1, 'I will read the file now', 75),
      createScoredEntry(3, 'ephemeral', 0.1, 'HEARTBEAT_OK', 10)
    ]

    const messages: CompactionMessage[] = [
      { role: 'tool', content: 'File read completed', toolName: 'read' },
      { role: 'user', content: 'Read this file please' },
      { role: 'assistant', content: 'I will read the file now' },
      { role: 'user', content: 'HEARTBEAT_OK' }
    ]

    const summary = buildHippocampusSummary(scored, messages, config)

    // Check sparse index formatting
    expect(summary).toContain('[TOOL:read] 100tok →')
    expect(summary).toContain('[USER] "Read this file please"')
    expect(summary).toContain('[DECISION] "I will read the file now"')
    expect(summary).toContain('[EPHEMERAL] HEARTBEAT_OK')
  })
})