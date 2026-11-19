import { z } from 'zod';
import type { ApiToolDefinition } from './defineApiTool';

const itemId = z.string().uuid().describe('Service request catalog item UUID');
const requestId = z.string().uuid().describe('Service request UUID');
const taskId = z.string().uuid().describe('Fulfilment task UUID');

const FORM_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'] as const;
const SCOPES = ['mine', 'approvals', 'assigned', 'all'] as const;
const STATUSES = ['open', 'pending_approval', 'in_progress', 'fulfilled', 'rejected', 'cancelled'] as const;

const formField = z.object({
  key: z.string().min(1).max(50).describe('Answer key, unique on the item'),
  label: z.string().min(1).max(200),
  type: z.enum(FORM_TYPES),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(200)).optional().describe('Choices for select'),
  helpText: z.string().max(500).optional(),
});

const fulfillmentTask = z.object({
  title: z.string().min(1).max(500).describe('Task title'),
  description: z.string().max(5000).optional(),
});

const catalogItem = {
  name: z.string().min(1).max(200).describe('Item name shown in the catalog'),
  description: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  serviceId: z.string().uuid().nullable().optional().describe('CMDB service UUID. null clears it'),
  formFields: z.array(formField).optional().describe('Questions the requester answers'),
  approvalMode: z.enum(['none', 'any', 'all']).optional().describe('none, any one approver, or all approvers'),
  approverIds: z.array(z.string().uuid()).optional().describe('Member UUIDs who approve'),
  fulfillmentTasks: z.array(fulfillmentTask).optional().describe('Tasks created when the request is approved'),
  defaultAssigneeId: z.string().uuid().nullable().optional().describe('Member who fulfils the request by default. null clears it'),
  targetDays: z.number().int().min(1).max(365).nullable().optional().describe('Target days to fulfil'),
  isActive: z.boolean().optional().describe('Inactive items are hidden from requesters'),
  sortOrder: z.number().int().optional(),
};

/** Catalog orders. Distinct from portal requests, which are problems and questions. */
export const serviceRequestTools: ApiToolDefinition[] = [
  {
    name: 'list_service_request_items',
    description: 'List service request catalog items. Inactive items are included only for catalog managers.',
    method: 'GET',
    path: '/v1/service-request-items',
  },
  {
    name: 'create_service_request_item',
    description: 'Create a service request catalog item. Needs service requests manage. name is required.',
    method: 'POST',
    path: '/v1/service-request-items',
    input: catalogItem,
  },
  {
    name: 'update_service_request_item',
    description: 'Replace a catalog item. Send the whole item, as for create. Needs service requests manage.',
    method: 'PUT',
    path: '/v1/service-request-items/{itemId}',
    input: { itemId, ...catalogItem },
  },
  {
    name: 'delete_service_request_item',
    description: 'Delete a catalog item. Existing requests keep their copy of it. Needs service requests manage.',
    method: 'DELETE',
    path: '/v1/service-request-items/{itemId}',
    input: { itemId },
  },
  {
    name: 'get_service_request_counts',
    description: 'Open service request counts per scope: mine, approvals, assigned and all.',
    method: 'GET',
    path: '/v1/service-requests/counts',
  },
  {
    name: 'list_service_requests',
    description:
      'List service requests. scope: mine (default, filed by the caller), approvals (waiting on the caller), assigned (the caller fulfils), all (fulfillers). status: open or one of pending_approval, in_progress, fulfilled, rejected, cancelled.',
    method: 'GET',
    path: '/v1/service-requests',
    input: {
      scope: z.enum(SCOPES).optional(),
      status: z.enum(['open', ...STATUSES]).optional(),
      itemId: itemId.optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
  },
  {
    name: 'get_service_request',
    description: 'Get a service request with its approvals, tasks, comments and history.',
    method: 'GET',
    path: '/v1/service-requests/{requestId}',
    input: { requestId },
  },
  {
    name: 'create_service_request',
    description:
      'Submit a request from a catalog item. itemId is required. values holds answers keyed by the item form field keys. Approvers are asked first when the item needs approval; otherwise fulfilment tasks start at once.',
    method: 'POST',
    path: '/v1/service-requests',
    input: {
      itemId,
      title: z.string().max(500).optional(),
      description: z.string().max(20000).optional(),
      requestedFor: z.string().max(200).optional().describe('Who the request is for, when it is not the caller'),
      values: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional()
        .describe('Answers keyed by the catalog item form field keys'),
    },
  },
  {
    name: 'update_service_request',
    description: 'Assign a service request or set its due date. null clears a field.',
    method: 'PATCH',
    path: '/v1/service-requests/{requestId}',
    input: {
      requestId,
      assigneeId: z.string().uuid().nullable().optional().describe('Member fulfilling the request. null clears it'),
      dueAt: z.string().datetime().nullable().optional().describe('Due time, ISO 8601. null clears it'),
    },
  },
  {
    name: 'approve_service_request',
    description: 'Approve a service request as one of its approvers.',
    method: 'POST',
    destructive: true,
    path: '/v1/service-requests/{requestId}/approve',
    input: {
      requestId,
      comment: z.string().max(5000).optional(),
    },
  },
  {
    name: 'reject_service_request',
    description: 'Reject a service request as one of its approvers. comment is required.',
    method: 'POST',
    destructive: true,
    path: '/v1/service-requests/{requestId}/reject',
    input: {
      requestId,
      comment: z.string().min(1).max(5000).describe('Why it is rejected'),
    },
  },
  {
    name: 'cancel_service_request',
    description: 'Cancel an open service request. The requester or a fulfiller can cancel it.',
    method: 'POST',
    destructive: true,
    path: '/v1/service-requests/{requestId}/cancel',
    input: {
      requestId,
      comment: z.string().max(5000).optional(),
    },
  },
  {
    name: 'fulfill_service_request',
    description: 'Mark a service request fulfilled once every fulfilment task is done. The assignee or the service desk.',
    method: 'POST',
    destructive: true,
    path: '/v1/service-requests/{requestId}/fulfill',
    input: {
      requestId,
      comment: z.string().max(5000).optional(),
    },
  },
  {
    name: 'add_service_request_comment',
    description: 'Comment on a service request.',
    method: 'POST',
    path: '/v1/service-requests/{requestId}/comments',
    input: {
      requestId,
      comment: z.string().min(1).max(5000),
    },
  },
  {
    name: 'update_service_request_task',
    description: 'Update a fulfilment task on a service request.',
    method: 'PATCH',
    path: '/v1/service-requests/{requestId}/tasks/{taskId}',
    input: {
      requestId,
      taskId,
      status: z.enum(['open', 'done']).optional(),
      assigneeId: z.string().uuid().nullable().optional().describe('Member doing the task. null clears it'),
    },
  },
];
