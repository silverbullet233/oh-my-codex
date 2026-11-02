/** Opt-in MCP presentation budget; native reads and legacy full results are unchanged. */
export const SUMMARY_BYTES = 16384;
const integer = value => Number.isSafeInteger(value) ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
// Opaque IDs/options must never be made into different identifiers by clipping.
const id = value => typeof value === 'string' && value.length <= 256 && Buffer.byteLength(value) <= 256 ? value : null;
const list = value => Array.isArray(value) ? value : null;
const wrap = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const size = value => Buffer.byteLength(JSON.stringify(value));

/** Native failures are still tool results and must obey the same opt-in budget. */
export function boundedObservationError(error) {
  const nativeCode = error?.code;
  const code = id(nativeCode) ?? 'native/unavailable';
  const detail = { code, message: typeof error?.message === 'string' ? error.message : 'Native operation failed.',
    ...(nativeCode !== undefined && code !== nativeCode ? { codeOmitted: true } : {}) };
  const errorBody = value => ({ isError: true, content: [{ type: 'text', text: JSON.stringify(value) }] });
  if (detail.message.length <= SUMMARY_BYTES) {
    const body = errorBody(detail);
    if (size(body) <= SUMMARY_BYTES) return body;
  }
  return errorBody({ ...detail, message: 'Native error detail exceeded the summary presentation budget and was omitted. Request full view only if the complete detail is necessary.', messageOmitted: true });
}

function preview(value, limit) {
  if (typeof value !== 'string') return { text: '', available: false, previewTruncated: false, originalWellFormed: null };
  // A UTF-16 prefix this long already covers the UTF-8 byte budget. Avoid
  // copying a giant native body just to display its bounded beginning.
  const prefix = value.slice(0, limit + 2), bytes = Buffer.from(prefix, 'utf8');
  let end = Math.min(limit, bytes.length);
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
  return { text: bytes.subarray(0, end).toString('utf8'), available: true, previewTruncated: end < bytes.length || prefix.length < value.length, originalWellFormed: value.isWellFormed() };
}

function cut(value) {
  if (!value) return null;
  const rows = list(value.freshness?.projections);
  return { asOfSeq: integer(value.asOfSeq), scope: id(value.asOfSeqScope) ?? 'unknown',
    projections: (rows ?? []).slice(0, 8).map(row => ({ sessionId: id(row?.sessionId), asOfSeq: integer(row?.asOfSeq), unchangedAtCheck: boolean(row?.unchangedAtCheck) })),
    omittedProjections: rows === null ? null : Math.max(0, rows.length - 8) };
}

function turns(value) {
  if (!value) return null;
  return { latestStarted: value.latestStarted ? { turn: integer(value.latestStarted.turn), startSeq: integer(value.latestStarted.startSeq) } : null,
    active: integer(value.active), lastEnded: value.lastEnded ? { turn: integer(value.lastEnded.turn), seq: integer(value.lastEnded.seq), reason: id(value.lastEnded.reason) } : null,
    lastCompleted: value.lastCompleted ? { turn: integer(value.lastCompleted.turn), endSeq: integer(value.lastCompleted.endSeq) } : null };
}

function execution(value) {
  if (!value) return null;
  return { nativeTeamCompleted: boolean(value.nativeTeamCompleted), ownedJobsSettled: boolean(value.ownedJobsSettled),
    scope: id(value.scope), atomic: false, admissionBarrier: boolean(value.admissionBarrier), resourceReleaseVerified: false, goalAccepted: null,
    jobs: { available: boolean(value.jobs?.available), reason: id(value.jobs?.reason), rootAsOfSeq: integer(value.jobs?.rootAsOfSeq),
      ownerScopeUnchangedAtCheck: boolean(value.jobs?.ownerScopeUnchangedAtCheck), sameRootCut: boolean(value.jobs?.sameRootCut),
      counts: value.jobs?.counts ? Object.fromEntries(['running', 'stopping', 'completed', 'killed', 'failed'].map(key => [key, integer(value.jobs.counts[key])])) : null } };
}

function toolActivity(value) {
  if (value?.format !== 'native-tool-receipts-v1' || !Array.isArray(value.sessions)) return { available: false, reason: 'not-provided-or-unsupported-format' };
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const receipt = row => row ? { callId: id(row.callId), name: id(row.name), step: count(row.step), callSeq: count(row.callSeq),
    ...(row.resultSeq === undefined ? {} : { resultSeq: count(row.resultSeq), isError: boolean(row.isError) }) } : null;
  return { available: true, format: value.format, atomic: false, historyScope: 'latest-started-turn',
    sessions: value.sessions.slice(0, 4).map(row => {
      const calls = list(row.unsettled), omitted = count(row.omittedSamples);
      return { sessionId: id(row.sessionId), asOfSeq: count(row.asOfSeq), unchangedAtCheck: boolean(row.unchangedAtCheck), available: boolean(row.available), reason: id(row.reason),
        turn: count(row.turn), turnOpen: boolean(row.turnOpen), observedCalls: count(row.observedCalls), observedResults: count(row.observedResults),
        correlationComplete: boolean(row.correlationComplete), omittedCallEvents: count(row.omittedCallEvents), unsettledCount: count(row.unsettledCount), unsettledKnownCount: count(row.unsettledKnownCount),
        unsettled: (calls ?? []).slice(0, 2).map(receipt), omittedSamples: calls === null || omitted === null ? null : omitted + Math.max(0, calls.length - 2), lastResult: receipt(row.lastResult) };
    }), omittedSessions: count(value.omittedSessions) === null ? null : value.omittedSessions + Math.max(0, value.sessions.length - 4) };
}

