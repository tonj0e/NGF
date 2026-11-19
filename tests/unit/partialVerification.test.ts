import assert from 'node:assert/strict'
import { PARTIAL_STATUS, PARTIAL_LOCKED_MSG, MAPS_LINK_RE, changedDetails, hasHomeLocation, partialMissing, agentVisitBlock, officeCompleteBlock, visitOtpBlock, parseVisitNotes, OTP_VISIT_FRESH_MS } from '../../lib/partialVerification.ts'

assert.equal(PARTIAL_STATUS, 'Partially Verified')

// Home location: the Locate button's "lat,lng", or a pasted Maps link
assert.equal(hasHomeLocation('9.931233,76.267304', ''), true)
assert.equal(hasHomeLocation('-9.9,-76.2', null), true)
assert.equal(hasHomeLocation('', 'https://maps.google.com/?q=9.93,76.26'), true)
assert.equal(hasHomeLocation('', 'https://maps.app.goo.gl/abc123'), true)
assert.equal(hasHomeLocation('', ''), false)
assert.equal(hasHomeLocation(undefined, undefined), false)
assert.equal(hasHomeLocation('near the temple', 'not a link'), false)
assert.equal(hasHomeLocation('   ', '   '), false)

// Partial submit needs all three: house photo, landmark photo, home location
assert.deepEqual(partialMissing({ housePhoto: true, landmarkPhoto: true, gpsCoordinates: '9.9,76.2' }), [])
assert.deepEqual(partialMissing({ housePhoto: true, landmarkPhoto: true, mapsLink: 'https://maps.google.com/?q=1,2' }), [])
assert.equal(partialMissing({ housePhoto: false, landmarkPhoto: true, gpsCoordinates: '9.9,76.2' })[0], 'house photo')
assert.equal(partialMissing({ housePhoto: true, landmarkPhoto: false, gpsCoordinates: '9.9,76.2' })[0], 'landmark photo')
assert.match(partialMissing({ housePhoto: true, landmarkPhoto: true })[0], /^home location/)
assert.equal(partialMissing({ housePhoto: false, landmarkPhoto: false }).length, 3)

// Agent: only the assigned agent, only in Agent Assigned (same rule as the full submit)
assert.equal(agentVisitBlock({ status: 'Agent Assigned', assignedAgentId: 'AG1', myAgentId: 'AG1' }), null)
assert.deepEqual(agentVisitBlock({ status: 'Agent Assigned', assignedAgentId: 'AG1', myAgentId: 'AG2' }), { error: 'No permission', status: 403 })
assert.deepEqual(agentVisitBlock({ status: 'Agent Assigned', assignedAgentId: 'AG1', myAgentId: undefined }), { error: 'No permission', status: 403 })
assert.equal(agentVisitBlock({ status: 'Partially Verified', assignedAgentId: 'AG1', myAgentId: 'AG1' })?.status, 400)   // no second visit submit
assert.equal(agentVisitBlock({ status: 'Verification Submitted', assignedAgentId: 'AG1', myAgentId: 'AG1' })?.status, 400)
assert.equal(agentVisitBlock({ status: 'Pending', assignedAgentId: 'AG1', myAgentId: 'AG1' })?.status, 400)

// Office completion: only a partially verified new-customer lead
assert.equal(officeCompleteBlock({ status: 'Partially Verified', loanProduct: '10K10W' }), null)
assert.notEqual(officeCompleteBlock({ status: 'Agent Assigned', loanProduct: '10K10W' }), null)
assert.notEqual(officeCompleteBlock({ status: 'Verification Submitted', loanProduct: '10K10W' }), null)
assert.notEqual(officeCompleteBlock({ status: 'Partially Verified', loanProduct: 'RENEWAL' }), null)

// Customer OTP rule (agent's full submit and office completion): verified < 12 h for the same number, or an override reason
const now = Date.parse('2026-11-20T10:00:00Z')
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
assert.equal(visitOtpBlock({ otpVerifiedAt: iso(60_000), otpPhone: '9876543210', phone: '9876543210', now }), null)
assert.match(visitOtpBlock({ otpVerifiedAt: iso(60_000), otpPhone: '9876543210', phone: '9123456789', now }) || '', /phone number was changed/)
assert.match(visitOtpBlock({ otpVerifiedAt: iso(60_000), otpPhone: '9876543210', phone: null, now }) || '', /phone number was changed/)
assert.match(visitOtpBlock({ otpVerifiedAt: iso(OTP_VISIT_FRESH_MS + 1), otpPhone: '9876543210', phone: '9876543210', now }) || '', /OTP is required/)   // too old
assert.equal(visitOtpBlock({ otpVerifiedAt: iso(OTP_VISIT_FRESH_MS + 1), overrideReason: 'customer has no phone signal', phone: '9876543210', now }), null)
assert.equal(visitOtpBlock({ overrideReason: 'customer has no phone signal', phone: null, now }), null)
assert.match(visitOtpBlock({ phone: '9876543210', now }) || '', /OTP is required/)

// The agent's saved notes
assert.deepEqual(parseVisitNotes(JSON.stringify({ riskNotes: 'gate locked', gpsCoordinates: '9.9,76.2', mapsLink: 'https://maps.google.com/?q=9.9,76.2' })),
  { riskNotes: 'gate locked', gpsCoordinates: '9.9,76.2', mapsLink: 'https://maps.google.com/?q=9.9,76.2', agentChanged: [] })
assert.deepEqual(parseVisitNotes(JSON.stringify({ riskNotes: '', agentChanged: ['phone', 'bank'] })).agentChanged, ['phone', 'bank'])
assert.deepEqual(parseVisitNotes(''), { riskNotes: '', gpsCoordinates: '', mapsLink: '', agentChanged: [] })
assert.deepEqual(parseVisitNotes('old plain note'), { riskNotes: 'old plain note', gpsCoordinates: '', mapsLink: '', agentChanged: [] })

// Maps links: only http(s) (no javascript: / data: links shown to the office)
assert.equal(MAPS_LINK_RE.test('https://maps.google.com/?q=1,2'), true)
assert.equal(MAPS_LINK_RE.test('javascript:alert(1)'), false)
assert.equal(MAPS_LINK_RE.test('data:text/html,hi'), false)
assert.equal(hasHomeLocation('', 'javascript:alert(1)'), false)

// What the agent changed during a partial visit (shown to the office)
const stored = { phone: '9876543210', account: '123456789', ifsc: 'SBIN0001234', holder: 'ANU' }
assert.deepEqual(changedDetails({ phone: '', account: '', ifsc: '', holder: '' }, stored), [])
assert.deepEqual(changedDetails({ phone: '9876543210', account: '123456789', ifsc: 'SBIN0001234', holder: 'ANU' }, stored), [])
assert.deepEqual(changedDetails({ phone: '9123456789' }, stored), ['phone'])
assert.deepEqual(changedDetails({ account: '999' }, stored), ['bank'])
assert.deepEqual(changedDetails({ phone: '9123456789', holder: 'ANU K' }, stored), ['phone', 'bank'])
assert.deepEqual(changedDetails({ account: '123' }, { phone: null }), ['bank'])   // nothing stored before: typed counts as a change

assert.match(PARTIAL_LOCKED_MSG, /complete the verification in the office/)

console.log('ok')
