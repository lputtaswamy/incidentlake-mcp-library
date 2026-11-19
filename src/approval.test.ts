import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryTransport,
  McpServer,
  SdkError,
  SdkErrorCode,
  type CallToolResult,
  type JSONRPCMessage,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  approvalKey,
  isDangerousTool,
  needsApproval,
  requireApprovalForDangerousTools,
  supportsFormElicitation,
} from './approval';
import { registerTools } from './tools/index';

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

describe('needsApproval', () => {
  it('also gates a tool that declares destructiveHint under a name the list does not cover', () => {
    assert.equal(needsApproval('merge_spec_change_request', { destructiveHint: true }), true);
    assert.equal(needsApproval('merge_spec_change_request', { destructiveHint: false }), false);
    assert.equal(needsApproval('merge_spec_change_request'), false);
    assert.equal(needsApproval('delete_incident'), true);
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
          [approvalKey('delete_incident', { incidentId: 'x' })]: { action: 'accept', content: { approve: true } },
        },
      }),
    );
    assert.equal(textOf(retried), 'ran');
  });

  it('asks again when an approval is replayed for other arguments or another tool', async () => {
    const pushUnsupported = async () => {
      throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, 'use inputRequired');
    };
    const approvedForA = {
      [approvalKey('delete_incident', { incidentId: 'a' })]: { action: 'accept', content: { approve: true } },
    };
    const ran: string[] = [];

    const incidents = install({ elicitation: { form: {} } });
    incidents.server.registerTool('delete_incident', {}, async () => {
      ran.push('delete_incident');
      return { content: [{ type: 'text', text: 'ran' }] };
    });
    const otherArguments = await call(incidents.captured)(
      { incidentId: 'b' },
      context({ inputResponses: approvedForA, elicitInput: pushUnsupported }),
    );
    assert.equal('resultType' in otherArguments && otherArguments.resultType, 'input_required');

    const services = install({ elicitation: { form: {} } });
    services.server.registerTool('delete_service', {}, async () => {
      ran.push('delete_service');
      return { content: [{ type: 'text', text: 'ran' }] };
    });
    const otherTool = await call(services.captured)(
      { incidentId: 'a' },
      context({ inputResponses: approvedForA, elicitInput: pushUnsupported }),
    );
    assert.equal('resultType' in otherTool && otherTool.resultType, 'input_required');
    assert.deepEqual(ran, []);

    const sameCall = await call(incidents.captured)(
      { incidentId: 'a' },
      context({ inputResponses: approvedForA, elicitInput: pushUnsupported }),
    );
    assert.equal(textOf(sameCall), 'ran');
  });
});

describe('approvalKey', () => {
  it('is the same for equal arguments in any key order, and differs otherwise', () => {
    assert.equal(approvalKey('update_incident', { a: 1, b: { c: 2, d: 3 } }), approvalKey('update_incident', { b: { d: 3, c: 2 }, a: 1 }));
    assert.notEqual(approvalKey('update_incident', { a: 1 }), approvalKey('update_incident', { a: 2 }));
    assert.notEqual(approvalKey('update_incident', { a: 1 }), approvalKey('update_service', { a: 1 }));
    assert.notEqual(approvalKey('update_incident', { ids: ['a', 'b'] }), approvalKey('update_incident', { ids: ['b', 'a'] }));
  });
});

describe('registered tools', () => {
  it('gates the state changes whose names the list does not cover', () => {
    const gated = new Set<string>();
    const all = new Set<string>();
    const server = {
      registerTool(name: string, config: { annotations?: { destructiveHint?: boolean } }) {
        all.add(name);
        if (config.annotations?.destructiveHint === true) gated.add(name);
        return {};
      },
      server: { getClientCapabilities: () => undefined },
    };
    requireApprovalForDangerousTools(server as unknown as McpServer);
    registerTools(server as unknown as McpServer, { toolsets: new Set() });

    for (const name of [
      'complete_sop_step',
      'start_drill_session',
      'pause_drill_session',
      'resume_drill_session',
      'complete_drill_session',
      'deliver_drill_inject',
      'inject_drill_wildcard',
      'generate_drill_debrief',
      'accept_drill_improvement',
      'delete_incident',
      'update_incident',
    ]) {
      assert.equal(gated.has(name), true, name);
    }
    for (const name of ['get_incident', 'list_incidents', 'create_incident', 'add_incident_note', 'create_drill_session', 'get_drill_session']) {
      assert.equal(all.has(name), true, name);
      assert.equal(gated.has(name), false, name);
    }
  });
});

