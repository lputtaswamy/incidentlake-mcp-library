import { z } from 'zod';
import { zIncludeDrills } from '../../incidentZod';
import type { ApiToolDefinition } from './defineApiTool';

const assetId = z.string().uuid().describe('IT asset UUID');
const incidentId = z.string().uuid().describe('Incident UUID');
const includeDrills = zIncludeDrills;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date, YYYY-MM-DD');

const ASSET_TYPES = ['laptop', 'desktop', 'mobile', 'tablet', 'server', 'network', 'peripheral', 'software', 'other'] as const;
const ASSET_STATUSES = ['ordered', 'in_stock', 'in_use', 'in_repair', 'retired', 'lost', 'disposed'] as const;

const assetFields = {
  name: z.string().min(1).max(255).describe('Asset name'),
  assetType: z.enum(ASSET_TYPES).optional().describe('Default other'),
  status: z.enum(ASSET_STATUSES).optional().describe('Default in_use'),
  assetTag: z.string().max(100).nullable().optional().describe('Unique asset tag. null clears it'),
  serialNumber: z.string().max(200).nullable().optional(),
  manufacturer: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  osName: z.string().max(100).nullable().optional(),
  osVersion: z.string().max(100).nullable().optional(),
  assignedMemberId: z.string().uuid().nullable().optional().describe('Tenant member UUID the asset is assigned to. null clears it'),
  assignedUserName: z.string().max(200).nullable().optional(),
  assignedUserEmail: z.string().email().nullable().optional(),
  department: z.string().max(200).nullable().optional(),
  locationId: z.string().uuid().nullable().optional().describe('Location UUID. null clears it'),
  vendor: z.string().max(200).nullable().optional(),
  purchaseDate: day.nullable().optional(),
  purchaseCost: z.number().nullable().optional(),
  warrantyExpiresOn: day.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
};

const listFilters = {
  search: z.string().optional().describe('Text matched against name, tag, serial number and assigned user'),
  status: z.enum(ASSET_STATUSES).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  source: z.string().optional().describe('Where the asset came from, such as manual or jamf'),
  assignedMemberId: z.string().uuid().optional(),
  warrantyWithinDays: z.number().int().min(0).optional().describe('Only assets whose warranty expires within this many days'),
  staleDays: z.number().int().min(0).optional().describe('Only assets not seen for this many days'),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
};

