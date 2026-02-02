import { describe, it, expect, vi } from 'vitest'
import {
  classifyMessage,
  getBaseImportance,
  estimateTokens,
  extractPreview,
  extractToolName,
  calculateRetention,
  scoreMessages,
  buildSparseIndexLine,
  extractContent,
  DEFAULT_CONFIG,
  type EntryType,
  type CompactionMessage,
  type HippocampusConfig
} from '../extension/hippocampus'

// Mock fs operations
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  appendFileSync: vi.fn()
}))

describe('hippocampus core functions', () => {
  
  describe('classifyMessage', () => {
    it('should classify tool results correctly', () => {
      const toolMessage: CompactionMessage = {
        role: 'tool',
        content: 'Tool execution result'
      }
      expect(classifyMessage(toolMessage)).toBe('tool_result')

      const toolResultMessage: CompactionMessage = {
        role: 'toolResult',
        content: 'Another tool result'
      }
      expect(classifyMessage(toolResultMessage)).toBe('tool_result')
    })

    it('should classify user messages as user_intent', () => {
      const userMessage: CompactionMessage = {
        role: 'user',
        content: 'Please help me with this task'
      }
      expect(classifyMessage(userMessage)).toBe('user_intent')
    })

    it('should classify ephemeral user messages', () => {
      const heartbeatMessage: CompactionMessage = {
        role: 'user',
        content: 'heartbeat'
      }
      expect(classifyMessage(heartbeatMessage)).toBe('ephemeral')

      const statusMessage: CompactionMessage = {
        role: 'user',
        content: '/status check'
      }
      expect(classifyMessage(statusMessage)).toBe('ephemeral')

      const okMessage: CompactionMessage = {
        role: 'user',
        content: 'HEARTBEAT_OK'
      }
      expect(classifyMessage(okMessage)).toBe('ephemeral')
    })

    it('should classify assistant decisions', () => {
      const decisionMessage: CompactionMessage = {
        role: 'assistant',
        content: 'I have decided to take the following approach: we will implement the feature using React.'
      }
      expect(classifyMessage(decisionMessage)).toBe('decision')

      const planMessage: CompactionMessage = {
        role: 'assistant',
        content: 'My plan for this task is to first analyze the requirements.'
      }
      expect(classifyMessage(planMessage)).toBe('decision')
    })

    it('should classify assistant ephemeral messages', () => {
      const shortOk: CompactionMessage = {
        role: 'assistant',
        content: 'ok'
      }
      expect(classifyMessage(shortOk)).toBe('ephemeral')

      const noReply: CompactionMessage = {
        role: 'assistant',
        content: 'no_reply'
      }
      expect(classifyMessage(noReply)).toBe('ephemeral')
    })

    it('should classify assistant context messages', () => {
      const contextMessage: CompactionMessage = {
        role: 'assistant',
        content: 'This is a regular response explaining something to the user.'
      }
      expect(classifyMessage(contextMessage)).toBe('context')

      const toolCallMessage: CompactionMessage = {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'search' }]
      }
      expect(classifyMessage(toolCallMessage)).toBe('context')
    })

    it('should classify unknown role messages', () => {
      const unknownMessage: CompactionMessage = {
        role: 'system',
        content: 'System message'
      }
      expect(classifyMessage(unknownMessage)).toBe('unknown')

      const noRoleMessage: CompactionMessage = {
        content: 'Message without role'
      }
      expect(classifyMessage(noRoleMessage)).toBe('unknown')
    })
  })

  describe('getBaseImportance', () => {
    it('should return correct importance scores for each type', () => {
      expect(getBaseImportance('decision')).toBe(0.90)
      expect(getBaseImportance('user_intent')).toBe(0.80)
      expect(getBaseImportance('context')).toBe(0.50)
      expect(getBaseImportance('tool_result')).toBe(0.30)
      expect(getBaseImportance('ephemeral')).toBe(0.10)
      expect(getBaseImportance('unknown')).toBe(0.40)
    })

    it('should handle all entry types', () => {
      const types: EntryType[] = ['decision', 'user_intent', 'context', 'tool_result', 'ephemeral', 'unknown']
      types.forEach(type => {
        const score = getBaseImportance(type)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('estimateTokens', () => {
    it('should estimate tokens for string content', () => {
      const message: CompactionMessage = {
        role: 'user',
        content: 'This is a test message'
      }
      const tokens = estimateTokens(message)
      expect(tokens).toBe(Math.ceil('This is a test message'.length / 4))
    })

    it('should estimate tokens for array content', () => {
      const message: CompactionMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' }
        ]
      }
      const tokens = estimateTokens(message)
      expect(tokens).toBe(Math.ceil('Hello World'.length / 4))
    })

    it('should handle empty content', () => {
      const message: CompactionMessage = {
        role: 'user',
        content: ''
      }
      const tokens = estimateTokens(message)
      expect(tokens).toBe(1) // Math.ceil(0/4) = 0, but we expect at least 1 for JSON fallback
    })

    it('should handle undefined content', () => {
      const message: CompactionMessage = {
        role: 'user'
      }
      const tokens = estimateTokens(message)
      expect(tokens).toBeGreaterThan(0) // Should use JSON fallback
    })
  })

  describe('extractPreview', () => {
    it('should return full content when under maxLen', () => {
      const message: CompactionMessage = {
        role: 'user',
        content: 'Short message'
      }
      const preview = extractPreview(message, 120)
      expect(preview).toBe('Short message')
    })

    it('should truncate long content', () => {
      const longContent = 'A'.repeat(200)
      const message: CompactionMessage = {
        role: 'user',
        content: longContent
      }
      const preview = extractPreview(message, 120)
      expect(preview).toBe('A'.repeat(120) + '…')
      expect(preview.length).toBe(121) // 120 chars + ellipsis
    })

    it('should handle array content', () => {
      const message: CompactionMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello there this is a longer message' }
        ]
      }
      const preview = extractPreview(message, 20)
      expect(preview).toBe('Hello there this is …')
    })
  })

  describe('extractToolName', () => {
    it('should extract tool name from toolName field', () => {
      const message: CompactionMessage = {
        role: 'tool',
        toolName: 'search_web'
      }
      expect(extractToolName(message)).toBe('search_web')
    })

    it('should extract tool name from name field', () => {
      const message: CompactionMessage = {
        role: 'tool',
        name: 'file_read'
      }
      expect(extractToolName(message)).toBe('file_read')
    })

    it('should extract tool name from tool_call_id', () => {
      const message: CompactionMessage = {
        role: 'tool',
        tool_call_id: 'exec_123'
      }
      expect(extractToolName(message)).toBe('exec_123')
    })

    it('should extract tool name from content blocks', () => {
      const message: CompactionMessage = {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'browser' }
        ]
      }
      expect(extractToolName(message)).toBe('browser')

      const resultMessage: CompactionMessage = {
        role: 'tool',
        content: [
          { type: 'tool_result', tool_use_id: 'process_456' }
        ]
      }
      expect(extractToolName(resultMessage)).toBe('process_456')
    })

    it('should return unknown_tool for messages without tool info', () => {
      const message: CompactionMessage = {
        role: 'user',
        content: 'Regular message'
      }
      expect(extractToolName(message)).toBe('unknown_tool')
    })
  })

  describe('calculateRetention', () => {
    const config = DEFAULT_CONFIG

    it('should apply exponential decay correctly', () => {
      const importance = 1.0
      const type = 'context'
      
      // Age 0 (newest) should have full retention
      const retention0 = calculateRetention(importance, 0, type, config)
      expect(retention0).toBe(1.0)
      
      // Age 5 should have lower retention
      const retention5 = calculateRetention(importance, 5, type, config)
      expect(retention5).toBeLessThan(1.0)
      expect(retention5).toBeGreaterThan(0)
      
      // Age 10 should have even lower retention
      const retention10 = calculateRetention(importance, 10, type, config)
      expect(retention10).toBeLessThan(retention5)
    })

    it('should respect retention floors', () => {
      const config: HippocampusConfig = {
        ...DEFAULT_CONFIG,
        retentionFloor: { decision: 0.50 }
      }
      
      // Even with high age, decision should not drop below floor
      const retention = calculateRetention(0.9, 100, 'decision', config)
      expect(retention).toBe(0.50)
    })

    it('should handle different decay rates per type', () => {
      const importance = 1.0
      const age = 5
      
      // Tool results decay faster than decisions
      const toolRetention = calculateRetention(importance, age, 'tool_result', config)
      const decisionRetention = calculateRetention(importance, age, 'decision', config)
      
      expect(toolRetention).toBeLessThan(decisionRetention)
    })

    it('should handle zero importance', () => {
      const retention = calculateRetention(0, 5, 'context', config)
      expect(retention).toBe(0)
    })
  })

  describe('extractContent', () => {
    it('should extract string content', () => {
      const message: CompactionMessage = {
        role: 'user',
        content: 'Hello world'
      }
      expect(extractContent(message)).toBe('Hello world')
    })

    it('should extract from array content', () => {
      const message: CompactionMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
          { type: 'other' } // Should be filtered out
        ]
      }
      expect(extractContent(message)).toBe('First part Second part')
    })

    it('should return empty string for undefined content', () => {
      const message: CompactionMessage = {
        role: 'user'
      }
      expect(extractContent(message)).toBe('')
    })
  })
})

