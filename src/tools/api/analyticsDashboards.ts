import { z } from 'zod';
import type { ApiToolDefinition } from './defineApiTool';
import { AI_TIMEOUT_MS } from './defineApiTool';

const dashboardId = z.string().uuid().describe('Analytics dashboard UUID');
const visibility = z.enum(['private', 'tenant']).describe('private = only the owner, tenant = everyone in the project');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const tile = z
  .object({
    id: z.string().min(1).max(64).describe('Tile id, unique on the dashboard'),
    title: z.string().max(120),
    description: z.string().max(500).optional(),
    source: z
      .union([
        z.object({
          kind: z.literal('dsl'),
          dsl: z.string().max(2000).describe('Incident analytics query. See get_incident_query_schema'),
        }),
        z.object({
          kind: z.literal('builtin'),
          widget: z.enum([
            'recurring_patterns',
            'assignee_workload',
            'post_mortem_health',
            'longest_resolution',
            'status_breakdown',
            'itil_kpis',
          ]),
        }),
      ])
      .describe('What the tile shows: a query, or a built-in widget that a query cannot express'),
    viz: z.object({
      type: z.enum(['kpi', 'bar', 'column', 'line', 'area', 'pie', 'donut', 'table']),
      stacked: z.boolean().optional().describe('Stack series when the query has two dimensions (bar, column, area)'),
      compareWithPreviousPeriod: z.boolean().optional().describe('kpi only: show the change from the preceding period'),
      lowerIsBetter: z.boolean().optional().describe('kpi only: a lower value is the good direction'),
      hideLegend: z.boolean().optional(),
      fillTimeGaps: z.boolean().optional().describe('Fill missing time buckets with zero'),
    }),
    layout: z
      .object({
        x: z.number().int().min(0).max(11),
        y: z.number().int().min(0).max(400),
        w: z.number().int().min(1).max(12),
        h: z.number().int().min(1).max(40),
      })
      .describe('Position on a 12-column grid; x + w must not exceed 12'),
  })
  .describe('One dashboard tile');

const settings = z
  .object({
    period: z.enum(['1d', '1w', '1m', '3m', '6m', '1y', 'custom']).optional(),
    customStartDate: day.optional().describe('YYYY-MM-DD, for period custom'),
    customEndDate: day.optional().describe('YYYY-MM-DD, for period custom'),
    category: z.array(z.string()).max(10).optional(),
    tags: z.array(z.string()).max(50).optional(),
    rbacTagId: z.array(z.string().uuid()).max(50).optional(),
  })
  .describe('Defaults applied when the dashboard is opened');

const dashboardFields = {
  name: z.string().min(1).max(120).describe('Dashboard name'),
  description: z.string().max(500).nullable().optional(),
  visibility: visibility.optional().describe('private = only the owner (default), tenant = everyone in the project'),
  tiles: z.array(tile).max(40).optional().describe('Tiles on the dashboard. Replaces the whole list when sent'),
  settings: settings.optional(),
};

/** Analytics dashboards and the incident query language. Both need incidents access. */
export const analyticsDashboardTools: ApiToolDefinition[] = [
  {
    name: 'list_analytics_dashboards',
    description: 'List analytics dashboards visible to the caller.',
    method: 'GET',
    path: '/v1/analytics-dashboards',
  },
  {
    name: 'get_analytics_dashboard',
    description: 'Get an analytics dashboard, including its tiles.',
    method: 'GET',
    path: '/v1/analytics-dashboards/{dashboardId}',
    input: { dashboardId },
  },
  {
    name: 'create_analytics_dashboard',
    description: 'Create an analytics dashboard. name is required. A viewer cannot create one.',
    method: 'POST',
    path: '/v1/analytics-dashboards',
    input: dashboardFields,
  },
  {
    name: 'update_analytics_dashboard',
    description: 'Update an analytics dashboard. Send the fields that change. tiles replaces the whole list.',
    method: 'PUT',
    path: '/v1/analytics-dashboards/{dashboardId}',
    input: { dashboardId, ...dashboardFields, name: dashboardFields.name.optional() },
  },
  {
    name: 'delete_analytics_dashboard',
    description: 'Soft-delete an analytics dashboard.',
    method: 'DELETE',
    path: '/v1/analytics-dashboards/{dashboardId}',
    input: { dashboardId },
  },
  {
    name: 'duplicate_analytics_dashboard',
    description: 'Duplicate an analytics dashboard. Creates a new private copy owned by the caller.',
    method: 'POST',
    path: '/v1/analytics-dashboards/{dashboardId}/duplicate',
    input: {
      dashboardId,
      name: z.string().min(1).max(120).optional().describe('Name of the copy'),
    },
  },
  {
    name: 'generate_analytics_tiles',
    description:
      'Generate analytics tiles from a natural-language prompt. Does not save a dashboard. Attach the returned tiles with create_analytics_dashboard or update_analytics_dashboard. Consumes AI credits when a model runs.',
    method: 'POST',
    path: '/v1/analytics-dashboards/generate',
    timeoutMs: AI_TIMEOUT_MS,
    input: {
      prompt: z.string().min(1).max(2000).describe('What the dashboard or tile should show'),
      mode: z.enum(['tile', 'dashboard']).optional().describe('tile = one tile (default), dashboard = a set of tiles'),
      language: z.string().optional().describe('Language of the generated titles'),
      existingTileTitles: z.array(z.string()).optional().describe('Titles already on the dashboard, so new tiles do not repeat them'),
    },
  },
  {
    name: 'get_incident_query_schema',
    description: 'Field catalogue for the incident analytics query language, plus a text reference for building a valid query.',
    method: 'GET',
    path: '/v1/incidents/query/schema',
  },
  {
    name: 'run_incident_query',
    description:
      'Run an incident analytics query. Read-only. Results only include incidents the caller may access. Call get_incident_query_schema for the language.',
    method: 'POST',
    path: '/v1/incidents/query',
    input: {
      dsl: z.string().min(1).describe('Analytics query'),
      includeDrills: z.boolean().optional().describe('Include drill (exercise) incidents'),
    },
  },
];
