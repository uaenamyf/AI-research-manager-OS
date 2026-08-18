// Phase 5 research workspace — node half: minimal Cordis plugin so the package
// becomes a loader entry (its browser half is scanned into __DSH_BOOT__ by
// dsh-client-modules because of the dsh.client manifest). The browser half
// registers the sidebar.research hole (patched ui-sidebar section).
export const name = 'ui-research-workspace'

export function apply() {}
