/**
 * @module ship/lib/tag-handoff
 * @description When the session cannot push the ring tag, the owner can (#566).
 *
 *   A tag push that the remote refuses for permission reasons (a token without
 *   tag rights, a protected tag rule, a cloud session with a read-only remote)
 *   fails the same way on every retry — retrying only burns the wait. And a
 *   missing `alpha/vX.Y.Z` is not cosmetic: promotion and tag-triggered
 *   workflows read it. So the failure path classifies the error and hands the
 *   owner the exact commands that create the tag the pipeline would have
 *   created — annotated, on the merge commit, verified on the remote.
 */

/** Git / GitHub messages that no retry changes. */
const PERMANENT_PATTERNS = [
  /\b403\b/,
  /permission (?:to \S+ )?denied/i,
  /\bGH0(?:06|13)\b/, // protected branch / repository rule violations
  /protected (?:tag|ref|branch)/i,
  /refusing to allow/i,
  /not allowed to (?:push|create|update)/i,
  /pre-receive hook declined/i,
  /write access to repository not granted/i,
  /authentication failed/i,
  /only (?:branch(?:es)?|branch pushes) (?:can|may|are)/i,
  /(?:tags?|refs\/tags\/\S*) (?:is|are) not (?:allowed|supported|permitted)/i,
  /write access to this github api path is not permitted/i, // the cloud session's GitHub proxy (#1202)
];

// The claude.ai cloud GitHub proxy takes branch pushes only: a tag push (and a
// branch deletion) is rejected there, the same way on every attempt. These are
// worded loosely ("proxy ... refused"), so a transient network error that names
// the proxy (`proxyconnect tcp: ... connection refused`) must not match them.
const PROXY_PATTERNS = [
  /proxy.*(?:reject|refus|den(?:y|ied)|not allowed|blocked)/i,
  /(?:reject|refus|den(?:y|ied)|block)\w*.*\b(?:tag|tags)\b.*\bproxy\b/i,
];
const TRANSIENT_NETWORK = /proxyconnect|connection (?:refused|reset|timed out)|could not resolve/i;

/** A claude.ai cloud session: its GitHub proxy refuses every tag write (environment policy, #1202). */
export function isCloudSession(env = process.env) {
  return env.CLAUDE_CODE_REMOTE === "true";
}

/** True when the push error is one a retry cannot fix. */
export function isPermanentPushError(err, env = process.env) {
  const text = String((err && (err.stderr || err.message)) || err || "");
  if (PERMANENT_PATTERNS.some((re) => re.test(text))) return true;
  if (!TRANSIENT_NETWORK.test(text) && PROXY_PATTERNS.some((re) => re.test(text))) return true;
  // In a cloud session a tag push ends with "unexpected disconnect": the proxy, not the network.
  return isCloudSession(env) && /unexpected disconnect|the remote end hung up/i.test(text);
}

/**
 * The copy-ready block that creates `channelTag` by hand. `sha` is the merge
 * commit; without it the owner resolves it from `origin/<base>` after the
 * fetch, which is the commit the pipeline would have tagged.
 *
 * @param {{ channelTag: string, channel: string, version: string, sha?: string|null, base: string, permanent: boolean, error?: string }} p
 */
export function tagHandoff({ channelTag, channel, version, sha, base, permanent, error, cloud }, env = process.env) {
  const inCloud = cloud === undefined ? isCloudSession(env) : !!cloud;
  const target = sha || `origin/${base}`;
  const message = JSON.stringify({ channel, version });
  const quoted = `'${message.replace(/'/g, "'\\''")}'`;
  return {
    tag: channelTag,
    target,
    // A cloud session never pushes a tag (the GitHub proxy takes branches only): the
    // owner runs the commands in a clone on their own computer.
    ...(inCloud && { runWhere: "in a local clone of the repository (Desktop app or terminal) — a cloud session cannot push tags" }),
    permanent: !!permanent,
    reason: permanent && inCloud
      ? "Cloud sessions cannot push tags: the session's GitHub proxy refuses every tag write (environment policy). Set it once on your PC."
      : permanent
        ? "The remote refused the tag push for this session (permission) — no retry changes that."
        : "The tag push kept failing after its retries.",
    error: error ? String(error).slice(0, 200) : undefined,
    commands: [
      `git fetch origin ${base}`,
      `git tag -a ${channelTag} ${target} -m ${quoted}`,
      `git push origin ${channelTag}`,
      `git ls-remote --tags origin ${channelTag}`,
    ],
    gates: `${channelTag} is what promotion (ship_promote) and tag-triggered workflows read — until it exists, v${version} is on ${base} but on no channel.`,
    note: "Done only when ls-remote lists the tag — \"Everything up-to-date\" proves nothing. Do not use GitHub's web release form: it creates a lightweight tag, the ring model needs an annotated one.",
  };
}
