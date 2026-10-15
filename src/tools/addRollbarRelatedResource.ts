import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';
import type { JsonObject } from '../types';

type Input = {
  incidentId: string;
  counter: string;
  name?: string;
};

export function registerAddRollbarRelatedResource(server: McpServer) {
  server.registerTool(
    'add_rollbar_related_resource',
    {
      description:
        "Link a Rollbar item (from search_rollbar_items) to an incident as a related resource. The click-through URL is built server-side from the tenant's Rollbar integration settings. If this item was already linked, the existing link is returned.",
      inputSchema: z.object({
        incidentId: z.string().uuid().describe('The UUID of the incident'),
        counter: z
          .string()
          .regex(/^\d{1,12}$/, 'counter must be the numeric Rollbar item number')
          .describe('Rollbar item number (counter)'),
        name: z.string().optional().describe('Item title, used as the resource title'),
      }) as z.ZodType<Input>,
    },
    async (input: Input) => {
      try {
        const body: JsonObject = { counter: input.counter };
        if (input.name !== undefined) body.name = input.name;
        const data = await api.addIncidentRelatedResourceByRollbarItem(input.incidentId, body);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error linking Rollbar item: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
