/**
 * @module run-contract-thread
 * @version 0.1.0
 * @description The thread half of the do-run router answers (Claude Projects,
 *   line C1). In a thread the router asks with a numbered `post_message` reply
 *   instead of an AskUserQuestion card, and the person's next message is the
 *   answer. This module reads that exchange off the transcript and returns it
 *   in the shape `routerFromTranscript` (run-contract-calls.js) returns, so
 *   `armFromPending` arms from it with source `router`, never `fallback`.
 *
 *   The posted question format (deep-knowledge/run-contract.md § In a thread):
 *     1. Was? — Was soll passieren?
 *        a) Prompt umsetzen (recommended)
 *        b) Audit
 *     2. Ablauf? — …
 *   The reply: "1a 2b", "1: a, 2: b", one answer per line, a letter (option),
 *   several letters ("c, d") or free text per number. Only the person's own
 *   message counts (origin `person`, lib/project-thread.js) — a coordinator
 *   note never answers the router.
 */

const THREAD = require('./project-thread');

const TEXT_KEYS = ['message', 'text', 'content', 'body'];

/** The text a hearthbot post_message call carries. */
function postedText(input) {
  if (!input || typeof input !== 'object') return '';
  for (const k of TEXT_KEYS) if (typeof input[k] === 'string') return input[k];
  return '';
}

/** Questions of a numbered post: [{ n, header, question, options:[{label}] }]. */
function parseQuestions(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const q = /^\s*(?:\*\*)?(\d+)[.)]\s+(.+?)\s*$/.exec(line);
    if (q) {
      const question = q[2].replace(/\*\*/g, '').trim();
      const dash = question.split(/\s+[—–-]\s+/)[0];
      cur = { n: Number(q[1]), header: dash.trim(), question, options: [] };
      out.push(cur);
      continue;
    }
    const o = cur && /^\s*(?:[-*]\s+)?\(?([a-z])[.)]\s+(.+?)\s*$/i.exec(line);
    if (o) cur.options.push({ label: o[2].replace(/\*\*/g, '').trim() });
  }
  return out;
}

/** The person's reply split by question number; a letter picks the option of that question. */
function parseReply(text, questions) {
  const answers = {};
  const body = String(text || '').trim();
  if (!body) return answers;
  const byNumber = new Map(questions.map((q) => [q.n, q]));
  const chunks = body.split(/(?:^|[\s,;]+)(?=\d+\s*[.):=-]?\s*[^\s\d])/).map((c) => c.trim()).filter(Boolean);
  let matched = false;
  for (const chunk of chunks) {
    const m = /^(\d+)\s*[.):=-]?\s*([\s\S]+)$/.exec(chunk);
    const q = m && byNumber.get(Number(m[1]));
    if (!q) continue;
    matched = true;
    const value = m[2].trim().replace(/[,;]+$/, '');
    // Letters only ("b", "a, c", "a+c"): the options of this question; a word ("ja") stays free text.
    const letters = /^[a-z](?:[\s,+&/]+[a-z])*$/i.test(value) ? value.toLowerCase().match(/[a-z]/g) : null;
    const picked = letters ? letters.map((l) => q.options[l.charCodeAt(0) - 97]) : [];
    const labels = picked.length && picked.every(Boolean) ? picked.map((o) => o.label) : [];
    answers[q.question] = labels.length ? labels.join(', ') : value;
  }
  if (!matched && questions.length === 1) answers[questions[0].question] = body;
  return answers;
}

function parseLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function promptWords(entry) {
  const c = entry.message && entry.message.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  if (c.some((b) => b && b.type === 'tool_result')) return null; // a tool result is no prompt
  return c.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
}

/**
 * The router exchange of a thread since `sinceIso`, in `routerFromTranscript`'s
 * shape, or null (no numbered router post with a person's reply after it).
 *
 * @param {string} transcriptPath
 * @param {string} sinceIso the do-run marker's time
 * @param {object} RC the run-contract facade (isRouterCall, isPartialRouterCall)
 * @returns {{questions: object[], answers: object, followUps: [], earlier: object[]}|null}
 */
function routerFromThreadTranscript(transcriptPath, sinceIso, RC) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
  const since = sinceIso ? Date.parse(sinceIso) - 5000 : NaN;
  let raw;
  try { raw = require('fs').readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const calls = [];
  let pending = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const e = parseLine(line);
    if (!e || e.isSidechain) continue;
    const t = Date.parse(e.timestamp);
    if (Number.isFinite(since) && Number.isFinite(t) && t < since) continue;
    if (e.type === 'assistant' && Array.isArray(e.message && e.message.content)) {
      for (const b of e.message.content) {
        if (!b || b.type !== 'tool_use' || b.name !== THREAD.POST_TOOL) continue;
        const questions = parseQuestions(postedText(b.input));
        if (RC.isRouterCall(questions)) pending = questions;
      }
    } else if (e.type === 'user' && e.isMeta !== true && pending) {
      const words = promptWords(e);
      if (words === null) continue;
      const view = THREAD.classifyPrompt(words);
      if (!THREAD.speaksForPerson(view.prompt_origin)) continue;
      calls.push({ questions: pending, answers: parseReply(view.prompt, pending) });
      pending = null;
    }
  }
  if (!calls.length) return null;
  // Newest call; a partial re-ask merges over the calls before it, back to a full one (like the card path).
  let start = calls.length - 1;
  while (start > 0 && RC.isPartialRouterCall(calls[start].questions)) start--;
  const chain = calls.slice(start);
  const newest = chain[chain.length - 1];
  return { questions: newest.questions, answers: newest.answers, followUps: [], earlier: chain.slice(0, -1) };
}

module.exports = { routerFromThreadTranscript, parseQuestions, parseReply, postedText };
