/**
 * makeAgenticAskHandler — wraps runAgenticTurn into an AskCommandHandler.
 */

import { makeAgenticAskHandler, DEFAULT_ASK_SYSTEM_PROMPT } from '../../src/reasoning/ask_handler';
import { ToolRegistry, type AgentTool } from '../../src/reasoning/tool_registry';
import type {
  ChatResponse,
  LLMProvider,
  ToolCall,
} from '../../src/llm/adapters/provider';

function scriptedProvider(script: Array<Partial<ChatResponse>>): LLMProvider {
  let i = 0;
  return {
    name: 'test',
    supportsStreaming: false,
    supportsToolCalling: true,
    supportsEmbedding: false,
    async chat() {
      const step = script[i] ?? { content: '(end)', toolCalls: [] };
      i++;
      return {
        content: step.content ?? '',
        toolCalls: step.toolCalls ?? [],
        model: 'test',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: (step.toolCalls?.length ?? 0) > 0 ? 'tool_use' : 'end',
      };
    },
    async *stream() { throw new Error('nope'); },
    async embed() { throw new Error('nope'); },
  };
}

function queryServiceTool(taskId: string): AgentTool {
  return {
    name: 'query_service',
    description: 'Dispatch query.',
    parameters: {
      type: 'object',
      properties: {
        operator_did: { type: 'string' },
        capability: { type: 'string' },
        params: { type: 'object' },
      },
      required: ['operator_did', 'capability', 'params'],
    },
    execute: async () => ({
      task_id: taskId,
      query_id: 'q-1',
      to_did: 'did:plc:bus',
      service_name: 'Bus 42',
      deduped: false,
      status: 'pending',
    }),
  };
}

describe('makeAgenticAskHandler', () => {
  it('returns final text + no sources when LLM answers without tool calls', async () => {
    const handler = makeAgenticAskHandler({
      provider: scriptedProvider([{ content: 'Hi there!', toolCalls: [] }]),
      tools: new ToolRegistry(),
    });
    const result = await handler('say hi');
    expect(result.response).toBe('Hi there!');
    expect(result.sources).toEqual([]);
  });

  it('surfaces task_ids from successful query_service calls as sources', async () => {
    const qCall: ToolCall = {
      id: 'c1', name: 'query_service',
      arguments: { operator_did: 'did:plc:bus', capability: 'eta_query', params: {} },
    };
    const handler = makeAgenticAskHandler({
      provider: scriptedProvider([
        { content: '', toolCalls: [qCall] },
        { content: 'Asking Bus 42…', toolCalls: [] },
      ]),
      tools: (() => {
        const r = new ToolRegistry();
        r.register(queryServiceTool('svc-q-99'));
        return r;
      })(),
    });
    const result = await handler('when is bus 42?');
    expect(result.response).toBe('Asking Bus 42…');
    expect(result.sources).toEqual(['svc-q-99']);
  });

  it('never surfaces sources from failed query_service calls', async () => {
    const qCall: ToolCall = {
      id: 'c1', name: 'query_service',
      arguments: { operator_did: 'did:plc:bus', capability: 'eta_query', params: {} },
    };
    const failingQueryTool: AgentTool = {
      name: 'query_service',
      description: 'x',
      parameters: {
        type: 'object',
        properties: { operator_did: { type: 'string' }, capability: { type: 'string' }, params: { type: 'object' } },
        required: ['operator_did', 'capability', 'params'],
      },
      execute: async () => { throw new Error('AppView down'); },
    };
    const tools = new ToolRegistry();
    tools.register(failingQueryTool);
    const handler = makeAgenticAskHandler({
      provider: scriptedProvider([
        { content: '', toolCalls: [qCall] },
        { content: 'could not reach the service', toolCalls: [] },
      ]),
      tools,
    });
    const result = await handler('ask');
    expect(result.sources).toEqual([]);
  });

  it('onTurn trace fires with usage + tool-call summary', async () => {
    const traces: Array<Record<string, unknown>> = [];
    const handler = makeAgenticAskHandler({
      provider: scriptedProvider([{ content: 'ok', toolCalls: [] }]),
      tools: new ToolRegistry(),
      onTurn: (t) => traces.push(t),
    });
    await handler('hi');
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      query: 'hi',
      answer: 'ok',
      finishReason: 'completed',
      tokens: { input: 10, output: 20 },
    });
  });

  // Architectural invariant: the default system prompt carries BEHAVIOUR
  // rules only. Tool names + parameters come through the provider's tool
  // channel (ToolRegistry → runAgenticTurn → provider.chat({tools})).
  // Baking tool names into the prompt would recreate the coupling this
  // refactor just removed — adding a new capability should be a registry
  // insertion, not a prose edit.
  it('default system prompt enumerates NO specific tool names', () => {
    const forbidden = [
      'geocode(',
      'search_public_services(',
      'query_service(',
      'eta_query',
      'Bus 42',
    ];
    for (const needle of forbidden) {
      expect(DEFAULT_ASK_SYSTEM_PROMPT).not.toContain(needle);
    }
  });

  it('default system prompt carries the core behaviour rules', () => {
    // Keywords that MUST be present — these are the contract with the LLM.
    // If any of these disappear, the agent loses a safety property.
    expect(DEFAULT_ASK_SYSTEM_PROMPT).toMatch(/never fabricate/i);
    expect(DEFAULT_ASK_SYSTEM_PROMPT).toMatch(/acknowledge/i);
    expect(DEFAULT_ASK_SYSTEM_PROMPT).toMatch(/asynchronous/i);
  });

  it('returns a fallback when the loop ends with empty answer (max_iterations)', async () => {
    const toolCall: ToolCall = { id: 'c1', name: 'echo', arguments: { text: 'x' } };
    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: 'x',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      execute: async () => ({ text: 'x' }),
    });
    const handler = makeAgenticAskHandler({
      provider: scriptedProvider(
        Array.from({ length: 20 }, () => ({ content: '', toolCalls: [toolCall] })),
      ),
      tools,
      loopOptions: { maxIterations: 2 },
    });
    const result = await handler('loop');
    expect(result.response).toMatch(/budget/i);
  });
});
