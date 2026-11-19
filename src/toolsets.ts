/**
 * Groups of Public API tools that can be switched on and off, named after Incident Lake features.
 * The original tool set (incidents, notes, tags, SOP, members, knowledge, CMDB services, risks,
 * integrations, drills, ...) is always registered; these groups add the rest of the Public API.
 *
 * The grouping follows the server's own route-to-feature map (PUBLIC_ROUTE_FEATURES), so a group
 * matches what a tenant can enable or grant: the evidence library belongs to knowledge, locations
 * and business operations to services, and tenant configuration to settings. The CMDB service
 * graph stays in the always-on tools; `services` only adds what those tools do not cover.
 */
export const TOOLSETS = {
  incidents:
    'Custom fields, analytics dashboards and the incident query language, the self-service portal, ITIL fields and closure, AI field provenance and autofill, severity detection, checklist templates, commanders and roles, task reports and approvals, linked changes and risks, RBAC tags, NetBox hardware, emergency chat rooms',
  task_board: 'Task board: projects, tasks, scopes (milestones), comments, files and the work overview',
  service_requests:
    'Service requests: catalog items, submissions, approvals, fulfilment tasks and comments',
  problems: 'Problem management: problem candidates, risk history and links, improvement tasks and corrective actions',
  knowledge:
    'Portal publication, semantic search, versions, CSV import, classification, review settings, and the evidence library',
  changes: 'GitHub repository access, changes, releases, deployments and GitHub sync',
  specs:
    'Traceability and acceptance criteria, spaces, pages, drafts and reviews, threads, versions, change requests, sources and AI judgements',
  emergency: 'Emergency (BCP) response: plans, contacts, activations and AI consultations',
  services:
    'IT assets and Jamf Pro, service incident counts, tags, ITIL attributes, dependency extraction, NetBox devices, the service catalog, locations, business operations and BCP scenarios',
  settings:
    'Custom field definitions, workflow automations, checklist and action item templates, incident roles and routing, severity criteria, RBAC rules, ITIL settings, task pings and checkpoints',
} as const;

export type Toolset = keyof typeof TOOLSETS;

/** Registered when nothing is specified: the groups most clients use day to day. */
export const DEFAULT_TOOLSETS: readonly Toolset[] = ['incidents', 'task_board'];

const ALL_TOOLSETS = Object.keys(TOOLSETS) as Toolset[];

function isToolset(value: string): value is Toolset {
  return Object.prototype.hasOwnProperty.call(TOOLSETS, value);
}

/**
 * Parses a comma-separated toolset list such as `incidents,specs`. `all` selects every group,
 * `none` no extra group, and `default` the default groups (useful as `default,specs`). Unknown
 * names are ignored. An empty or missing value means the defaults.
 */
export function parseToolsets(value: string | null | undefined): Set<Toolset> {
  const names = (value ?? '')
    .split(/[\s,]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  if (names.length === 0) return new Set(DEFAULT_TOOLSETS);

  const selected = new Set<Toolset>();
  for (const name of names) {
    if (name === 'all') ALL_TOOLSETS.forEach((t) => selected.add(t));
    else if (name === 'default') DEFAULT_TOOLSETS.forEach((t) => selected.add(t));
    else if (isToolset(name)) selected.add(name);
  }
  return selected;
}
