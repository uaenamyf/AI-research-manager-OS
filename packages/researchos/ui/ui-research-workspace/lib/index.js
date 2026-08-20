// Phase 5 research workspace — node half: minimal Cordis plugin.
// v2 (DSH 0.1.0-rc.7 compat): the original design assumed DSH had an
// `activitybar` slot and a `sidebar.research` patch seam, neither of which
// exist in rc.7. The research-region UI (literature library, paper detail,
// action bar) is being rewritten against DSH's real sidebar.workspaces seat;
// until that rewrite lands, the node half stays empty so this loader entry
// can settle without bringing the whole boot down. The chat nodes
// (ui-research-{library,paper,citation}) still render research results
// inside the conversation stream.
export const name = 'ui-research-workspace'

export function apply() {}
