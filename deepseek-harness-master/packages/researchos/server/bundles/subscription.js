// Phase 3 research-subscription: ResearchOS subscription bundle running inside dsh.
//
// Purpose: serve the SAME contract the legacy backend SubscriptionController +
// SubscriptionServiceImpl expose, as a dsh bundle. Stripe is called via the
// REST API (fetch) instead of the stripe-java SDK.
//
// Routes (mounted on the dsh webserver, prefix /research-subscription):
//   GET  /research-subscription/plans               -> static plan list        (public)
//   POST /research-subscription/checkout { plan }   -> { url, sessionId }      (JWT)
//   POST /research-subscription/webhook             -> "ok" | "ignored"         (Stripe-Signature)
//
// Checkout (mirror SubscriptionServiceImpl.createCheckout):
//   - Stripe not configured (no RESEARCH_STRIPE_SECRET_KEY)  -> 500 "Stripe is not configured"
//   - plan not PRO/RESEARCHER                                -> 400 "Unsupported plan"
//   - price id not configured for the plan                   -> 500 "Stripe price is not configured"
//   - otherwise POST https://api.stripe.com/v1/checkout/sessions (subscription mode)
//
// Webhook (mirror handleWebhookEvent):
//   - verify Stripe-Signature (t=...,v1=... HMAC-SHA256 over `${t}.${payload}`)
//   - checkout.session.completed -> upgrade user plan from client_reference_id +
//     metadata.plan (only upgrade, never downgrade, rank FREE<PRO<RESEARCHER)
//   - customer.subscription.deleted -> consumed (no downgrade in MVP)
//   - unknown event type -> 200 "ignored"
//
// Response envelope mirrors backend ApiResponse: { code: 0, message, data }.
// Errors: { code: <http>, message } with the matching HTTP status.
//
// Config via env (injected by scripts/dsh-gateway.sh):
//   RESEARCH_STRIPE_SECRET_KEY      (fallback STRIPE_SECRET_KEY)
//   RESEARCH_STRIPE_WEBHOOK_SECRET  (fallback STRIPE_WEBHOOK_SECRET)
//   RESEARCH_STRIPE_PRICE_PRO / RESEARCH_STRIPE_PRICE_RESEARCHER
//   RESEARCH_FRONTEND_BASE_URL      (success/cancel redirect, default http://localhost:3000)
//   RESEARCH_MYSQL_HOST/PORT/USER/PASSWORD/DATABASE  (defaults researchos/researchos@127.0.0.1:3306/researchos)
//   JWT_SECRET        (shared with backend; fallback = backend yml default)
// @module @researchos/dsh-research-subscription

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'

export const name = 'research-subscription'

export const inject = ['webServer']

const DB = {
  host: process.env.RESEARCH_MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.RESEARCH_MYSQL_PORT || 3306),
  user: process.env.RESEARCH_MYSQL_USER || 'researchos',
  password: process.env.RESEARCH_MYSQL_PASSWORD || 'researchos',
  database: process.env.RESEARCH_MYSQL_DATABASE || 'researchos',
}

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dGhpcy1pcy1hLWRldi1zZWNyZXQta2V5LWRvLW5vdC11c2UtaW4tcHJvZHVjdGlvbi1lbnZpcm9ubWVudA=='

const STRIPE_KEY = process.env.RESEARCH_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || ''
const WEBHOOK_SECRET = process.env.RESEARCH_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || ''
const PRICE_PRO = process.env.RESEARCH_STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_PRO || ''
const PRICE_RESEARCHER = process.env.RESEARCH_STRIPE_PRICE_RESEARCHER || process.env.STRIPE_PRICE_RESEARCHER || ''
const FRONTEND_BASE = (process.env.RESEARCH_FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')

const PLAN_RANK = { FREE: 0, PRO: 1, RESEARCHER: 2 }
const PLANS = [
  { id: 'FREE', label: 'Free', limit: 10, desc: '10 papers / month' },
  { id: 'PRO', label: 'Pro', limit: 500, desc: '500 papers · Unlimited AI chat · Review generation' },
  { id: 'RESEARCHER', label: 'Researcher', limit: -1, desc: 'Unlimited · Advanced writing' },
]

// ── helpers ────────────────────────────────────────────────────────────────

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function ok(res, data) {
  sendJson(res, 200, { code: 0, message: 'ok', data })
}

function fail(res, status, message) {
  sendJson(res, status, { code: status, message, data: null })
}

function extractToken(req) {
  const cookieHeader = req.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === 'access_token' && v.length) return v.join('=').trim()
  }
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1].trim() : null
}

