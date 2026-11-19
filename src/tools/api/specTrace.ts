import { z } from 'zod';
import type { ApiToolDefinition } from './defineApiTool';
import { AI_TIMEOUT_MS } from './defineApiTool';

const pageId = z.string().uuid().describe('Specification page UUID');
const spaceId = z.string().uuid().describe('Specification space UUID');
const targetId = z.string().uuid().describe('UUID of the incident, problem or change');
const linkId = z.string().uuid().describe('Trace link UUID');

/** A problem takes the first five, a change takes implements or related. */
const RELATIONS = ['as_specified', 'bug', 'spec_gap', 'spec_defect', 'related', 'implements'] as const;

/** Traceability and the tenant-wide change-request list. Page and space tools live with the other specification tools. */
export const specTraceTools: ApiToolDefinition[] = [
  {
    name: 'list_all_spec_change_requests',
    description:
      'List change requests of every specification, most recently updated first. For one space, use list_spec_change_requests.',
    method: 'GET',
    path: '/v1/spec-change-requests',
    input: {
      status: z.enum(['open', 'merged', 'rejected', 'closed']).optional().describe('Only this status'),
    },
  },
  {
    name: 'get_spec_page_impact',
    description:
      'What a change to a specification page reaches, read from the CMDB with no model: the services the page specifies and their dependents, business operations, other pages about those services, and the open incidents, problems and planned changes on them.',
    method: 'GET',
    path: '/v1/spec-pages/{pageId}/impact',
    input: { pageId },
  },
  {
    name: 'list_spec_page_trace',
    description:
      'Incidents, problems and changes linked to a specification page. suspect is true when the page official revision moved on while the record is still open.',
    method: 'GET',
    path: '/v1/spec-pages/{pageId}/trace',
    input: { pageId },
  },
  {
    name: 'get_spec_space_trace',
    description:
      'Traceability of a specification space: per page, its linked incidents, problems and changes, acceptance criteria and gaps. gaps are no_official, no_service or no_criteria. suspectCount counts links made against an older official revision while the linked record is still open.',
    method: 'GET',
    path: '/v1/spec-spaces/{spaceId}/trace',
    input: { spaceId },
  },
  {
    name: 'link_spec_page_trace',
    description:
      'Link a specification page to a problem or a change, pinned to the official revision (the latest when there is none). Incidents are linked with link_incident_spec. relation for a problem: as_specified, bug, spec_gap, spec_defect, related. For a change: implements, related.',
    method: 'PUT',
    path: '/v1/spec-pages/{pageId}/trace-links',
    input: {
      pageId,
      type: z.enum(['problem', 'change']),
      targetId,
      relation: z.enum(RELATIONS),
      note: z.string().max(5000).nullable().optional(),
    },
  },
  {
    name: 'confirm_spec_page_trace_link',
    description: 'Confirm that a trace link still holds against the current official revision of the page.',
    method: 'POST',
    destructive: true,
    path: '/v1/spec-pages/{pageId}/trace-links/confirm',
    input: {
      pageId,
      type: z.enum(['incident', 'problem', 'change']),
      targetId,
    },
  },
  {
    name: 'delete_spec_page_trace_link',
    description: 'Unlink a specification page from a problem or a change.',
    method: 'DELETE',
    path: '/v1/spec-pages/{pageId}/trace-links/{linkId}',
    input: { pageId, linkId },
  },
  {
    name: 'draft_spec_acceptance_criteria',
    description:
      'Propose acceptance criteria in EARS for a specification page. Saves nothing. Returns the criteria and the page text with its acceptance criteria section rewritten; save that text with update_spec_page. (AI; consumes credits)',
    method: 'POST',
    path: '/v1/spec-pages/{pageId}/acceptance-criteria/draft',
    timeoutMs: AI_TIMEOUT_MS,
    input: { pageId },
  },
];
