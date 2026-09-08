import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../client';
import type { JsonObject } from '../types';

const inputSchema = z.object({
  incidentId: z.string().uuid().describe('The UUID of the incident'),
  reportType: z
    .enum(['summary', 'timeline', 'postmortem'])
    .describe('Which report to publish/complete: summary, timeline, or postmortem'),
  draftId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Publish this specific report draft (must be of reportType). If omitted (and no content given), the LATEST draft of reportType is published.',
    ),
  content: z
    .string()
    .optional()
    .describe(
      'Publish this exact content instead of a stored draft. Overrides draftId / latest-draft lookup.',
    ),
});

export function registerPublishReport(server: McpServer) {
  server.registerTool(
    'publish_report',
    {
      description:
        'Publish (complete) an incident report — summary, timeline, or postmortem. ' +
        'By default publishes the LATEST draft of the given reportType (from create_report_draft); ' +
        'pass draftId to publish a specific draft, or content to publish exact text. ' +
        'Publishing routes through PATCH /v1/incidents (same as update_incident); publishing a ' +
        'postmortem also generates a knowledge-base draft for admin review. ' +
        'Use this instead of manually listing drafts and calling update_incident.',
      inputSchema,
    },
    async (input) => {
      try {
        let publishContent: string | undefined;
        let source: string;

        if (input.content !== undefined && input.content.trim() !== '') {
          publishContent = input.content;
          source = 'provided content';
        } else {
          // Resolve from stored drafts of this reportType (API returns them newest-first).
          const drafts = await api.listReportDrafts(input.incidentId, input.reportType);
          if (input.draftId) {
            const match = drafts.find((d) => d.id === input.draftId);
            if (!match) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `No ${input.reportType} draft with id ${input.draftId} found for this incident.`,
                  },
                ],
                isError: true,
              };
            }
            publishContent = match.content;
            source = `draft ${match.id}`;
          } else {
            if (drafts.length === 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `No ${input.reportType} draft to publish for this incident. Create one with create_report_draft, or pass content directly.`,
                  },
                ],
                isError: true,
              };
            }
            // Newest-first, so the first entry is the latest draft of this type.
            const latest = drafts[0];
            publishContent = latest.content;
            source = `latest ${input.reportType} draft (${latest.id})`;
          }
        }

        if (!publishContent || publishContent.trim() === '') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `The ${input.reportType} content to publish is empty.`,
              },
            ],
            isError: true,
          };
        }

        const body: JsonObject = { [input.reportType]: publishContent };
        const data = await api.updateIncident(input.incidentId, body);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Published ${input.reportType} report from ${source}.\n${JSON.stringify(data, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error publishing report: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );
}
