/** Test-only native profile contribution: bounded synthetic inference and memory credentials. */
import { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const text = value => [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: value }, { type: 'block-end', index: 0, block: { type: 'text', text: value } }, { type: 'finish', reason: { kind: 'stop' } }];
const calls = entries => [...entries.flatMap(([name, args], index) => [{ type: 'block-start', index, blockType: 'tool-call' }, { type: 'tool-call-delta', index, id: `bounded-${index}`, name, argumentsDelta: JSON.stringify(args) }, { type: 'block-end', index, block: { type: 'tool-call', id: `bounded-${index}`, name, arguments: JSON.stringify(args) } }]), { type: 'finish', reason: { kind: 'tool-calls' } }];
export default class FixtureCredentials extends CredentialProvider {
  static inject = ['llm', 'agents', 'tools', 'agentTeams', 'userQuestions', 'approval', 'sandboxPolicy'];
  constructor(ctx) {
    super(ctx);
    const child = ctx;
      let requests = 0; const followed = new Set(), interacted = new Set();
      class Adapter extends LlmAdapter {
        async listModels(provider) { return [{ provider, id: 'fixture-model', name: 'Bounded native e2e fixture' }]; }
        async resolveModel(provider, id) { if (id !== 'fixture-model') throw new Error('Unknown fixture model'); return { provider, id, name: 'Bounded native e2e fixture' }; }
        async *stream(options) {
          const agent = child.agents.get(options.sessionId);
          if (++requests > 24 || options.provider !== 'fixture-native' || options.model !== 'fixture-model' || agent.session.header.cwd !== resolve(process.env.DSH_HOME, 'fixture')) throw new Error('Bounded synthetic inference refused');
          await appendFile(join(process.env.DSH_HOME, 'synthetic-requests.jsonl'), JSON.stringify({ sessionId: agent.id, provider: options.provider, model: options.model }) + '\n');
          if (child.approval.overrideOf(agent.session) !== 'never' || child.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access') throw new Error('Synthetic request must retain the default full-access policy before work');
          const serialized = JSON.stringify(options.messages);
          const membership = child.agentTeams.tryMembership(agent);
          if (membership?.role === 'lead' && serialized.includes('INTERACTION_BRIDGE') && !interacted.has(agent.id)) {
            interacted.add(agent.id);
            const answer = await child.userQuestions.ask({ agent, questions: [{ id: 'scope', question: 'Use the approved synthetic scope?', options: [{ label: 'existing' }, { label: 'new' }] }] });
            const approval = await child.approval.request({ agent, toolName: 'synthetic-noop', callId: 'synthetic-authority', reason: 'No files or external resources are changed.' });
            await appendFile(join(process.env.DSH_HOME, 'synthetic-interactions.jsonl'), JSON.stringify({ agentId: agent.id, answer, approval }) + '\n');
          }
          if (membership?.role === 'lead') {
            const roster = child.agentTeams.listMembers(agent);
            const missing = ['left', 'right'].filter(role => !roster.some(member => member.name === `${role}-one`));
            if (serialized.includes('CREATE_SYNTHETIC_TEAM') && missing.length) { yield* calls(missing.map(role => ['spawn_role_teammate', { name: `${role}-one`, role, prompt: `Synthetic ${role} result only.` }])); return; }
            if (serialized.includes('FOLLOW_SAME') && !followed.has(agent.id)) { followed.add(agent.id); yield* calls([['send_message', { target: 'left-one', message: 'Synthetic same-member follow-up.' }]]); return; }
          }
          yield* text('NATIVE_OWNED_E2E_COMPLETE');
        }
      }
      child.effect(() => child.llm.registerAdapter(['fixture-native'], new Adapter()));
      child.on('agent/created', ({ agent }) => {
        if (agent.session.header.cwd !== resolve(process.env.DSH_HOME, 'fixture')) throw new Error('Synthetic e2e workspace mismatch');
        agent.options.maxTokens = 512; agent.ctx.tools.restrict({ allow: [] });
      }, { prepend: true });
  }
  async resolve() { return undefined; }
  async describe() { return { configured: false, writable: false }; }
  async set() { throw new Error('Fixture credentials are read-only'); } async unset() { throw new Error('Fixture credentials are read-only'); }
  async readRecord() { return undefined; } async describeRecord() { return { configured: false, writable: false }; } async listRecords() { return []; }
  async deleteRecord() { throw new Error('Fixture credentials are read-only'); }
  async modifyRecord(_key, mutate) {
    const record = { kind: 'grant', payload: { version: 1, secret: Buffer.alloc(32, 89).toString('base64url') } };
    if (await mutate(record) !== undefined) throw new Error('Fixture credentials are read-only'); return record;
  }
}
