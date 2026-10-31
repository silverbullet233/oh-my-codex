/** Explicit native Session operations exposed to an MCP client. */
const string = (description) => ({ type: 'string', minLength: 1, description });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const teamId = string('Durable native root Session ID returned by create.');

export const tools = [
  { name: 'dsh_team_web', description: 'Open this owned native Web instance through its authorized browser handoff. Launch tokens and API cookies are never returned.', inputSchema: object({}) },
  { name: 'dsh_team_shutdown', description: 'Gracefully stop only the attributed owned host when native admission and activity checks prove it safe. Active or uncertain work keeps it running.', inputSchema: object({}) },
  { name: 'dsh_team_health', description: 'Check the owned native DSH Web host, runtime compatibility and role catalog.', inputSchema: object({}) },
  { name: 'dsh_team_create', description: 'Create or retrieve a native DSH Session using an idempotency key. Omit leadRole to use host defaults, including native model inheritance when no roles are configured. Acceptance is separate from processing.', inputSchema: object({ key: string('Caller idempotency key; identical content only.'), text: string('Text-only task input.'), cwd: string('Authorized workspace directory.'), workspaceId: string('Existing native workspace ID for grouping.'), agentPreset: string('Existing native agent preset.'), leadRole: string('Optional configured allowlisted lead profile. Omit for the host default; do not invent a role for an empty catalog.') }, ['key', 'text', 'cwd']) },
  { name: 'dsh_team_send', description: 'Send text to the same native Session. Explicitly continue interrupted or cold execution.', inputSchema: object({ teamId, inputId: string('Durable input ID; reuse after uncertain outcomes.'), text: string('Text-only follow-up input.'), mode: { type: 'string', enum: ['queue', 'steer'] }, continue: { type: 'boolean' } }, ['teamId', 'inputId', 'text']) },
  { name: 'dsh_team_status', description: 'Read native runtime and task states, member routes, activity and errors.', inputSchema: object({ teamId }, ['teamId']) },
  { name: 'dsh_team_result', description: 'Read the native Session result and completion evidence. Unknown usage and costs remain unknown.', inputSchema: object({ teamId }, ['teamId']) },
  { name: 'dsh_team_stop', description: 'Cancel native execution. File changes are not rolled back.', inputSchema: object({ teamId }, ['teamId']) },
];

export const methods = new Map(tools.map((tool) => [tool.name, tool.name.replace('dsh_team_', '')]));

/** Validate the small public JSON schema without introducing runtime dependencies. */
export function validateArguments(schema, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Arguments must be an object.');
  for (const key of schema.required) if (!(key in value)) throw new Error(`Missing argument: ${key}`);
  for (const [key, item] of Object.entries(value)) {
    const field = schema.properties[key];
    if (!field) throw new Error(`Unknown argument: ${key}`);
    if (typeof item !== field.type) throw new Error(`Invalid argument type: ${key}`);
    if (field.minLength && item.length < field.minLength) throw new Error(`Empty argument: ${key}`);
    if (field.enum && !field.enum.includes(item)) throw new Error(`Invalid argument value: ${key}`);
  }
  return value;
}
