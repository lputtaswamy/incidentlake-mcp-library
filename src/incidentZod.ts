import { z } from 'zod';
import { CREATE_INCIDENT_STATUSES, INCIDENT_STATUSES } from './types';

/** PATCH /v1/incidents/:id — matches Public API `validStatuses`. */
export const zIncidentStatusPatch = z.enum(
  INCIDENT_STATUSES as unknown as [string, ...string[]],
);

/** GET /v1/incidents list filter — same values the DB stores (filter uses equality). */
export const zIncidentStatusListFilter = z.enum(
  INCIDENT_STATUSES as unknown as [string, ...string[]],
);

/** POST /v1/incidents — OpenAPI create body enum. */
export const zIncidentStatusCreate = z.enum(
  CREATE_INCIDENT_STATUSES as unknown as [string, ...string[]],
);

/** Task statuses — matches Public API `VALID_TASK_STATUSES`. */
export const TASK_STATUSES = ['draft', 'todo', 'wip', 'in_review', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const zTaskStatus = z.enum(TASK_STATUSES);