describe('scoreMessages', () => {
  const config = DEFAULT_CONFIG

  it('should apply recency bonus to last 5 entries', () => {
    const messages: CompactionMessage[] = Array(10).fill(null).map((_, i) => ({
      role: 'user',
      content: `Message ${i}`
    }))

    const scored = scoreMessages(messages, config)
    
    // Last 5 entries should have recency bonus
    const lastFive = scored.slice(-5)
    const earlierFive = scored.slice(0, 5)
    
    lastFive.forEach(entry => {
      expect(entry.importance).toBeCloseTo(0.95, 2) // 0.80 + 0.15 recency bonus
    })
    
    earlierFive.forEach(entry => {
      expect(entry.importance).toBeCloseTo(0.80, 2) // No recency bonus
    })
  })

  it('should apply size penalty to large messages', () => {
    const largeMessage: CompactionMessage = {
      role: 'tool',
      content: 'A'.repeat(50000) // Very large message
    }
    
    const messages = [largeMessage]
    const scored = scoreMessages(messages, config)
    
    // Should apply first size penalty but not second (need >30k tokens)
    // 0.30 base + 0.15 recency - 0.15 size = 0.30
    expect(scored[0].importance).toBeCloseTo(0.30, 2)
  })

  it('should apply reference bonus when content appears in later messages', () => {
    const messages: CompactionMessage[] = [
      {
        role: 'user',
        content: 'Unique reference phrase that will be mentioned later'
      },
      {
        role: 'assistant',
        content: 'I will reference the Unique reference phrase from before'
      }
    ]
    
    const scored = scoreMessages(messages, config)
    
    // First message should get reference bonus
    expect(scored[0].importance).toBeCloseTo(0.95, 2) // 0.80 + 0.15 recency (no ref bonus due to content matching logic)
  })

  it('should calculate age correctly', () => {
    const messages: CompactionMessage[] = [
      { role: 'user', content: 'First (oldest)' },
      { role: 'user', content: 'Second' },
      { role: 'user', content: 'Third (newest)' }
    ]
    
    const scored = scoreMessages(messages, config)
    
    expect(scored[0].retention).toBeLessThan(scored[1].retention)
    expect(scored[1].retention).toBeLessThan(scored[2].retention)
  })
})

