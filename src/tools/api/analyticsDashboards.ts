import { z } from 'zod';
import type { ApiToolDefinition } from './defineApiTool';
import { AI_TIMEOUT_MS } from './defineApiTool';

const dashboardId = z.string().uuid().describe('Analytics dashboard UUID');
const visibility = z.enum(['private', 'tenant']).describe('private = only the owner, tenant = everyone in the project');
const tile = z.record(z.string(), z.unknown()).describe('One dashboard tile');

const dashboardFields = {
  name: z.string().min(1).max(200).describe('Dashboard name'),
  description: z.string().max(2000).nullable().optional(),
  visibility: visibility.optional(),
  tiles: z.array(tile).optional().describe('Tiles on the dashboard. Replaces the whole list when sent'),
  settings: z.record(z.string(), z.unknown()).optional().describe('Dashboard settings'),
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
      name: z.string().min(1).max(200).optional().describe('Name of the copy'),
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
      prompt: z.string().min(1).describe('What the dashboard or tile should show'),
      mode: z.enum(['tile', 'dashboard']).optional().describe('tile = one tile, dashboard = a set of tiles'),
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
