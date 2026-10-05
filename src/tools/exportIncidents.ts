import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  exportIncidentsToBytes,
  exportIncidentsToFile,
  type ExportIncidentsParams,
} from '../client';

export function registerExportIncidents(server: McpServer) {
  server.registerTool(
    'export_incidents',
    {
      description:
        'Bulk export incidents to a spreadsheet (CSV or Excel). ' +
        'Two modes: ' +
        '(1) If outputPath is provided, the file is saved locally — intended for the stdio MCP ' +
        'server running on the user\'s machine. Files are saved as incidents-YYYY-MM-DD.<ext>; ' +
        'existing files become "incidents-YYYY-MM-DD (1).<ext>". ' +
        '(2) If outputPath is omitted, the file bytes are returned inline as an MCP embedded ' +
        'resource (base64) — intended for the remote hosted MCP server where the user\'s disk ' +
        'is not reachable; the client (e.g. Claude.ai web UI) renders a download link. ' +
        'Supports the same filters as list_incidents. ' +
        'CSV supports UTF-8 or Shift-JIS encoding; Excel is always Unicode.',
      inputSchema: z.object({
        outputPath: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Optional. When set, writes the export to this directory (or uses the path\'s ' +
              'directory and extension), returning the saved file path. When omitted, the ' +
              'export is returned inline as a base64 embedded resource for the client to ' +
              'download — required for remote hosted MCP where the server cannot access the ' +
              'user\'s disk.',
          ),
        format: z
          .enum(['csv', 'xlsx'])
          .optional()
          .describe(
            'File format. When omitted, defaults to csv (or is inferred from outputPath when ' +
              'that is set: .xlsx → xlsx, else csv). If both are set, must match any ' +
              '.csv/.xlsx extension on outputPath.',
          ),
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

        if (outputPath) {
          const result = await exportIncidentsToFile(params as ExportIncidentsParams, outputPath);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    savedTo: result.path,
                    bytes: result.bytes,
                    contentType: result.contentType,
                    format: result.format,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const result = await exportIncidentsToBytes(params as ExportIncidentsParams);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  filename: result.filename,
                  bytes: result.buffer.length,
                  contentType: result.contentType,
                  format: result.format,
                  mode: 'inline',
                },
                null,
                2,
              ),
            },
            {
              type: 'resource' as const,
              resource: {
                uri: `incidentlake://exports/${result.filename}`,
                mimeType: result.contentType,
                blob: result.buffer.toString('base64'),
              },
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