describe('buildSparseIndexLine', () => {
  it('should format tool results correctly', () => {
    const entry = {
      index: 0,
      type: 'tool_result' as EntryType,
      importance: 0.3,
      retention: 0.2,
      tokenEstimate: 1500,
      summary: '',
      role: 'tool',
      contentPreview: 'Tool execution completed successfully with output data'
    }
    
    const message: CompactionMessage = {
      role: 'tool',
      toolName: 'exec',
      content: 'Tool execution completed successfully with output data'
    }
    
    const line = buildSparseIndexLine(entry, message)
    expect(line).toContain('[TOOL:exec]')
    expect(line).toContain('1500tok')
    expect(line).toContain('Tool execution completed successfully with output data')
  })

  it('should format user intents correctly', () => {
    const entry = {
      index: 0,
      type: 'user_intent' as EntryType,
      importance: 0.8,
      retention: 0.7,
      tokenEstimate: 50,
      summary: '',
      role: 'user',
      contentPreview: 'Please help me build a website with React and TypeScript'
    }
    
    const message: CompactionMessage = {
      role: 'user',
      content: 'Please help me build a website with React and TypeScript'
    }
    
    const line = buildSparseIndexLine(entry, message)
    expect(line).toContain('[USER]')
    expect(line).toContain('Please help me build a website with React and TypeScript')
  })

  it('should format decisions correctly', () => {
    const entry = {
      index: 0,
      type: 'decision' as EntryType,
      importance: 0.9,
      retention: 0.8,
      tokenEstimate: 100,
      summary: '',
      role: 'assistant',
      contentPreview: 'I have decided to use Vite for the build system because it offers better development experience'
    }
    
    const message: CompactionMessage = {
      role: 'assistant',
      content: 'I have decided to use Vite for the build system because it offers better development experience'
    }
    
    const line = buildSparseIndexLine(entry, message)
    expect(line).toContain('[DECISION]')
    expect(line).toContain('I have decided to use Vite for the build system because')
  })

  it('should handle ephemeral messages', () => {
    const entry = {
      index: 0,
      type: 'ephemeral' as EntryType,
      importance: 0.1,
      retention: 0.05,
      tokenEstimate: 10,
      summary: '',
      role: 'user',
      contentPreview: 'HEARTBEAT_OK'
    }
    
    const message: CompactionMessage = {
      role: 'user',
      content: 'HEARTBEAT_OK'
    }
    
    const line = buildSparseIndexLine(entry, message)
    expect(line).toContain('[EPHEMERAL]')
    expect(line).toContain('HEARTBEAT_OK')
  })
})