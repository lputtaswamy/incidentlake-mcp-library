import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';

export function registerDismissKnowledgeDraft(server: McpServer) {
  server.registerTool(
    'dismiss_knowledge_draft',
    {
      description:
        'Dismiss a pending AI knowledge draft (POST /v1/knowledge/{knowledgeId}/dismiss). Takes it out of the review queue as a registered-but-inactive item (recoverable — never embedded, never reaches chat AI). Not a permanent delete. Get the id from list_pending_knowledge_drafts.',
      inputSchema: z.object({
        knowledgeId: z.string().uuid().describe('The UUID of the pending knowledge draft to dismiss'),
      }),
    },
    async (input) => {
      try {
        const data = await api.dismissKnowledgeDraft(input.knowledgeId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error dismissing knowledge draft: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );
}
