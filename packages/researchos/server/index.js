// @researchos/dsh-researchos-server
//
// Consolidated ResearchOS server bundle: formerly-separate out-of-tree
// dsh plugin bundles (research-auth, research-project, research-folder,
// research-paper, research-file, research-writing, research-review,
// research-paper-card, research-export, research-settings) merged into a
// single Cordis plugin that mounts all the original HTTP routes under their
// original /research-* prefixes. (research-subscription 已于 2026-08-20
// 随登录/订阅功能移除。)
//
// Each sub-bundle lives in its own ES module under bundles/ (auth.js,
// project.js, ...). The top-level apply() here just dispatches to them in
// dependency order — auth must come first so JWT verification is registered
// for downstream bundles that re-use requireUser(). Keeping each sub-bundle
// as a separate module preserves the original isolation (each file has its
// own DB / JWT_SECRET / ok / fail helpers without collision) and makes the
// diff vs. the original out-of-tree plugins purely additive.
//
// Routes: every URL prefix from the original bundles is preserved 1:1,
// so the DSH GUI client (researchos-ui) keeps working without any change.
//
// @module @researchos/dsh-researchos-server

import { apply as applyAuth } from './bundles/auth.js'
import { apply as applyProject } from './bundles/project.js'
import { apply as applyFolder } from './bundles/folder.js'
import { apply as applyPaper } from './bundles/paper.js'
import { apply as applyFile } from './bundles/file.js'
import { apply as applyWriting } from './bundles/writing.js'
import { apply as applyReview } from './bundles/review.js'
import { apply as applyPaperCard } from './bundles/paper-card.js'
import { apply as applyExport } from './bundles/export.js'
import { apply as applySettings } from './bundles/settings.js'
import { apply as applyWorkspace } from './bundles/workspace.js'

export const name = 'researchos-server'

export const inject = ['webServer']

export function apply(ctx) {
  applyAuth(ctx)
  applyProject(ctx)
  applyFolder(ctx)
  applyPaper(ctx)
  applyFile(ctx)
  applyWriting(ctx)
  applyReview(ctx)
  applyPaperCard(ctx)
  applyExport(ctx)
  applySettings(ctx)
  applyWorkspace(ctx)
}

export default { name, inject, apply }