export function boundedObservation(method, value, request = {}) {
  const status = method === 'wait' ? value?.status : method === 'status' ? value : null;
  const result = method === 'wait' ? value?.result : method === 'result' ? value : null;
  const source = result ?? status;
  const observation = source?.observation;
  const text = result?.output ?? observation?.output;
  const outputSource = result?.outputSource ?? observation?.outputSource;
  const latestAssistant = result?.latestAssistant ?? observation?.latestAssistant;
  const members = list(source?.teamActivity?.members) ?? list(source?.team?.members);
  const inputs = list(result?.inputs ?? observation?.inputs), errors = list(result?.errors ?? observation?.errors);
  const pending = list(value?.interactions);
  const summary = {
    view: 'summary', method, byteBudget: SUMMARY_BYTES, budgetScope: 'tool-result-body-including-text-and-structured-content',
    teamId: id(value?.teamId ?? status?.sessionId ?? request.teamId), atomic: false, stateSource: result ? 'result' : status ? 'status' : null,
    state: { taskState: id(source?.taskState), runtimeState: id(source?.runtimeState), rootTurnState: id(source?.rootTurnState),
      rootTurnCompleted: boolean(source?.rootTurnCompleted), completed: boolean(method === 'status' ? status?.teamCompleted : result?.completed), goalAccepted: null, pendingTasks: integer(source?.teamActivity?.pendingTasks) },
    completionScope: method === 'status' ? 'native-team-only' : result?.execution ? 'native-team-and-observed-owned-jobs' : 'legacy-native-result',
    execution: execution(result?.execution),
    toolActivity: toolActivity(source?.toolActivity),
    sourceCuts: { status: cut(status), result: cut(result) }, turns: turns(result?.turns ?? (observation ? { latestStarted: { turn: observation.turn, startSeq: observation.turnStartSeq }, active: observation.open === true ? observation.turn : null, lastEnded: observation.lastEnd, lastCompleted: observation.lastCompletedTurn } : null)),
    output: { ...preview(text, 2048), source: outputSource ? { turn: integer(outputSource.turn), seq: integer(outputSource.seq), truncated: boolean(outputSource.truncated) } : null },
    latestAssistant: latestAssistant ? { turn: integer(latestAssistant.turn), seq: integer(latestAssistant.seq), hasText: boolean(latestAssistant.hasText) } : null,
    members: { returnedCount: members?.length ?? null, items: (members ?? []).slice(0, 8).map(member => ({ id: id(member?.id), name: id(member?.name), role: id(member?.role), phase: id(member?.phase), runtimeState: id(member?.runtimeState) })), omitted: members === null ? null : Math.max(0, members.length - 8) },
    retainedEntryCounts: { inputs: inputs?.length ?? null, errors: errors?.length ?? null },
    details: { endedTurnTextTool: 'dsh_team_turn_result', historicalCapabilityRequired: 'ended-turn-results', fullViewAvailable: true },
  };
  if (method === 'wait') {
    Object.assign(summary, { reason: id(value?.reason), baseline: id(value?.baseline), resynchronized: boolean(value?.resynchronized),
      pendingInteractions: { count: pending?.length ?? null, questionPayloadIncluded: false, exactDetailsTool: 'dsh_team_pending' } });
  }
  let resultBody = wrap(summary);
  if (size(resultBody) > SUMMARY_BYTES) {
    summary.reducedForBudget = true;
    summary.output = { ...summary.output, ...preview(text, 256) };
    summary.members.items = []; summary.members.omitted = members?.length ?? null;
    if (summary.toolActivity.available) {
      summary.toolActivity.omittedSessions = summary.toolActivity.omittedSessions === null ? null : summary.toolActivity.omittedSessions + summary.toolActivity.sessions.length;
      summary.toolActivity.sessions = [];
    }
    for (const [name, value] of Object.entries(summary.sourceCuts)) if (value) {
      const original = name === 'status' ? status : result;
      value.projections = []; value.omittedProjections = list(original?.freshness?.projections)?.length ?? null;
    }
    resultBody = wrap(summary);
  }
  if (size(resultBody) > SUMMARY_BYTES) throw Object.assign(new Error('Observation summary exceeds its fixed presentation budget; no full payload fallback was returned.'), { code: 'SUMMARY_LIMIT' });
  return resultBody;
}
