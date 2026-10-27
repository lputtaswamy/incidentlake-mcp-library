import { z } from 'zod';
import type { JsonObject, JsonValue } from './types';
import {
  DRILL_CONDITION_KINDS,
  DRILL_CONTENT_LANGUAGES,
  DRILL_DECISION_SOURCES,
  DRILL_EXERCISE_TYPES,
  DRILL_FACILITATOR_MODES,
  DRILL_HAZARDS,
  DRILL_INDUSTRIES,
  DRILL_INJECT_METHODS,
  DRILL_PARTICIPANT_KINDS,
  DRILL_SCENARIO_STATUSES,
} from './types';

// offset: true accepts both Z and numeric offsets such as +09:00. The public API uses Date.parse.
const isoDateTime = z.string().datetime({ offset: true }).describe('ISO 8601 date-time');

export const zDrillLanguage = z
  .enum(DRILL_CONTENT_LANGUAGES)
  .optional()
  .describe('Language for scenario text. Default ja.');

export const zDrillFacilitatorMode = z
  .enum(DRILL_FACILITATOR_MODES)
  .describe('How the facilitator applies the next move after a participant decision');

export const zDrillParticipant = z.object({
  tenantMemberId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe('Tenant member UUID. Null leaves the role unassigned.'),
  role: z.string().min(1).max(100).describe('Role name in the drill (max 100 characters)'),
  kind: z
    .enum(DRILL_PARTICIPANT_KINDS)
    .optional()
    .describe('player (default), controller, or observer'),
});

/** Create body. startAt is required; briefing ≤ start ≤ debrief ≤ follow-up. */
export const zDrillSchedule = z.object({
  briefingAt: isoDateTime.nullable().optional(),
  startAt: isoDateTime.describe('When the drill clock starts'),
  debriefAt: isoDateTime.nullable().optional(),
  followUpDueAt: isoDateTime.nullable().optional(),
});

/** Patch body. Only the keys you send are changed, and only while the session is scheduled. */
export const zDrillSchedulePatch = z.object({
  briefingAt: isoDateTime.nullable().optional(),
  startAt: isoDateTime.optional().describe('Cannot be cleared'),
  debriefAt: isoDateTime.nullable().optional(),
  followUpDueAt: isoDateTime.nullable().optional(),
});

const DRILL_MAX_DURATION_MINUTES = 24 * 60;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

/**
 * Scenario body for POST/PATCH /v1/drills/scenarios. Same fields the public API accepts.
 * conditions.kind must fit the hazard. The API rejects duplicate seq values and offsets past durationMinutes.
 */
