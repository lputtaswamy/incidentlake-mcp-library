import { createHash } from 'node:crypto';
import {
  SdkError,
  SdkErrorCode,
  acceptedContent,
  inputRequired,
  inputResponse,
  type CallToolResult,
  type ClientCapabilities,
  type InputRequiredResult,
  type McpServer,
  type ServerContext,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

/**
 * Names of tools that delete or change existing data. Create/add/list/get/search stay out.
 * `set_`, `link_`, `close_`, `reject_`, `import_` and the rest are the same kind of change;
 * the original prefix list did not name them, so calls such as close_incident and
 * link_incident_task_external_issue ran with no approval. A tool whose name says nothing
 * (merge_, move_, restore_...) is gated by declaring `destructiveHint: true` instead.
 */
const DANGEROUS_TOOL_PATTERN =
  /^(bulk_)?(delete|remove|update|replace|upsert|resolve|reopen|publish|cancel|dismiss|approve|unlink|uncomplete|sync|save|set|link|close|reject|fulfill|escalate|import|confirm)_/;

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
const SECRET_KEY_PATTERN = /secret|token|password|api_?key/i;

const approvalSchema = z.object({
  approve: z.boolean().describe('Approve running this tool with the arguments shown'),
});

const APPROVAL_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    approve: {
      type: 'boolean' as const,
      title: 'Approve',
      description: 'Run this tool with the arguments shown above',
      default: false,
    },
  },
  required: ['approve'],
};

type RegisterTool = McpServer['registerTool'];
type ToolConfig = { annotations?: ToolAnnotations; [key: string]: unknown };
type ToolResult = CallToolResult | InputRequiredResult;
/** `(input, ctx)`, or `(ctx)` alone when the tool has no inputSchema. */
type ToolHandler = (...args: unknown[]) => ToolResult | Promise<ToolResult>;

export function isDangerousTool(name: string): boolean {
  return DANGEROUS_TOOL_PATTERN.test(name);
}

/** Gated by name, or because the tool itself declares that it changes existing data. */
export function needsApproval(name: string, annotations?: ToolAnnotations): boolean {
  return isDangerousTool(name) || annotations?.destructiveHint === true;
}

/**
 * Form elicitation, including clients from before mode was added. Those advertise
 * `elicitation: {}`. A client that only advertises `elicitation.url` cannot show the dialog.
 */
export function supportsFormElicitation(capabilities: ClientCapabilities | undefined): boolean {
  const elicitation = capabilities?.elicitation;
  if (!elicitation || typeof elicitation !== 'object') return false;
  if (elicitation.form !== undefined) return true;
  return Object.keys(elicitation).length === 0;
}

function clientCapabilities(server: McpServer, ctx: ServerContext): ClientCapabilities | undefined {
  const envelope = (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[CLIENT_CAPABILITIES_META_KEY];
  if (envelope && typeof envelope === 'object') return envelope as ClientCapabilities;
  return server.server.getClientCapabilities();
}

function declined(name: string): CallToolResult {
  return refuse(
    `The user did not approve "${name}", so nothing was changed. Do not retry unless the user asks for it again.`,
  );
}

function failed(name: string, error: unknown): CallToolResult {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
  return refuse(
    `Could not get the user's approval for "${name}", so nothing was changed: ${errorMessage} Do not retry unless the user asks for it again.`,
  );
}

function refuse(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function isProtocolEraError(error: unknown): boolean {
  return error instanceof SdkError && error.code === SdkErrorCode.MethodNotSupportedByProtocolVersion;
}

function approved(content: unknown): boolean {
  return (
    typeof content === 'object' &&
    content !== null &&
    'approve' in content &&
    (content as { approve?: unknown }).approve === true
  );
}

/** The dialog shows what will change, not credentials: a client may log what it displays. */
function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) && typeof item === 'string' && item !== '' ? '(hidden)' : withoutSecrets(item),
    ]),
  );
}

