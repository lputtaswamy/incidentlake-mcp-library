import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';

export function registerGetCurrentTenant(server: McpServer) {
  server.registerTool(
    'get_current_tenant',
    {
      description:
        'Return the tenant/identity that the API token belongs to (GET /v1/me) — id, name, default language, timestamps. Use to confirm which tenant the connector is acting on.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const data = await api.getCurrentTenant();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error getting current tenant: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );
}
