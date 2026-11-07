import { StringDecoder } from 'node:string_decoder';
import { writePrivate } from './files.mjs';

export const DIAGNOSTIC_LIMIT = 65536;
export const diagnosticPath = (directory, instanceId) => `${directory}/diagnostics-${instanceId}.json`;

/** Coalesce writes of an already redacted tail; neither disk nor queued snapshots grow with output. */
export function diagnosticLog(path, instanceId) {
  let text = '', dirty = false, writing, failure;
  const payload = () => ({ version: 1, instanceId, text });
  const schedule = () => {
    if (writing) return;
    writing = (async () => {
      while (dirty) {
        dirty = false;
        try { await writePrivate(path, payload()); failure = undefined; }
        catch (error) { failure = error; }
      }
    })().finally(() => { writing = undefined; if (dirty) schedule(); });
  };
  return {
    append(line) {
      text += line;
      while (Buffer.byteLength(JSON.stringify(payload())) > DIAGNOSTIC_LIMIT) {
        const end = text.indexOf('\n');
        text = end < 0 ? '[oversized diagnostic entry omitted]\n' : text.slice(end + 1);
      }
      dirty = true; schedule();
    },
    async flush() { while (writing) await writing; if (failure) throw failure; },
  };
}

/** stdout and stderr are separate byte streams; only complete native lines can carry readiness. */
export function captureNativeOutput(onLaunch, onDiagnostic, onIdentity) {
  const streams = new Map();
  let secret;
  const redact = line => {
    let text = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
    text = text.replace(/https?:\/\/[^\s<>"']+/g, value => {
      try { const url = new URL(value); return url.origin + url.pathname + (url.search || url.hash ? ' [query redacted]' : ''); }
      catch { return '[URL redacted]'; }
    });
    text = text.replace(/\b(?:token|cookie|authorization|api[-_]?key|secret|password)["']?\s*[:=].*/gi, '[credential field redacted]');
    if (secret) { text = text.replaceAll(secret, '[launch capability redacted]').replaceAll(encodeURIComponent(secret), '[launch capability redacted]'); }
    return text;
  };
  const line = (name, value, complete = true) => {
    if (complete && onIdentity?.(name, value)) return;
    if (complete && !secret) for (const match of value.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/http:\/\/127\.0\.0\.1:\d+[^\s<>"']*/g)) {
      try {
        const url = new URL(match[0]);
        const token = url.searchParams.get('token');
        if (token && onLaunch(url.href)) { secret = token; break; }
      } catch {}
    }
    onDiagnostic(`[${name}] ${redact(value)}\n`);
  };
  return {
    push(name, chunk) {
      let state = streams.get(name);
      if (!state) { state = { decoder: new StringDecoder('utf8'), partial: '', omitted: false }; streams.set(name, state); }
      const pieces = state.decoder.write(chunk).split('\n');
      for (let index = 0; index < pieces.length; index++) {
        state.partial += pieces[index];
        if (Buffer.byteLength(state.partial) > 8192) { state.partial = ''; state.omitted = true; }
        if (index < pieces.length - 1) {
          line(name, state.omitted ? '[oversized native line omitted]' : state.partial, !state.omitted);
          state.partial = ''; state.omitted = false;
        }
      }
    },
    end(name) {
      const state = streams.get(name); if (!state) return;
      state.partial += state.decoder.end();
      if (state.omitted) line(name, '[oversized native line omitted]', false);
      else if (state.partial) line(name, state.partial, false);
      streams.delete(name);
    },
  };
}
