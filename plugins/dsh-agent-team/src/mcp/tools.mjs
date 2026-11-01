/** Explicit native Session operations exposed to an MCP client. */
const string = (description) => ({ type: 'string', minLength: 1, description });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const teamId = string('Durable native Lead/root Session ID returned by create; a member Session is not an instruction target.');

export const tools = [
  { name: 'dsh_team_web', description: 'Open this owned native Web instance through its authorized browser handoff. Launch tokens and API cookies are never returned.', inputSchema: object({}) },
  { name: 'dsh_team_shutdown', description: 'Gracefully stop only the attributed owned host when native admission and activity checks prove it safe. Active or uncertain work keeps it running.', inputSchema: object({}) },
  { name: 'dsh_team_health', description: 'Check the owned native DSH Web host, runtime compatibility and role catalog.', inputSchema: object({}) },
  { name: 'dsh_team_create', description: 'Create or retrieve a managed native DSH Lead/root Session using an idempotency key. Omit leadRole to use host defaults, including native model inheritance when no roles are configured. Acceptance is separate from processing. Use English task text and require English replies from Lead. After success, present teamId and web.url to the user; web.scope=host labels an owned-host homepage, not a Team permalink. Displaying it does not open a browser.', inputSchema: object({ key: string('Caller idempotency key; identical content only.'), text: string('English task brief. Include: Communicate with Codex main in English. Preserve code, paths and necessary original-language quotations.'), cwd: string('Authorized workspace directory.'), workspaceId: string('Existing native workspace ID for grouping.'), agentPreset: string('Existing native agent preset.'), leadRole: string('Optional configured allowlisted lead profile. Omit for the host default; do not invent a role for an empty catalog.') }, ['key', 'text', 'cwd']) },
  { name: 'dsh_team_send', description: 'Send text only to the same managed Lead/root Session; Lead coordinates member instructions. Explicitly continue interrupted or cold execution. Use English follow-ups/questions and require English replies from Lead.', inputSchema: object({ teamId, inputId: string('Durable input ID; reuse after uncertain outcomes.'), text: string('English follow-up, question or review feedback; request English replies from Lead. Preserve exact code, paths and quoted material.'), mode: { type: 'string', enum: ['queue', 'steer'] }, continue: { type: 'boolean' } }, ['teamId', 'inputId', 'text']) },
  { name: 'dsh_team_status', description: 'Read native runtime and task states, member routes, activity and errors.', inputSchema: object({ teamId }, ['teamId']) },
  { name: 'dsh_team_result', description: 'Read the native Session result and completion evidence. Unknown usage and costs remain unknown.', inputSchema: object({ teamId }, ['teamId']) },
  { name: 'dsh_team_stop', description: 'Cancel native execution. File changes are not rolled back.', inputSchema: object({ teamId }, ['teamId']) },
];

const interaction = {
  teamId,
  interactionId: string('ID returned by pending/wait; native business correlation where available.'),
  deliveryId: string('Current delivery token; refetch after cancellation/reconnect. Never replay a stale answer.'),
};
const selected = { type: 'array', description: 'Exact offered option labels; never translate them.', maxItems: 64, items: { type: 'string', maxLength: 65536 } };
const answers = { type: 'array', minItems: 1, maxItems: 16, items: object({ id: string('Exact question ID.'), selected, custom: { type: 'string', description: 'English free-text answer to Lead, preserving code, paths and necessary original-language quotations.', maxLength: 65536 } }, ['id', 'selected']) };
tools.push(
  { name: 'dsh_team_pending', description: 'Read typed pending Lead questions and native authority events for one managed Team; no member conversation. Main answers ordinary Lead questions and asks the user only for missing information, decisions or new authority.', inputSchema: object({ teamId }, ['teamId']) },
  { name: 'dsh_team_answer', description: 'Submit structured answers to a pending Lead question. Main is the default handler within existing user authority; source=user is required after explicit escalation. This does not approve authority events. Submission is distinct from native acceptance. Use English for free-text answers; preserve exact question IDs and offered option labels.', inputSchema: object({ ...interaction, answers, source: { type: 'string', enum: ['main', 'user'] } }, ['teamId', 'interactionId', 'deliveryId', 'answers', 'source']) },
  { name: 'dsh_team_escalate', description: 'Mark a Lead question as needing user input or a user decision, while retaining its pending native lifetime. Ask the user through the normal conversation, then answer with source=user; this tool does not message the user itself.', inputSchema: object({ ...interaction, reason: string('Specific missing information or decision that requires the user.') }, ['teamId', 'interactionId', 'deliveryId', 'reason']) },
  { name: 'dsh_team_approval', description: 'Deny or submit a one-shot native authority decision, separate from questions. Approve only after explicit user authorization and quote that decision in authorization. Never blanket/always approve; omission never grants permission. A member authority event is not a member task instruction.', inputSchema: object({ ...interaction, decision: { type: 'string', enum: ['approve', 'deny'] }, authorization: string('Explicit user authorization for this exact pending action; required when approving.') }, ['teamId', 'interactionId', 'deliveryId', 'decision']) },
  { name: 'dsh_team_wait', description: 'Wait on native passive follow/state streams for meaningful Team change, pending interactions, authoritative whole-Team completion or timeout. Token chunks are coalesced inside the client. Waits can run alongside stop/answers and support MCP cancellation. Observation timeout <=30s plus at most 1s for a final authoritative read.', inputSchema: object({ teamId, timeoutMs: { type: 'integer', minimum: 0, maximum: 30000 }, after: string('Optional opaque baseline from a previous wait; this is not native afterSeq.') }, ['teamId']) },
);

export const methods = new Map(tools.map((tool) => [tool.name, tool.name.replace('dsh_team_', '')]));

/** Validate the deliberately small JSON schema, including typed answer batches. */
export function validateArguments(schema, value) {
  const visit = (field, item, key) => {
    if (field.type === 'object') {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${key} must be an object.`);
      for (const name of field.required ?? []) if (!(name in item)) throw new Error(`Missing argument: ${name}`);
      for (const [name, child] of Object.entries(item)) {
        if (!Object.hasOwn(field.properties, name)) throw new Error(`Unknown argument: ${name}`);
        visit(field.properties[name], child, name);
      }
    } else if (field.type === 'array') {
      if (!Array.isArray(item) || item.length < (field.minItems ?? 0) || item.length > (field.maxItems ?? 64)) throw new Error(`Invalid array: ${key}`);
      for (const child of item) visit(field.items, child, key);
    } else {
      if (field.type === 'integer' ? !Number.isSafeInteger(item) : typeof item !== field.type) throw new Error(`Invalid argument type: ${key}`);
      if (typeof item === 'string' && (item.length < (field.minLength ?? 0) || item.length > (field.maxLength ?? 65536))) throw new Error(`Invalid argument length: ${key}`);
      if (typeof item === 'number' && (item < (field.minimum ?? -Infinity) || item > (field.maximum ?? Infinity))) throw new Error(`Invalid argument bound: ${key}`);
      if (field.enum && !field.enum.includes(item)) throw new Error(`Invalid argument value: ${key}`);
    }
  };
  visit(schema, value, 'Arguments'); return value;
}
