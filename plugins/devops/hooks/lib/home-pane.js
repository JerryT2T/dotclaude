/**
 * @module home-pane
 * @description What marks a session start as a press in the devops Home pane
 *   (hooks/mods/home.tsx startSession). A button press is the person starting a
 *   session themselves: it never blocks a turn on an answer (pre.ask.title) and
 *   is never a plugin fix Claude routes without an issue (pre.plugin.session).
 *   Soft guards only — the model could write the same background, which costs
 *   no more than a refusal it could already pass by retrying.
 */

/** Opening of the `background` every Home pane start carries. */
const HOME_PANE_BACKGROUND = 'Started from the devops Home pane';

/** True when a start_session input comes from a Home pane button. */
function isHomePaneStart(input) {
  return !!input && typeof input.background === 'string' && input.background.startsWith(HOME_PANE_BACKGROUND);
}

module.exports = { HOME_PANE_BACKGROUND, isHomePaneStart };
