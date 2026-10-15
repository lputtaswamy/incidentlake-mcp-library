import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';
import type { JsonObject } from '../types';

type Input = {
  incidentId: string;
  taskId: string;
  source: 'jira' | 'backlog' | 'servicenow';
  reference: string;
};

export function registerLinkIncidentTaskExternalIssue(server: McpServer) {
  server.registerTool(
    'link_incident_task_external_issue',
    {
      description:
        "Link an existing external tracker issue (Jira, Backlog, or ServiceNow) to an incident task. The task's status and fields may be updated to match the linked issue. Reference can be the full URL or an identifier such as a Jira issue key (KAN-1) or a ServiceNow record number (INC0010001).",
      inputSchema: z.object({
        incidentId: z.string().uuid().describe('The UUID of the incident'),
        taskId: z.string().uuid().describe('The UUID of the task'),
        source: z
          .enum(['jira', 'backlog', 'servicenow'])
          .describe('The external tracker type'),
        reference: z
          .string()
          .min(1)
          .describe('Issue URL or key (Jira: KAN-1 or url, ServiceNow: INC0010001 or url)'),
      }) as z.ZodType<Input>,
    },
    async (input: Input) => {
      try {
        const body: JsonObject = { source: input.source, reference: input.reference };
        const data = await api.linkIncidentTaskExternalIssue(input.incidentId, input.taskId, body);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error linking external issue: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
