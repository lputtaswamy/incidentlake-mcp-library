import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';

export function registerApproveKnowledgeDraft(server: McpServer) {
  server.registerTool(
    'approve_knowledge_draft',
    {
      description:
        'Approve a pending AI knowledge draft (POST /v1/knowledge/{knowledgeId}/approve). Registers it as an active knowledge item and embeds it so chat AI can use it. Get the id from list_pending_knowledge_drafts.',
      inputSchema: z.object({
        knowledgeId: z.string().uuid().describe('The UUID of the pending knowledge draft to approve'),
      }),
    },
    async (input) => {
      try {
        const data = await api.approveKnowledgeDraft(input.knowledgeId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error approving knowledge draft: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );
}
