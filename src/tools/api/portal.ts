import { z } from 'zod';
import type { ApiToolDefinition } from './defineApiTool';

const requestId = z.string().uuid().describe('Portal request UUID');
const knowledgeId = z.string().uuid().describe('Knowledge item UUID');
const cursor = z.string().optional().describe('nextCursor of the previous page. null there means the last page');
const commentBody = z.string().min(1).max(10000);

const DESK_STATUSES = ['new', 'in_progress', 'awaiting_requester', 'resolved', 'closed', 'cancelled'] as const;
const URGENCY = ['high', 'medium', 'low'] as const;

/**
 * The self-service portal. Desk tools work the queue. Requester tools act as the caller:
 * an API token files and follows its own requests. The tenant's portal toggle must be on.
 */
export const portalTools: ApiToolDefinition[] = [
  {
    name: 'list_portal_requests',
    description:
      'The service desk queue of portal requests. status=open (default) is the working queue, all is everything, or pass one status. assignee=me or unassigned. q searches the text.',
    method: 'GET',
    path: '/v1/portal-requests',
    input: {
      status: z.enum(['open', 'all', ...DESK_STATUSES]).optional(),
      assignee: z.enum(['me', 'unassigned']).optional(),
      q: z.string().optional().describe('Text search'),
      cursor,
    },
  },
  {
    name: 'get_portal_request',
    description: 'A portal request with every comment, internal notes included.',
    method: 'GET',
    path: '/v1/portal-requests/{requestId}',
    input: { requestId },
  },
  {
    name: 'update_portal_request',
    description:
      'Work a portal request. Each field is optional. status must follow the desk workflow. null clears assigneeId, serviceId, incidentId and resolution; status and urgency reject null.',
    method: 'PATCH',
    path: '/v1/portal-requests/{requestId}',
    input: {
      requestId,
      status: z.enum(DESK_STATUSES).optional(),
      assigneeId: z.string().uuid().nullable().optional().describe('Member working the request. null clears it'),
      urgency: z.enum(URGENCY).optional(),
      serviceId: z.string().uuid().nullable().optional().describe('CMDB service UUID. null clears it'),
      incidentId: z.string().uuid().nullable().optional().describe('Linked incident the caller can read. null clears it'),
      resolution: z.string().max(10000).nullable().optional().describe('Resolution shown to the requester. null clears it'),
    },
  },
  {
    name: 'add_portal_request_comment',
    description: 'Reply to the requester, or add an internal note the requester cannot see.',
    method: 'POST',
    path: '/v1/portal-requests/{requestId}/comments',
    input: {
      requestId,
      body: commentBody.describe('Comment text'),
      internal: z.boolean().optional().describe('true = internal note, hidden from the requester'),
    },
  },
  {
    name: 'escalate_portal_request',
    description:
      'Raise the portal request as an incident and link it. Idempotent: returns the existing incident when one is already linked.',
    method: 'POST',
    destructive: true,
    path: '/v1/portal-requests/{requestId}/escalate',
    input: { requestId },
  },
  {
    name: 'get_portal_home',
    description:
      "Portal home for the caller as a requester: the request catalog, published articles and the caller's recent requests. Orders go through the service request tools.",
    method: 'GET',
    path: '/v1/portal/home',
  },
  {
    name: 'search_portal_knowledge',
    description: 'Search knowledge published to the self-service portal.',
    method: 'GET',
    path: '/v1/portal/knowledge',
    input: { q: z.string().optional().describe('Text the article contains') },
  },
  {
    name: 'get_portal_knowledge_article',
    description: 'Read an article published to the self-service portal.',
    method: 'GET',
    path: '/v1/portal/knowledge/{knowledgeId}',
    input: { knowledgeId },
  },
  {
    name: 'list_my_portal_requests',
    description: "The caller's own portal requests, newest first.",
    method: 'GET',
    path: '/v1/portal/requests',
    input: { cursor },
  },
  {
    name: 'create_portal_request',
    description:
      'Report a problem or ask a question as the caller. kind is incident or question. Orders go through create_service_request instead.',
    method: 'POST',
    path: '/v1/portal/requests',
    input: {
      kind: z.enum(['incident', 'question']).describe('incident = something is broken, question = a question'),
      title: z.string().min(1).max(255).describe('Request title'),
      description: z.string().max(10000).optional(),
      serviceId: z.string().uuid().optional().describe('CMDB service UUID'),
      urgency: z.enum(URGENCY).optional().describe('Default medium'),
    },
  },
  {
    name: 'get_my_portal_request',
    description: "One of the caller's own portal requests, with its public comments.",
    method: 'GET',
    path: '/v1/portal/requests/{requestId}',
    input: { requestId },
  },
  {
    name: 'add_my_portal_request_comment',
    description: "Reply on the caller's own portal request.",
    method: 'POST',
    path: '/v1/portal/requests/{requestId}/comments',
    input: {
      requestId,
      body: commentBody.describe('Reply text'),
    },
  },
  {
    name: 'cancel_my_portal_request',
    description: "Withdraw the caller's own open portal request.",
    method: 'POST',
    destructive: true,
    path: '/v1/portal/requests/{requestId}/cancel',
    input: { requestId },
  },
  {
    name: 'close_my_portal_request',
    description: "Accept the resolution of the caller's own portal request.",
    method: 'POST',
    destructive: true,
    path: '/v1/portal/requests/{requestId}/close',
    input: {
      requestId,
      satisfaction: z.number().int().min(1).max(5).optional().describe('Satisfaction, 1 to 5'),
    },
  },
  {
    name: 'reopen_my_portal_request',
    description: "Reopen the caller's own resolved portal request.",
    method: 'POST',
    destructive: true,
    path: '/v1/portal/requests/{requestId}/reopen',
    input: {
      requestId,
      body: commentBody.describe('Why it is being reopened'),
    },
  },
];
