---
name: dsh-agent-team
description: Use only when the user explicitly asks to run work through DSH Agent Team or continue a native DSH team session.
---

Use the six dsh-agent-team MCP tools to interact with the shared native DSH host. Call health first. Require dsh-team-roles IPC protocol 1 and advertised native-role capabilities. Role editing lives in the native Settings → Team roles page; this client owns no role policy or native host. If the host is absent, report the launch requirement; do not start another writer against its store.

Create uses a durable caller key and native Session ID. Reuse the same key only for identical content. If a cold create retry returns `requiresContinuation: true`, retain its reserved Team and input IDs. Acceptance is `false` before initial admission and `null` for an unconfirmed prior admission; inspect status, then explicitly send with the returned input ID and `continue: true`. Send uses an input ID; retain it across uncertain responses and inspect status before resubmitting. Acceptance does not imply processing or completion. Recover an interrupted session only with an explicit continuation request.

Use native DSH Web for member sessions, tasks, messages, tools and approvals. Never approve on the user's behalf, select arbitrary provider endpoints or replace the native UI. Stop cancels execution; it does not undo file changes. Report configured, selected and last-request routes separately; unknown usage and fees remain unknown.

Inspect the host catalog before choosing a role. An empty catalog is supported: omit leadRole, let the Lead use the native main Agent model selection, and let native teammates inherit it. Do not invent roles, provider routes or reasoning settings. If explicit roles are configured, names must come from that allowlist; omitting leadRole uses the host's configured default. Managed members receive durable immutable role snapshots, and later catalog changes apply only to new members. Existing unmanaged native Teams stay unmanaged when roles are added. The integration accepts text input only; do not describe images or attachments as supported inputs.

DSH is opt-in. Do not change Codex's ordinary entrypoint, model or subscription configuration.