export const zDrillScenarioContent = z
  .object({
    industry: z.enum(DRILL_INDUSTRIES),
    businessType: z
      .string()
      .trim()
      .max(50)
      .nullable()
      .describe('Business type key from the industry profile, or null'),
    title: requiredText(255),
    hazard: z.enum(DRILL_HAZARDS),
    exerciseType: z.enum(DRILL_EXERCISE_TYPES),
    durationMinutes: z.number().int().min(15).max(DRILL_MAX_DURATION_MINUTES),
    setting: z.object({
      datetime: optionalText(100).describe('In-scenario date/time, free text'),
      weekday: optionalText(100),
      season: optionalText(100),
      location: optionalText(255),
      notes: optionalText(4000),
    }),
    conditions: z
      .object({
        kind: z.enum(DRILL_CONDITION_KINDS),
        assumedDisaster: optionalText(255),
        affectedAreas: z.array(requiredText(255)).max(50).optional(),
        damages: z
          .array(
            z.enum([
              'power_outage',
              'water_outage',
              'gas_outage',
              'telecom_outage',
              'building_collapse',
              'flooding',
              'fire',
              'landslide',
            ]),
          )
          .optional(),
        roadStatus: z.enum(['passable', 'partially_blocked', 'widely_blocked', 'unknown']).optional(),
        roadNotes: optionalText(1000),
        phase: z.enum(['hyperacute', 'acute', 'subacute', 'chronic']).optional(),
        attackType: z
          .enum([
            'ransomware',
            'data_breach',
            'ddos',
            'account_takeover',
            'supply_chain',
            'business_email_compromise',
            'unknown',
          ])
          .optional(),
        entryPoint: optionalText(255),
        affectedSystems: z.array(requiredText(255)).max(30).optional(),
        impacts: z
          .array(
            z.enum([
              'encryption',
              'exfiltration',
              'service_disruption',
              'fraudulent_transactions',
              'defacement',
            ]),
          )
          .optional(),
        dataAtRisk: z
          .array(
            z.enum([
              'personal',
              'customer_financial',
              'medical',
              'credentials',
              'trade_secrets',
              'none',
              'unknown',
            ]),
          )
          .optional(),
        ransomDemand: z.boolean().optional(),
        containment: z
          .enum(['not_contained', 'partially_contained', 'contained', 'unknown'])
          .optional(),
        detectedBy: z
          .enum(['edr_siem', 'user_report', 'vendor', 'external_notice', 'attacker_contact'])
          .optional(),
        scope: z.enum(['single_site', 'multiple_sites', 'region', 'nationwide']).optional(),
        cause: z
          .enum([
            'utility',
            'equipment_failure',
            'construction_damage',
            'provider_incident',
            'natural_event',
            'unknown',
          ])
          .optional(),
        affectedSites: z.array(requiredText(255)).max(30).optional(),
        expectedDurationHours: z.number().int().min(0).max(240).optional(),
        backupStatus: z
          .enum(['backup_available', 'backup_limited', 'no_backup', 'unknown'])
          .optional(),
        disease: optionalText(255),
        stage: z.enum(['early', 'spreading', 'peak', 'recovery']).optional(),
        staffAbsenceRate: z.number().int().min(0).max(100).optional(),
        measures: z
          .array(
            z.enum([
              'remote_work',
              'split_shifts',
              'site_closure',
              'visitor_restriction',
              'travel_restriction',
            ]),
          )
          .optional(),
        notes: optionalText(1000),
      })
      .describe(
        'Assumed conditions. kind must fit the hazard: earthquake and flood use natural_disaster, cyber uses cyber_attack, power_outage and network_outage use infrastructure_outage, pandemic uses pandemic. compound and other may use any kind.',
      ),
    priorityServices: z
      .array(
        z.object({
          serviceIds: z.array(z.string().uuid()).max(30).describe('CMDB service UUIDs. Empty until mapped.'),
          name: requiredText(255),
          rto: z.number().int().min(0).nullable().describe('Recovery time objective, minutes'),
          rpo: z.number().int().min(0).nullable().describe('Recovery point objective, minutes'),
        }),
      )
      .max(30),
    injects: z
      .array(
        z.object({
          seq: z.number().int().min(1).describe('Unique card number within the scenario'),
          offsetMinutes: z.number().int().min(0).max(DRILL_MAX_DURATION_MINUTES),
          cardNo: optionalText(30),
          title: optionalText(255),
          sender: requiredText(255),
          recipient: optionalText(255),
          recipientContact: optionalText(255),
          method: z.enum(DRILL_INJECT_METHODS).optional(),
          condition: optionalText(1000),
          content: requiredText(4000),
          expectedDecision: requiredText(2000),
          evaluationPoints: z.array(requiredText(500)).max(10),
          controllerPrompts: z.array(requiredText(500)).max(10).optional(),
          notes: optionalText(1000),
          parentSeq: z.number().int().min(1).optional(),
          regulatoryDeadline: z
            .object({
              regulationKey: optionalText(100),
              regulationName: requiredText(255),
              clause: z.string().trim().max(255),
              deadlineOffsetMinutes: z.number().int().min(0).max(DRILL_MAX_DURATION_MINUTES),
            })
            .optional(),
        }),
      )
      .min(1)
      .max(40),
    wildcards: z
      .array(
        z.object({
          content: requiredText(4000),
          triggerHint: z.string().trim().max(1000),
        }),
      )
      .max(10),
  })
  .describe('Scenario content. conditions.kind must fit the hazard.');

export const zDrillScenarioStatus = z.enum(DRILL_SCENARIO_STATUSES);

export const zDrillDecisionCheck = z.object({
  item: z.string().min(1).max(500),
  met: z.boolean(),
});

export const zDrillDecisionSource = z.enum(DRILL_DECISION_SOURCES);

/** Drop `undefined` so a parsed tool input can be sent as JSON. */
export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function toJsonObject(value: unknown): JsonObject {
  const json = toJsonValue(value);
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Expected a JSON object');
  }
  return json;
}
