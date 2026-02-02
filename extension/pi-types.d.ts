// Mock type definitions for Pi/OpenClaw extension API
// These types are mocked for testing purposes

declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionAPI {
    on(event: string, handler: (event: any, ctx: any) => void | Promise<any>): void;
  }

  export interface CompactionEvent {
    preparation: {
      messagesToSummarize: any[];
      turnPrefixMessages: any[];
      tokensBefore: number;
      firstKeptEntryId?: string;
      previousSummary?: string;
    };
  }

  export interface ExtensionContext {
    ui: {
      notify(message: string, type?: 'info' | 'warning' | 'error'): void;
    };
  }

  export interface CompactionResult {
    compaction: {
      summary: string;
      firstKeptEntryId?: string;
      tokensBefore: number;
    };
  }
}