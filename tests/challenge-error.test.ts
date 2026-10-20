import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UpstreamChallengeError, isChallengeBody, isChallengeHeaders } from '../src/actions/twitter/search'

// Incident 2026-10-20: X challenged the headless session with a Cloudflare
// Turnstile page (/account/access). The SearchTimeline XHR then returned the
// challenge HTML instead of JSON, and /search answered a bare 500. The
// customer-contract invariant: a challenge must be reported as a distinct,
// actionable error (503 upstream_challenge), not a generic 500.

test('isChallengeBody detects Cloudflare challenge HTML', () => {
  const challengePage = '<html><head><title>Just a moment...</title><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></head><body>Performing security verification</body></html>'
  assert.equal(isChallengeBody(challengePage), true)
})

test('isChallengeBody detects cf-chl marked responses', () => {
  // Cloudflare-issued 4xx bodies often carry only the cf-chl marker.
  assert.equal(isChallengeBody('<html><body>error code: 1020, cf-chl-bypass: 1</body></html>'), true)
})

test('isChallengeBody ignores ordinary JSON and error pages', () => {
  assert.equal(isChallengeBody(JSON.stringify({ data: { search_by_raw_query: {} } })), false)
  assert.equal(isChallengeBody('<html><body>Something went wrong, but not a challenge</body></html>'), false)
  assert.equal(isChallengeBody(''), false)
})

test('isChallengeHeaders detects the documented cf-mitigated contract', () => {
  // https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/
  assert.equal(isChallengeHeaders({ 'cf-mitigated': 'challenge' }), true)
  // Header names arrive with varying case from CDP; lookup must be tolerant.
  assert.equal(isChallengeHeaders({ 'CF-Mitigated': 'challenge' }), true)
  // Corroborating but non-proving signals must not classify on their own.
  assert.equal(isChallengeHeaders({ 'cf-ray': 'a4d239313fafd4b4-HKG', 'server': 'cloudflare' }), false)
  assert.equal(isChallengeHeaders({ 'content-type': 'text/html' }), false)
  assert.equal(isChallengeHeaders({}), false)
  // A completed or absent mitigation is not an active challenge.
  assert.equal(isChallengeHeaders({ 'cf-mitigated': 'none' }), false)
})

test('UpstreamChallengeError is a distinct, exported error type', () => {
  const err = new UpstreamChallengeError()
  assert.ok(err instanceof Error)
  assert.equal(err.name, 'UpstreamChallengeError')
  assert.match(err.message, /challenge|verification/i)
  // Route layer distinguishes by class identity, so name/message alone
  // must not be the contract.
  assert.notEqual(err.constructor, Error)
})