async function currentUserId(pool, req) {
  const token = extractToken(req)
  if (!token) return null
  let claims
  try {
    claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
  const [rows] = await pool.query('SELECT id FROM app_user WHERE id = ?', [claims.sub])
  if (!rows.length) return null
  return Number(rows[0].id)
}

/** Stripe webhook signature verification (mirror Webhook.constructEvent). */
function verifyStripeSignature(payload, signatureHeader) {
  const parts = {}
  for (const kv of String(signatureHeader || '').split(',')) {
    const [k, ...v] = kv.trim().split('=')
    if (k) parts[k] = v.join('=')
  }
  const ts = parts.t
  const expected = parts.v1
  if (!ts || !expected) return false
  const signed = `${ts}.${payload}`
  const digest = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signed).digest('hex')
  const a = Buffer.from(digest)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Upgrade plan only when the new rank is strictly higher (mirror upgradePlan). */
async function upgradePlan(pool, userId, plan) {
  const [rows] = await pool.query('SELECT plan FROM app_user WHERE id = ?', [userId])
  const current = rows[0]?.plan ?? 'FREE'
  const curRank = PLAN_RANK[current] ?? 0
  const newRank = PLAN_RANK[plan] ?? 0
  if (newRank > curRank) {
    await pool.query('UPDATE app_user SET plan = ? WHERE id = ?', [plan, userId])
    return true
  }
  return false
}

// ── plugin ─────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const pool = mysql.createPool(DB)
  ctx.logger.info(`[research-subscription] loaded — subscription, stripeConfigured=${Boolean(STRIPE_KEY)}`)

  ctx.webServer.register({
    kind: 'prefix',
    path: '/research-subscription',
    handler: async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
      const seg = (() => {
        const s = pathname.replace(/^\/research-subscription\/?/, '')
        return s ? s.split('/') : []
      })()
      const method = req.method

      // GET /plans — public.
      if (method === 'GET' && seg[0] === 'plans') return ok(res, PLANS)

      // POST /webhook — no JWT, signature-verified.
      if (method === 'POST' && seg[0] === 'webhook') {
        try {
          const payload = await readRaw(req)
          if (!verifyStripeSignature(payload, req.headers['stripe-signature'])) {
            return fail(res, 400, 'Invalid webhook signature')
          }
          let event
          try {
            event = JSON.parse(payload)
          } catch {
            return fail(res, 400, 'Invalid webhook payload')
          }
          const type = event?.type
          if (type === 'checkout.session.completed') {
            const obj = event?.data?.object || {}
            const clientRef = obj.client_reference_id
            const plan = obj.metadata?.plan
            if (clientRef == null || plan == null) {
              return sendJson(res, 200, { consumed: true, message: 'ok' })
            }
            await upgradePlan(pool, Number(clientRef), String(plan))
            ctx.logger.info(`[research-subscription] checkout completed: userId=${clientRef}, plan=${plan}`)
            return sendJson(res, 200, { consumed: true, message: 'ok' })
          }
          if (type === 'customer.subscription.deleted') {
            // MVP: no proactive downgrade (mirror backend).
            return sendJson(res, 200, { consumed: true, message: 'ok' })
          }
          return sendJson(res, 200, { consumed: false, message: 'ignored' })
        } catch (e) {
          ctx.logger.warn(`[research-subscription] webhook error: ${e.message}`)
          return fail(res, 500, `webhook failed: ${e.message}`)
        }
      }

      // POST /checkout — JWT.
      if (method === 'POST' && seg[0] === 'checkout') {
        const userId = await currentUserId(pool, req)
        if (userId === null) return fail(res, 401, 'unauthorized')
        let body
        try {
          body = JSON.parse(await readRaw(req))
        } catch {
          return fail(res, 400, 'invalid JSON body')
        }
        const plan = String(body.plan || '')
        if (!STRIPE_KEY) {
          return fail(res, 500, 'Stripe is not configured. Please contact the administrator')
        }
        if (!PLAN_RANK[plan] || plan === 'FREE') {
          return fail(res, 400, `Unsupported plan: ${plan}`)
        }
        const priceId = plan === 'RESEARCHER' ? PRICE_RESEARCHER : PRICE_PRO
        if (!priceId) {
          return fail(res, 500, `Stripe price is not configured for plan: ${plan}`)
        }
        const [users] = await pool.query('SELECT email FROM app_user WHERE id = ?', [userId])
        const email = users[0]?.email ?? ''
        try {
          const form = new URLSearchParams({
            mode: 'subscription',
            client_reference_id: String(userId),
            'metadata[plan]': plan,
            success_url: `${FRONTEND_BASE}/settings?upgrade=success`,
            cancel_url: `${FRONTEND_BASE}/settings?upgrade=cancelled`,
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': '1',
          })
          if (email) form.set('customer_email', email)
          const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${STRIPE_KEY}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: form,
            signal: AbortSignal.timeout(30000),
          })
          const j = await resp.json()
          if (!resp.ok || !j.url) {
            ctx.logger.warn(`[research-subscription] stripe error: ${j.error?.message ?? resp.status}`)
            return fail(res, 502, `Failed to create checkout session: ${j.error?.message ?? 'stripe error'}`)
          }
          return ok(res, { url: j.url, sessionId: j.id })
        } catch (e) {
          ctx.logger.warn(`[research-subscription] stripe call failed: ${e.message}`)
          return fail(res, 502, `Failed to create checkout session: ${e.message}`)
        }
      }

      return fail(res, 404, 'not found')
    },
  })

  ctx.on?.('dispose', () => {
    pool.end().catch(() => {})
  })
}

export default { name, inject, apply }
