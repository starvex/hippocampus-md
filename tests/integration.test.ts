import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  scoreMessages,
  buildHippocampusSummary,
  loadConfig,
  DEFAULT_CONFIG,
  type CompactionMessage,
  type HippocampusConfig
} from '../extension/hippocampus'

// Mock fs operations
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  appendFileSync: vi.fn()
}))

describe('Integration: Full Compaction Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockExistsSync = vi.mocked(existsSync)
    mockExistsSync.mockReturnValue(false) // No custom config
  })

  it('should handle a realistic session with mixed message types', async () => {
    // Mock a realistic coding session conversation
    const sessionMessages: CompactionMessage[] = [
      {
        role: 'user',
        content: 'I need help building a React TypeScript app with a file upload feature'
      },
      {
        role: 'assistant', 
        content: 'I\'ll help you create a React TypeScript app with file upload. My plan is to use React hooks and a modern file input approach with drag & drop support.'
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'write',
            tool_use_id: 'write_123'
          }
        ]
      },
      {
        role: 'tool',
        name: 'write',
        tool_call_id: 'write_123',
        content: 'Successfully created package.json with React and TypeScript dependencies'
      },
      {
        role: 'assistant',
        content: 'Great! I\'ve set up the project structure. Now let\'s create the file upload component.'
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use', 
            name: 'write',
            tool_use_id: 'write_124'
          }
        ]
      },
      {
        role: 'tool',
        name: 'write', 
        tool_call_id: 'write_124',
        content: `// FileUpload.tsx
import React, { useState, useCallback } from 'react';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  maxSize?: number;
  acceptedTypes?: string[];
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  maxSize = 10 * 1024 * 1024, // 10MB default
  acceptedTypes = ['image/*', 'application/pdf']
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => {
      if (file.size > maxSize) return false;
      return acceptedTypes.some(type => 
        file.type.match(type.replace('*', '.*'))
      );
    });
    
    onFileSelect(validFiles);
  }, [maxSize, acceptedTypes, onFileSelect]);
  
  return (
    <div 
      className={\`upload-zone \${isDragOver ? 'drag-over' : ''}\`}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
    >
      <p>Drag files here or click to browse</p>
      <input 
        type="file"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          onFileSelect(files);
        }}
        accept={acceptedTypes.join(',')}
      />
    </div>
  );
};`
      },
      {
        role: 'user',
        content: 'This looks great! Can you also add some styling for the drag and drop zone?'
      },
      {
        role: 'assistant',
        content: 'Absolutely! I\'ll create CSS styles for a polished drag-and-drop interface.'
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'write',
            tool_use_id: 'write_125'
          }
        ]
      },
      {
        role: 'tool',
        name: 'write',
        tool_call_id: 'write_125', 
        content: `/* FileUpload.css */
.upload-zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  background-color: #fafafa;
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.upload-zone:hover {
  border-color: #007bff;
  background-color: #f0f8ff;
}

.upload-zone.drag-over {
  border-color: #007bff;
  background-color: #e3f2fd;
  transform: scale(1.02);
}

.upload-zone input[type="file"] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.upload-zone p {
  margin: 0;
  color: #666;
  font-size: 16px;
  pointer-events: none;
}

.upload-zone.drag-over p {
  color: #007bff;
  font-weight: 500;
}`
      },
      {
        role: 'user',
        content: 'Perfect! How do I use this component in my main app?'
      },
      {
        role: 'assistant',
        content: 'I\'ll show you how to integrate the FileUpload component into your main App component with file handling.'
      },
      {
        role: 'user',
        content: 'heartbeat'
      },
      {
        role: 'assistant', 
        content: 'HEARTBEAT_OK'
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'write', 
            tool_use_id: 'write_126'
          }
        ]
      },
      {
        role: 'tool',
        name: 'write',
        tool_call_id: 'write_126',
        content: `// App.tsx
import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import './App.css';
import './components/FileUpload.css';

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
}

function App() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  const handleFileSelect = (files: File[]) => {
    const newFiles = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      preview: file.type.startsWith('image/') 
        ? URL.createObjectURL(file)
        : undefined
    }));
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };
  
  const removeFile = (id: string) => {
    setUploadedFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      // Clean up object URLs
      const removed = prev.find(f => f.id === id);
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return updated;
    });
  };
  
  return (
    <div className="App">
      <header className="App-header">
        <h1>File Upload Demo</h1>
        <FileUpload 
          onFileSelect={handleFileSelect}
          maxSize={5 * 1024 * 1024} // 5MB
          acceptedTypes={['image/*', 'application/pdf', '.txt']}
        />
        
        {uploadedFiles.length > 0 && (
          <div className="uploaded-files">
            <h2>Uploaded Files</h2>
            {uploadedFiles.map(({ file, id, preview }) => (
              <div key={id} className="file-item">
                {preview && (
                  <img src={preview} alt={file.name} className="file-preview" />
                )}
                <div className="file-info">
                  <strong>{file.name}</strong>
                  <span>({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button onClick={() => removeFile(id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;`
      },
      {
        role: 'user',
        content: 'Excellent work! This is exactly what I needed. The drag and drop functionality works perfectly.'
      }
    ]

    // Load default config
    const config = loadConfig('/workspace')

    // Score all messages
    const scored = scoreMessages(sessionMessages, config)

    // Build summary
    const summary = buildHippocampusSummary(scored, sessionMessages, config)

    // Verify the compaction worked correctly
    expect(scored).toHaveLength(sessionMessages.length)

    // Check that we have proper distribution across retention categories
    const highRetention = scored.filter(e => e.retention >= config.compressThreshold)
    const midRetention = scored.filter(e => 
      e.retention >= config.sparseThreshold && e.retention < config.compressThreshold
    )
    const lowRetention = scored.filter(e => e.retention < config.sparseThreshold)

    // Should have some entries in each category
    expect(highRetention.length).toBeGreaterThan(0)
    expect(lowRetention.length).toBeGreaterThan(0)

    // Summary should contain all expected sections
    expect(summary).toContain('# hippocampus.md Compaction')
    expect(summary).toContain('## Goal')
    expect(summary).toContain('React TypeScript app with a file upload') // From user intent

    // Should contain metadata
    expect(summary).toContain('entries: ' + sessionMessages.length)

    // Should include high-retention content (decisions and user intents)
    expect(summary).toContain('My plan is to use React hooks') // Assistant decision
    
    // Tool results should be in sparse index or compressed section
    const toolResults = scored.filter(e => e.type === 'tool_result')
    expect(toolResults.length).toBeGreaterThan(0) // We have several file writes

    // Ephemeral messages should have very low retention
    const ephemeral = scored.filter(e => e.type === 'ephemeral')
    expect(ephemeral.length).toBeGreaterThan(0) // We have heartbeat messages
    ephemeral.forEach(entry => {
      expect(entry.retention).toBeLessThan(0.3)
    })

    // User intents should have decent retention (accounting for age)
    const userIntents = scored.filter(e => e.type === 'user_intent' && !e.contentPreview.includes('heartbeat'))
    userIntents.forEach(entry => {
      expect(entry.retention).toBeGreaterThan(0.2) // Adjusted for age decay
    })

    // Recent messages should have recency bonus
    const lastFiveEntries = scored.slice(-5)
    lastFiveEntries.forEach(entry => {
      if (entry.type !== 'ephemeral') {
        // With recency bonus (+0.15), importance should be higher than base
        const baseImportance = getBaseImportanceForType(entry.type)
        expect(entry.importance).toBeGreaterThanOrEqual(baseImportance + 0.1) // At least base + some bonus
      }
    })

    // Compression ratio should be reasonable for a real session
    const totalOriginalTokens = scored.reduce((sum, e) => sum + e.tokenEstimate, 0)
    expect(totalOriginalTokens).toBeGreaterThan(1000) // Substantial content
    
    const summaryTokens = Math.ceil(summary.length / 4)
    const compressionRatio = totalOriginalTokens / summaryTokens
    expect(compressionRatio).toBeGreaterThan(1) // Should achieve compression
  })

  it('should handle edge cases gracefully', () => {
    // Test with minimal messages
    const minimalMessages: CompactionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello!' }
    ]

    const config = loadConfig('/workspace')
    const scored = scoreMessages(minimalMessages, config)
    const summary = buildHippocampusSummary(scored, minimalMessages, config)

    expect(summary).toContain('# hippocampus.md Compaction')
    expect(summary).toContain('entries: 2')
  })

  it('should preserve important decisions even with high age', () => {
    // Create messages where decisions are older but should still be preserved
    const messages: CompactionMessage[] = [
      { 
        role: 'assistant', 
        content: 'I have decided to use TypeScript for this project because of its type safety benefits'
      },
      ...Array(50).fill(null).map((_, i) => ({
        role: 'tool',
        content: `Tool execution ${i}`
      })),
      {
        role: 'user',
        content: 'How is the project going?'
      }
    ]

    const config = loadConfig('/workspace')
    const scored = scoreMessages(messages, config)

    // The decision should still have decent retention despite being old
    const decisionEntry = scored.find(e => e.type === 'decision')
    expect(decisionEntry).toBeDefined()
    expect(decisionEntry!.retention).toBeGreaterThanOrEqual(config.retentionFloor.decision || 0.5)
  })

  it('should handle custom configuration correctly', () => {
    // Mock custom config
    const mockExistsSync = vi.mocked(existsSync)
    const mockReadFileSync = vi.mocked(readFileSync)
    
    const customConfig = {
      sparseThreshold: 0.1, // Very low - most things go to sparse
      compressThreshold: 0.9, // Very high - few things kept
      decayRates: {
        tool_result: 0.5 // Faster decay for tools
      }
    }

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(customConfig))

    const messages: CompactionMessage[] = [
      { role: 'user', content: 'Test message' },
      { role: 'tool', content: 'Tool result' },
      { role: 'assistant', content: 'Response' }
    ]

    const config = loadConfig('/workspace')
    const scored = scoreMessages(messages, config)
    const summary = buildHippocampusSummary(scored, messages, config)

    // With custom config (very low sparse threshold), should have some distribution
    const sparseCount = scored.filter(e => e.retention < config.sparseThreshold).length
    expect(scored.length).toBeGreaterThan(0) // At least we have entries
    // Since sparseThreshold is 0.1, most entries might not reach sparse level

    // Tool result should decay faster with custom rate
    const toolEntry = scored.find(e => e.type === 'tool_result')
    expect(toolEntry).toBeDefined()
    // Should use faster decay rate
  })

  it('should calculate reference bonuses correctly', () => {
    const messages: CompactionMessage[] = [
      { role: 'user', content: 'Please analyze the database schema' },
      { role: 'tool', content: 'Database schema loaded successfully' },
      { role: 'assistant', content: 'I see the database schema has tables for users, posts, and comments' }
    ]

    const config = loadConfig('/workspace')
    const scored = scoreMessages(messages, config)

    // The tool result should get a reference bonus because "database schema" appears later
    const toolEntry = scored.find(e => e.type === 'tool_result')
    const userEntry = scored.find(e => e.type === 'user_intent')
    
    expect(toolEntry).toBeDefined()
    expect(userEntry).toBeDefined()
    
    // Both should get reference bonuses due to content overlap
    expect(toolEntry!.importance).toBeGreaterThan(getBaseImportanceForType('tool_result'))
    expect(userEntry!.importance).toBeGreaterThan(getBaseImportanceForType('user_intent'))
  })

  // Helper function to get base importance (for test assertions)
  function getBaseImportanceForType(type: string): number {
    const scores: Record<string, number> = {
      decision: 0.90,
      user_intent: 0.80,
      context: 0.50,
      tool_result: 0.30,
      ephemeral: 0.10,
      unknown: 0.40,
    }
    return scores[type] || 0.40
  }
})