/** IT assets live with CMDB services. Linking an asset to an incident also needs incidents access. */
export const itAssetTools: ApiToolDefinition[] = [
  {
    name: 'list_it_assets',
    description: 'List IT assets. Filter with search, status, assetType, source, assignedMemberId, warrantyWithinDays, staleDays, limit and offset.',
    method: 'GET',
    path: '/v1/it-assets',
    input: listFilters,
  },
  {
    name: 'get_it_asset_summary',
    description: 'Asset counts by status, type and source, plus warranty and staleness alerts.',
    method: 'GET',
    path: '/v1/it-assets/summary',
  },
  {
    name: 'get_it_asset',
    description:
      'Get an asset with its history and the incidents it is linked to. Linked incidents the caller cannot read are left out and counted in hiddenIncidentCount.',
    method: 'GET',
    path: '/v1/it-assets/{assetId}',
    input: { assetId },
  },
  {
    name: 'create_it_asset',
    description: 'Register an IT asset. name is required. assetTag must be unique.',
    method: 'POST',
    path: '/v1/it-assets',
    input: assetFields,
  },
  {
    name: 'update_it_asset',
    description:
      'Update an asset. Send only the fields that change. Device facts synced from Jamf Pro (name, serial number, manufacturer, model, OS, assigned user) cannot be edited on synced assets (code MDM_OWNED).',
    method: 'PATCH',
    path: '/v1/it-assets/{assetId}',
    input: {
      assetId,
      ...assetFields,
      name: assetFields.name.optional(),
    },
  },
  {
    name: 'delete_it_asset',
    description: 'Delete an IT asset.',
    method: 'DELETE',
    path: '/v1/it-assets/{assetId}',
    input: { assetId },
  },
  {
    name: 'export_it_assets',
    description: 'Download IT assets as CSV. Uses the same filters as list_it_assets, plus lang and encoding.',
    method: 'GET',
    path: '/v1/it-assets/csv',
    download: { fallbackName: 'it-assets.csv' },
    input: {
      ...listFilters,
      lang: z.enum(['ja', 'en']).optional().describe('Column header language (default en)'),
      encoding: z.enum(['utf8', 'shiftjis']).optional().describe('CSV byte encoding (default utf8)'),
    },
  },
  {
    name: 'download_it_asset_csv_template',
    description: 'Download an empty IT asset CSV import template.',
    method: 'GET',
    path: '/v1/it-assets/csv/template',
    download: { fallbackName: 'it-assets-template.csv' },
    input: {
      lang: z.enum(['ja', 'en']).optional(),
      encoding: z.enum(['utf8', 'shiftjis']).optional(),
    },
  },
  {
    name: 'upsert_it_assets_from_csv',
    description:
      'Import IT assets from a local CSV file. Rows whose id or asset tag matches an asset update it; the rest are created. All or nothing: any invalid row rejects the file. Returns created, updated, unchanged and mdmIgnored counts.',
    method: 'POST',
    destructive: true,
    path: '/v1/it-assets/csv',
    upload: { field: 'file' },
    input: {
      encoding: z.enum(['utf8', 'shiftjis']).optional().describe('How the file is encoded; detected when omitted'),
    },
  },
  {
    name: 'list_incident_it_assets',
    description: 'IT assets linked to an incident.',
    method: 'GET',
    path: '/v1/incidents/{incidentId}/it-assets',
    input: { incidentId, includeDrills },
  },
  {
    name: 'search_incident_it_asset_candidates',
    description: 'Search assets that are not yet linked to the incident.',
    method: 'GET',
    path: '/v1/incidents/{incidentId}/it-assets/candidates',
    input: {
      incidentId,
      includeDrills,
      search: z.string().optional().describe('Text matched against the asset'),
    },
  },
  {
    name: 'link_incident_it_asset',
    description: 'Link an IT asset to an incident. Returns the assets linked afterwards.',
    method: 'POST',
    destructive: true,
    path: '/v1/incidents/{incidentId}/it-assets',
    query: ['includeDrills'],
    input: { incidentId, includeDrills, assetId },
  },
  {
    name: 'unlink_incident_it_asset',
    description: 'Unlink an IT asset from an incident. Returns the assets still linked.',
    method: 'DELETE',
    path: '/v1/incidents/{incidentId}/it-assets/{assetId}',
    query: ['includeDrills'],
    input: { incidentId, assetId, includeDrills },
  },
  {
    name: 'get_jamf_settings',
    description: 'Jamf Pro connection settings. The client secret is never returned. Admins only.',
    method: 'GET',
    path: '/v1/integrations/jamf/settings',
  },
  {
    name: 'update_jamf_settings',
    description:
      'Save Jamf Pro settings. Admins only. An omitted or empty clientSecret keeps the stored one; null clears a value. Enabling sync needs the URL, client id and secret (code JAMF_NOT_CONFIGURED).',
    method: 'PUT',
    path: '/v1/integrations/jamf/settings',
    input: {
      url: z.string().url().nullable().optional().describe('Jamf Pro URL. null clears it'),
      clientId: z.string().nullable().optional().describe('API client id. null clears it'),
      clientSecret: z.string().nullable().optional().describe('API client secret. Omit or "" to keep the stored secret; null clears it'),
      syncEnabled: z.boolean().optional(),
    },
  },
  {
    name: 'delete_jamf_settings',
    description: 'Remove the Jamf Pro integration. Admins only.',
    method: 'DELETE',
    path: '/v1/integrations/jamf/settings',
  },
  {
    name: 'verify_jamf_connection',
    description: 'Test the saved Jamf Pro connection. Admins only.',
    method: 'POST',
    path: '/v1/integrations/jamf/verify',
  },
  {
    name: 'get_jamf_sync_status',
    description: 'Jamf Pro sync status: settings, the last runs and synced asset counts. Admins only.',
    method: 'GET',
    path: '/v1/integrations/jamf/sync',
  },
  {
    name: 'sync_jamf_assets',
    description: 'Start a Jamf Pro sync now. Admins only. Returns when the sync has been queued.',
    method: 'POST',
    destructive: true,
    path: '/v1/integrations/jamf/sync',
  },
];
