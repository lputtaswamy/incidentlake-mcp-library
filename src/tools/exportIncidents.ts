import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { exportIncidentsToFile, type ExportIncidentsParams } from '../client';

export function registerExportIncidents(server: McpServer) {
  server.registerTool(
    'export_incidents',
    {
      description:
        'Bulk export incidents to a spreadsheet file (CSV or Excel) saved locally. ' +
        'Accepts the same filters as list_incidents (status, severity, tag, category, etc.). ' +
        'CSV supports UTF-8 or Shift-JIS encoding; Excel is always Unicode. ' +
        'Returns the saved file path, byte size, and content type.',
      inputSchema: z.object({
        outputPath: z
          .string()
          .min(1)
          .describe(
            'Local file path to save the export to (e.g. "~/Downloads/incidents.csv"). ' +
              'Use a .csv or .xlsx extension matching the chosen format.',
          ),
        format: z
          .enum(['csv', 'xlsx'])
          .optional()
          .describe('File format. Default: csv.'),
        encoding: z
          .enum(['utf8', 'shiftjis'])
          .optional()
          .describe('CSV byte encoding (ignored for xlsx). Default: utf8.'),
        lang: z
          .enum(['en', 'ja'])
          .optional()
          .describe('Column-header language. Default: en.'),
        hasNarrative: z
          .boolean()
          .optional()
          .describe('Include summary/timeline/postmortem columns. Default: false.'),
        q: z.string().optional().describe('Keyword search (name/status/source).'),
        status: z
          .array(z.string())
          .optional()
          .describe('Filter by one or more statuses (e.g. ongoing, resolved).'),
        severity: z
          .array(z.union([z.string(), z.number()]))
          .optional()
          .describe('Filter by one or more severity levels (1-5).'),
        declareSource: z.array(z.string()).optional().describe('Filter by declared source.'),
        category: z
          .array(z.string())
          .optional()
          .describe('Filter by category (system, security, operational).'),
        tag: z
          .array(z.string())
          .optional()
          .describe('Filter by general tags (AND semantics: incident must have all listed tags).'),
        serviceId: z.string().uuid().optional().describe('Filter by affected service id.'),
        sortBy: z
          .string()
          .optional()
          .describe('Sort field (createdAt, updatedAt, name, status, severity, category, occurredAt).'),
        sortDir: z.enum(['asc', 'desc']).optional().describe('Sort direction. Default: desc.'),
      }),
    },
    async (input) => {
      try {
        const { outputPath, ...params } = input;
        const result = await exportIncidentsToFile(params as ExportIncidentsParams, outputPath);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { savedTo: result.path, bytes: result.bytes, contentType: result.contentType },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error exporting incidents: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );
}
