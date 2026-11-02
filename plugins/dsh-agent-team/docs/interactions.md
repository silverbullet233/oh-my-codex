# Lead interactions

Catalog v0.3.0 / plugin 0.4.0 adds native answer-mode interactions and bounded MCP waits. They are absent from the earlier v0.2.1 / plugin 0.3.2 tag. Node >=24.9.0, runtime/Team profile 0.2.2-alpha.2 and host 0.6.0 remain pinned. No global configuration or provider credentials are changed.

The path remains `User <-> Codex main <-> DSH Lead <-> members`. Main handles requirements, design, progress and read-only review; Lead owns implementation/testing/debugging and member instructions.

## Control loop

1. After create/send, call `dsh_team_wait` with the Lead/root `teamId` and `timeoutMs` (0–30000; default 10000). Pass its opaque `baseline` as `after` next time. This is a comparison token, not a native sequence cursor.
2. Inspect `reason`, `interactions`, native `status` and `result`. Reasons are `changed`, `interaction`, `completed`, `timeout` or `cancelled`. Pending input takes priority over completion of its originating turn. Lead idle alone never proves whole-Team completion; require native `result.completed === true`, expected artifacts and acceptance review.
3. Main answers ordinary Lead questions using `dsh_team_answer`, exact question IDs, offered labels and/or custom text, and `source: "main"`, within existing requirements and authority. Write free-text answers to Lead in English, including with `source: "user"`; preserve exact IDs, offered labels, code, paths and necessary original-language quotations. Initial briefs and follow-up instructions request English replies from Lead. For missing information, new decisions or expanded authority, call `dsh_team_escalate` with a reason, ask the user in normal conversation, then answer with `source: "user"`. Escalate sends no message itself. Plan reviews changing agreed scope require user input.
4. Refresh input with `dsh_team_pending`. Pass its `teamId`, `interactionId` and current `deliveryId` unchanged. Interaction tools require the same live MCP client; one-shot CLI invocations cannot carry delivery tokens between processes.

```json
{"teamId":"<Lead root>","interactionId":"<pending ID>","deliveryId":"<current delivery>","source":"main","answers":[{"id":"scope","selected":["existing"]}]}
```

## Approval boundary

`kind: "approval"` covers native approvals and permission-shaped question intents. The answer tool refuses both. Use `dsh_team_approval` to `deny`, or to `approve` with `authorization` quoting the user's explicit permission for that exact action. Never invent authorization, infer it from a task report, grant blanket permission or choose `always`. Missing authorization never grants access.

A rostered member's native owner approval is an authority event, not a member task instruction. Only that separate decision path is exposed; ordinary member questions and direct member messages remain unavailable. Native approval audit identity must be unique within the bounded history read; ambiguity or missing identity fails closed. DSH applies native policy.

## Lifetime and observation

The Host owns foreground requests. The client bounds pending input to 32 deliveries, 256 KiB total payload and 64 KiB per request, with local answer windows of at most five minutes. It honors native cancellation and timed-question deadlines, claims timed windows with native `userQuestions.attachWait`, and restores continued Lead questions from native projections.

Correlation uses native business IDs where available; custom questions without one receive fresh delivery IDs. Disconnect, cancellation and expiry invalidate tokens. Refresh pending/wait after reconnect and reconsider the current request; never automatically replay an affirmative answer. Identical live submitted retries return a receipt; conflicting/stale responses fail. Foreground receipts say `not-confirmed-by-native`: submission does not prove Host acceptance before cancellation or carrier failure. Continued replies report native admission, not processing. Inspect native status/result. The client persists neither pending payloads nor answers.

Wait consumes passive native `session.follow` and `observeState` streams for root/roster. It coalesces events, ignores token chunks, and wakes on queue changes because pending-input changes alone do not trigger `observeState`. Gaps and carrier losses replace stream baselines. It sends no `afterSeq` and does not poll unary `session.wait`. Limits are four waits and 32 distinct observed Sessions per wait, including replaced members. The observation deadline allows at most one additional second for a final authoritative read; initial owned-host startup has its existing separate bound. Stop/answers remain responsive. MCP `notifications/cancelled` cancels observation without stopping native work.

While Codex controls a Team, native Web observation/settings are supported. Sending Web messages or answering forwarded prompts/approvals there is unsupported concurrent interaction. No exclusive-client ownership or Web/Codex arbitration is implemented. Unexpected native settlement still cancels local deliveries and invalidates stale answers; user UI access remains unchanged.

## Historical ended-turn reads (development)

`dsh_team_turn_result` requires the additive host capability `ended-turn-results`, absent from the published host 0.6.0. The release pins remain unchanged; this development feature requires a future published compatible host. An unsupported host returns `CAPABILITY_MISMATCH`; do not substitute `dsh_team_result` and pretend it is historical data.

Request `{teamId, turn: 1}` for an ended managed Lead turn. Retain `resultRef`, then request `{teamId, resultRef, offset: page.nextOffset}` until `nextOffset` is null. Omit `turn` on reference reads. Default page text is 8192 UTF-8 bytes (range 4..32768); verify the combined text against `page.sha256`/`totalBytes`. References stay fixed while later turns run and across cold reconnects.

Join page text before parsing UTF-8 JSONL. Each line contains one assistant event's `seq`, `surfaceOp`, optional source sequence references and `text` array. Pages never split a Unicode scalar but can split JSON tokens. This is a committed text-event audit log, including replacement markers, **not** the canonical Web conversation or a final goal verdict. Tool-only messages can contain empty text arrays. Reasoning, tool payloads, artifacts and member Sessions are excluded. `outcome` records the native terminal reason; `coverage.goalAccepted` is unknown. Missing/open turns, changed or missing history, invalid offsets, migration requirements and bounded scan limits are explicit errors, never silently truncated or replaced with latest output. Existing exact-request policies remain restricted and do not automatically gain historical read authority.

## Bounded MCP observations (development)

This client addition is absent from published catalog 0.3.0/plugin 0.4.0. Use `view: "summary"` on MCP status/result/wait for routine observation. It is a local presentation option, stripped before the native request, and works with existing compatible hosts. Omission or `view: "full"` preserves legacy output. Native/CLI request schemas and existing exact read authority are unchanged.

Summary limits the serialized **tool result body** to 16384 UTF-8 bytes, counting both text and structuredContent representations; JSON-RPC framing/ID is outside this budget. It does not bound native I/O or prove where another client's truncation occurs. Text previews are scalar-safe with explicit truncation/well-formedness metadata. Member samples and per-source cuts carry omission counts; retained input/error counts do not claim complete lifetime history. Overlong identifiers become null, never partial machine IDs. Distinct wait status/result cuts remain separate and unknown authoritative completion is never replaced with an older status value. Goal acceptance remains unknown.

Wait summaries report pending interaction counts but omit question/option/token payloads. Read `dsh_team_pending` for exact current questions and delivery tokens before answering; summaries never authorize approval. Use historical result pages for complete ended-turn text only when the host advertises that capability. Full/other tool responses remain their existing contracts; a summary that cannot meet its budget errors without returning a full payload fallback.
