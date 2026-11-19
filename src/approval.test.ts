import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SdkError, SdkErrorCode, type CallToolResult, type McpServer, type ServerContext } from '@modelcontextprotocol/server';
import { isDangerousTool, requireApprovalForDangerousTools, supportsFormElicitation } from './approval';

type Handler = (
  input: Record<string, unknown>,
  ctx: ServerContext,
) => Promise<CallToolResult>;

function install(capabilities: unknown) {
  const captured: { cb?: Handler; annotations?: { destructiveHint?: boolean } } = {};
  const server = {
    registerTool(_name: string, config: { annotations?: { destructiveHint?: boolean } }, cb: Handler) {
      captured.cb = cb;
      captured.annotations = config.annotations;
      return {};
    },
    server: { getClientCapabilities: () => capabilities },
  };
  requireApprovalForDangerousTools(server as unknown as McpServer);
  return {
    server,
    captured: captured as { cb?: Handler; annotations?: { destructiveHint?: boolean } },
  };
}

function call(captured: { cb?: Handler }): Handler {
  if (!captured.cb) throw new Error('tool was not registered');
  return captured.cb;
}

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  return block?.type === 'text' ? block.text : '';
}

function context(partial: Partial<ServerContext['mcpReq']>): ServerContext {
  return {
    mcpReq: {
      signal: new AbortController().signal,
      inputResponses: undefined,
      envelope: undefined,
      elicitInput: async () => ({ action: 'accept', content: { approve: true } }),
      send: async () => ({ action: 'accept', content: { approve: true } }),
      ...partial,
    },
  } as ServerContext;
}

describe('isDangerousTool', () => {
  it('gates changes to existing data, including the prefixes the first list missed', () => {
    for (const name of [
      'delete_incident',
      'bulk_delete_incidents',
      'update_incident',
      'link_incident_task_external_issue',
      'close_incident',
      'reject_incident_task',
      'set_incident_commanders',
      'import_knowledge_items_csv',
      'fulfill_service_request',
      'escalate_portal_request',
      'confirm_spec_page_trace_link',
    ]) {
      assert.equal(isDangerousTool(name), true, name);
    }
  });

  it('leaves reads and creates alone', () => {
    for (const name of ['get_incident', 'list_incidents', 'create_incident', 'search_incidents', 'add_incident_note']) {
      assert.equal(isDangerousTool(name), false, name);
    }
  });
});

describe('supportsFormElicitation', () => {
  it('treats a bare elicitation capability as form support and rejects url-only clients', () => {
    assert.equal(supportsFormElicitation({ elicitation: {} }), true);
    assert.equal(supportsFormElicitation({ elicitation: { form: {} } }), true);
    assert.equal(supportsFormElicitation({ elicitation: { url: {}, form: {} } }), true);
    assert.equal(supportsFormElicitation({ elicitation: { url: {} } }), false);
    assert.equal(supportsFormElicitation(undefined), false);
    assert.equal(supportsFormElicitation({}), false);
  });
});

describe('requireApprovalForDangerousTools', () => {
  it('runs a legacy form client only after the elicitation dialog is accepted', async () => {
    const { server, captured } = install({ elicitation: {} });
    const calls: string[] = [];
    server.registerTool('delete_incident', {}, async () => {
      calls.push('ran');
      return { content: [{ type: 'text', text: 'gone' }] };
    });
    assert.equal(captured.annotations?.destructiveHint, true);

    const declined = await call(captured)(
      { incidentId: 'x' },
      context({
        send: async () => {
          calls.push('asked');
          return { action: 'decline' };
        },
      }),
    );
    assert.deepEqual(calls, ['asked']);
    assert.equal(declined.isError, true);
    assert.match(textOf(declined), /Do not retry unless the user asks/);

    const accepted = await call(captured)(
      { incidentId: 'x' },
      context({ send: async () => ({ action: 'accept', content: { approve: true } }) }),
    );
    assert.equal(textOf(accepted), 'gone');
  });

  it('does not ask a url-only client', async () => {
    const { server, captured } = install({ elicitation: { url: {} } });
    let ran = false;
    server.registerTool('delete_incident', {}, async () => {
      ran = true;
      return { content: [{ type: 'text', text: 'gone' }] };
    });
    await call(captured)({}, context({ send: async () => ({ action: 'decline' }) }));
    assert.equal(ran, true);
  });

  it('uses elicitInput when the client advertises form mode, and refuses an unticked approval', async () => {
    const { server, captured } = install({ elicitation: { form: {} } });
    const calls: string[] = [];
    server.registerTool('update_incident', {}, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const result = await call(captured)(
      {},
      context({
        elicitInput: async () => {
          calls.push('form');
          return { action: 'accept', content: { approve: false } };
        },
        send: async () => {
          calls.push('legacy');
          return { action: 'accept', content: { approve: true } };
        },
      }),
    );
    assert.deepEqual(calls, ['form']);
    assert.equal(result.isError, true);
    assert.match(textOf(result), /Do not retry unless the user asks/);
  });

  it('tells the model not to retry when the dialog times out', async () => {
    const { server, captured } = install({ elicitation: { form: {} } });
    server.registerTool('delete_incident', {}, async () => ({ content: [{ type: 'text', text: 'ran' }] }));
    const result = await call(captured)(
      {},
      context({
        elicitInput: async () => {
          throw new SdkError(SdkErrorCode.RequestTimeout, 'timed out');
        },
      }),
    );
    assert.equal(result.isError, true);
    assert.match(textOf(result), /timed out/);
    assert.match(textOf(result), /Do not retry unless the user asks/);
  });

  it('asks through inputRequired when push elicitation is not in the protocol, then runs on approval', async () => {
    const { server, captured } = install({ elicitation: { form: {} } });
    server.registerTool('delete_incident', {}, async () => ({ content: [{ type: 'text', text: 'ran' }] }));
    const asked = await call(captured)(
      { incidentId: 'x' },
      context({
        elicitInput: async () => {
          throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, 'use inputRequired');
        },
      }),
    );
    assert.equal('resultType' in asked && asked.resultType, 'input_required');

    const retried = await call(captured)(
      { incidentId: 'x' },
      context({
        inputResponses: {
          approve_destructive_tool: { action: 'accept', content: { approve: true } },
        },
      }),
    );
    assert.equal(textOf(retried), 'ran');
  });
});
