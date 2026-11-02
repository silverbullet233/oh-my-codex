# Observation and communication (development)

Treat passive observation, messages to Lead and updates to the user as separate decisions. A wait timeout is a transport deadline, not evidence of failure or a communication cadence.

- Observe with `dsh_team_wait`, normally `wakeOn: "state", view: "summary"`. Reuse `after` with the same policy. Internal tool/assistant events alone need no Main intervention. Use activity mode or read-only details when diagnosing progress; state mode cannot prove meaningful work or detect a semantic stall by itself.
- Message the same Lead for a pending question, concrete review finding, scope/risk change or missed agreed checkpoint. Agree checkpoints in the task brief; investigate a missed one rather than repeatedly queueing status prompts. Preserve input IDs and inspect uncertain admission before a retry. Do not take over project execution or message members directly.
- Update the user for meaningful deliverables, blockers, decisions and final outcomes, and promptly answer direct status requests. Distinguish observed activity from verified progress; do not hide stalled/unknown work or wait indefinitely for a final result before reporting a blocker.

Pending questions/approvals and whole-Team completion retain priority under either wait policy. Fetch exact interaction details before answering; approval still needs explicit user authorization. Cancellation ends observation, not native work. Quiet observation does not authorize continuation, duplicate sends or permission escalation.

The 10s default and 30s maximum bound each observation (plus at most 1s final read). They do not create a model-free background monitor: each timeout can still return to the caller. Event coalescing, tool-result size, model wakeups, Lead-message count and user-update frequency are different measurements; do not claim cost savings or task success from fewer returns alone. This client option is unreleased; the installed published plugin must not be assumed to support it.