function argumentsText(input: unknown): string {
  const text = JSON.stringify(withoutSecrets(input ?? {}), null, 2);
  return text.length > 4000 ? `${text.slice(0, 3999)}…` : text;
}

function approvalMessage(name: string, input: unknown): string {
  return `Approve running "${name}"? This deletes or changes data in Incident Lake.\n\nArguments:\n${argumentsText(input)}`;
}

/** JSON with object keys in a fixed order, so equal arguments always give the same text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null';
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

/**
 * The input-request key for one exact call. An answer comes back under the key it was asked
 * with, so approving one call says nothing about another tool or other arguments: that call
 * has a different key, finds no answer, and asks again.
 */
export function approvalKey(name: string, input: unknown): string {
  const digest = createHash('sha256').update(`${name}\n${stableJson(input ?? {})}`).digest('hex');
  return `approve_${digest.slice(0, 32)}`;
}

function askOnRetry(name: string, input: unknown): InputRequiredResult {
  return inputRequired({
    inputRequests: {
      [approvalKey(name, input)]: inputRequired.elicit({
        message: approvalMessage(name, input),
        requestedSchema: approvalSchema,
      }),
    },
  });
}

/**
 * Tools registered after this call that change existing data (by name, or by declaring
 * `destructiveHint: true`) ask the user to approve each call before touching any data, and
 * are annotated with `destructiveHint` so clients prompt themselves. Clients without form
 * elicitation, including the stateless HTTP transport, rely on that client-side prompt.
 *
 * Clients on the 2025 protocol get one elicitation dialog (`elicitation: {}` counts as form
 * support). Clients on the 2026 protocol, which has no server-to-client request, get the
 * same question as an input-required result and the tool runs on the retry. That answer
 * only counts for the tool and arguments it was asked about.
 */
export function requireApprovalForDangerousTools(server: McpServer): void {
  const registerTool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: ToolConfig,
    cb: ToolHandler,
  ) => ReturnType<RegisterTool>;

  server.registerTool = ((name: string, config: ToolConfig, cb: ToolHandler) => {
    if (!needsApproval(name, config.annotations)) return registerTool(name, config, cb);
    return registerTool(
      name,
      {
        ...config,
        annotations: { ...config.annotations, readOnlyHint: false, destructiveHint: true },
      },
      async (...args) => {
        // The context is always last; a tool without inputSchema gets nothing before it.
        const ctx = args[args.length - 1] as ServerContext;
        const input = args.length > 1 ? args[0] : {};
        const gate = await requestApproval(server, name, input, ctx);
        return gate ?? cb(...args);
      },
    );
  }) as RegisterTool;
}

async function requestApproval(
  server: McpServer,
  name: string,
  input: unknown,
  ctx: ServerContext,
): Promise<ToolResult | undefined> {
  if (!supportsFormElicitation(clientCapabilities(server, ctx))) return undefined;

  const key = approvalKey(name, input);
  const prior = inputResponse(ctx.mcpReq.inputResponses, key);
  if (prior.kind === 'elicit') {
    const content = acceptedContent(ctx.mcpReq.inputResponses, key, approvalSchema);
    return prior.action === 'accept' && content?.approve === true ? undefined : declined(name);
  }

  const message = approvalMessage(name, input);
  const options = { signal: ctx.mcpReq.signal, timeout: APPROVAL_TIMEOUT_MS };
  const capabilities = clientCapabilities(server, ctx);
  const legacyForm = capabilities?.elicitation?.form === undefined;

  try {
    const result = legacyForm
      ? await ctx.mcpReq.send(
          { method: 'elicitation/create', params: { mode: 'form', message, requestedSchema: APPROVAL_JSON_SCHEMA } },
          options,
        )
      : await ctx.mcpReq.elicitInput(
          { mode: 'form', message, requestedSchema: APPROVAL_JSON_SCHEMA },
          options,
        );
    return result.action === 'accept' && approved(result.content) ? undefined : declined(name);
  } catch (error) {
    if (isProtocolEraError(error)) return askOnRetry(name, input);
    return failed(name, error);
  }
}