describe('approval dialog', () => {
  it('asks for a tool gated by destructiveHint alone', async () => {
    const { server, captured } = install({ elicitation: { form: {} } });
    let ran = false;
    server.registerTool('merge_spec_change_request', { annotations: { destructiveHint: true } }, async () => {
      ran = true;
      return { content: [{ type: 'text', text: 'merged' }] };
    });
    const result = await call(captured)({}, context({ elicitInput: async () => ({ action: 'decline' }) }));
    assert.equal(result.isError, true);
    assert.equal(ran, false);
  });

  it('shows the arguments without credentials', async () => {
    const { server, captured } = install({ elicitation: { form: {} } });
    server.registerTool('update_jamf_settings', {}, async () => ({ content: [{ type: 'text', text: 'saved' }] }));
    let message = '';
    await call(captured)(
      { url: 'https://example.test', clientSecret: 'hunter2', nested: { apiKey: 'k-123', label: 'kept' } },
      context({
        elicitInput: async (params: { message: string }) => {
          message = params.message;
          return { action: 'accept', content: { approve: true } };
        },
      } as unknown as Partial<ServerContext['mcpReq']>),
    );
    assert.match(message, /https:\/\/example\.test/);
    assert.match(message, /kept/);
    assert.doesNotMatch(message, /hunter2|k-123/);
  });
});

/** A 2025-protocol client speaking raw JSON-RPC to a real server, answering every elicitation with `answer`. */
async function connectClient(capabilities: unknown, answer: unknown) {
  const server = new McpServer({ name: 'approval-test', version: '0' });
  requireApprovalForDangerousTools(server);
  const ran: string[] = [];
  server.registerTool('delete_thing', { description: 'With input', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => {
    ran.push(`delete ${id}`);
    return { content: [{ type: 'text', text: 'deleted' }] };
  });
  server.registerTool('sync_everything', { description: 'No inputSchema' }, async () => {
    ran.push('sync');
    return { content: [{ type: 'text', text: 'synced' }] };
  });

  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const waiting = new Map<number, (result: unknown) => void>();
  const asked: string[] = [];
  let nextId = 0;
  clientSide.onmessage = (raw: JSONRPCMessage) => {
    const message = raw as { id?: number; method?: string; params?: { message?: string }; result?: unknown };
    if (message.method && message.id !== undefined) {
      asked.push(message.params?.message ?? '');
      void clientSide.send({ jsonrpc: '2.0', id: message.id, result: answer } as JSONRPCMessage);
    } else if (message.id !== undefined) {
      waiting.get(message.id)?.(message.result);
    }
  };
  await clientSide.start();
  const request = (method: string, params: unknown) =>
    new Promise<unknown>((resolve) => {
      nextId += 1;
      waiting.set(nextId, resolve);
      void clientSide.send({ jsonrpc: '2.0', id: nextId, method, params } as JSONRPCMessage);
    });
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities,
    clientInfo: { name: 'approval-test-client', version: '0' },
  });
  await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as JSONRPCMessage);
  const callTool = (name: string, args: Record<string, unknown>) =>
    request('tools/call', { name, arguments: args }) as Promise<CallToolResult>;
  return { callTool, asked, ran, close: () => server.close() };
}

describe('approval over a real connection', () => {
  const accept = { action: 'accept', content: { approve: true } };

  it('asks once and runs only when approved', async () => {
    const declining = await connectClient({ elicitation: {} }, { action: 'decline' });
    const refused = await declining.callTool('delete_thing', { id: 'a' });
    assert.equal(refused.isError, true);
    assert.deepEqual(declining.ran, []);
    assert.equal(declining.asked.length, 1);
    await declining.close();

    const accepting = await connectClient({ elicitation: { form: {} } }, accept);
    assert.equal(textOf(await accepting.callTool('delete_thing', { id: 'a' })), 'deleted');
    assert.deepEqual(accepting.ran, ['delete a']);
    assert.equal(accepting.asked.length, 1);
    await accepting.close();
  });

  it('gates and runs a tool registered without inputSchema', async () => {
    const declining = await connectClient({ elicitation: { form: {} } }, { action: 'decline' });
    assert.match(textOf(await declining.callTool('sync_everything', {})), /did not approve/);
    assert.deepEqual(declining.ran, []);
    await declining.close();

    const accepting = await connectClient({ elicitation: { form: {} } }, accept);
    assert.equal(textOf(await accepting.callTool('sync_everything', {})), 'synced');
    await accepting.close();

    const silent = await connectClient({}, accept);
    assert.equal(textOf(await silent.callTool('sync_everything', {})), 'synced');
    assert.equal(silent.asked.length, 0);
    await silent.close();
  });
});
