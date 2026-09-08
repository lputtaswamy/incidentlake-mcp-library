import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';

export function registerListReportDrafts(server: McpServer) {
  server.registerTool(
    'list_report_drafts',
    {
      description:
        'List report drafts for an incident (newest first per type). Optionally filter by draft type: summary, timeline, or postmortem. ' +
        'To PUBLISH a draft, use the publish_report tool (it defaults to the latest draft of the given type).',
      inputSchema: z.object({
        incidentId: z.string().uuid().describe('The UUID of the incident'),
        draftType: z
          .enum(['summary', 'timeline', 'postmortem'])
          .optional()
          .describe('Optional filter by section type'),
      }),
    },
    async (input) => {
      try {
        const data = await api.listReportDrafts(input.incidentId, input.draftType);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error listing report drafts: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );
}
