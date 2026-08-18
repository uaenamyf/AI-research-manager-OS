// Phase 0 pluggability proof: a minimal Cordis plugin.
// Loaded via the bundle patch row (see cordis.patch.yml). Registers an HTTP
// route on ctx.webServer as an observable side effect, plus a trivial service.
// @module @researchos/dsh-research-hello

/** Stable Cordis plugin name. */
export const name = 'research-hello'

/** Cordis services this plugin needs: the web server (to mount /research-hello/ping). */
export const inject = ['webServer']

/**
 * Plugin entry: called when the profile mounts this row.
 * curl http://127.0.0.1:<port>/research-hello/ping -> {"ok":true,...}
 */
export function apply(ctx) {
  ctx.logger.info('[research-hello] loaded — ResearchOS bundle is mounted')

  ctx.provide('researchHello', {
    hello: () => 'hello from research-hello',
  })

  // Observable proof of load: an exact-path HTTP route on the dsh webserver.
  ctx.webServer.register({
    kind: 'exact',
    path: '/research-hello/ping',
    handler: (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'research-hello' }))
    },
  })
}

export default { name, inject, apply }
