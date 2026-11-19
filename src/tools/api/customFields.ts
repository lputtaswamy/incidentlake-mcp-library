import { z } from 'zod';
import { zIncludeDrills } from '../../incidentZod';
import { INCIDENT_CATEGORIES } from '../../types';
import type { ApiToolDefinition } from './defineApiTool';

const incidentId = z.string().uuid().describe('Incident UUID');
const fieldId = z.string().uuid().describe('Custom field UUID');
const includeDrills = zIncludeDrills;

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url'] as const;

const fieldKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .max(50)
  .describe('Stable key, unique in the tenant: starts with a-z, then a-z, 0-9 or _');

const fieldDefinition = {
  key: fieldKey,
  label: z.string().min(1).max(200).describe('Label shown on the incident'),
  type: z.enum(FIELD_TYPES).describe('Cannot be changed after the field is created'),
  options: z
    .array(z.string().min(1).max(200))
    .max(100)
    .optional()
    .describe('Choices for select and multi_select; must be unique. Omit for other types'),
  helpText: z.string().max(500).optional().describe('Help shown next to the field'),
  requiredToClose: z
    .boolean()
    .optional()
    .describe('When true, resolving the incident fails with REQUIRED_FIELDS_MISSING while this field is empty'),
  categories: z
    .array(z.enum(INCIDENT_CATEGORIES))
    .optional()
    .describe('Incident categories this field applies to. Omit or [] for every category'),
  isActive: z.boolean().optional().describe('Inactive fields stay stored but are not editable (default true)'),
  sortOrder: z.number().int().optional().describe('Display order (lower first)'),
};

/** Values on an incident. Needs incidents read (and write, to set values). */
export const incidentCustomFieldTools: ApiToolDefinition[] = [
  {
    name: 'list_incident_custom_fields',
    description:
      "List the tenant's incident custom fields (needs incidents read). Use the field id with get_incident_custom_field_values and update_incident_custom_field_values. Workflow editors without incidents access use list_incident_custom_field_definitions.",
    method: 'GET',
    path: '/v1/incident-custom-fields',
  },
  {
    name: 'get_incident_custom_field_values',
    description:
      'Custom field values of an incident, with the fields that apply to it. editable is true when the field is active and matches the incident category. Call list_incident_custom_fields first for the field ids.',
    method: 'GET',
    path: '/v1/incidents/{incidentId}/custom-fields',
    input: { incidentId, includeDrills },
  },
  {
    name: 'update_incident_custom_field_values',
    description:
      'Set custom field values on an incident. values is keyed by field id. null, or an empty answer, clears a field. Only active fields that match the incident category can be written.',
    method: 'PATCH',
    path: '/v1/incidents/{incidentId}/custom-fields',
    query: ['includeDrills'],
    input: {
      incidentId,
      includeDrills,
      values: z
        .record(
          z.string().uuid(),
          z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
        )
        .describe(
          'Field id to value. text/textarea/date/url/select are strings (date is YYYY-MM-DD), number is a number, checkbox is a boolean, multi_select is an array of strings. null clears.',
        ),
    },
  },
];

/** Field definitions. Needs workflow read to list, and workflow write to change them. */
export const customFieldDefinitionTools: ApiToolDefinition[] = [
  {
    name: 'list_incident_custom_field_definitions',
    description:
      'List incident custom field definitions (needs workflow read). Same records as list_incident_custom_fields, for someone who can edit the definitions but cannot read incidents.',
    method: 'GET',
    path: '/v1/itil-settings/custom-fields',
  },
  {
    name: 'create_incident_custom_field',
    description:
      'Define an incident custom field. At most 100 fields per tenant. key must be unique. select and multi_select need options. requiredToClose makes resolving an incident fail while the field is empty.',
    method: 'POST',
    path: '/v1/itil-settings/custom-fields',
    input: fieldDefinition,
  },
  {
    name: 'update_incident_custom_field',
    description:
      'Replace a custom field definition. Send the whole definition, as for create. The type cannot change, because values already stored would no longer match.',
    method: 'PUT',
    path: '/v1/itil-settings/custom-fields/{fieldId}',
    input: { fieldId, ...fieldDefinition },
  },
  {
    name: 'delete_incident_custom_field',
    description: 'Delete a custom field and every value stored for it.',
    method: 'DELETE',
    path: '/v1/itil-settings/custom-fields/{fieldId}',
    input: { fieldId },
  },
];
