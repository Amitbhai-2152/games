// RBI workout regression tests. Run: node tests/rbi-workout-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');
function extract(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, 'missing: ' + startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'missing end marker: ' + endMarker);
  return html.slice(start, end).trim();
}
function test(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (err) { console.error('FAIL ' + name + ': ' + err.message); process.exitCode = 1; }
}
test('new game resets RBI context and warning', () => {
  const init = extract('function initGameFromConfig() {', 'function ');
  assert.match(init, /gameState\.rbiAuditContext = null;/);
  assert.match(init, /gameState\.lastAuditWarningRound = 0;/);
});
test('recovery calculation normalizes structure cost history', () => {
  const fn = extract('function getPlayerRecoveryPotential(player) {', 'function startFairRbiAudit(');
  const c = { gameState: { ownership: {
    1: { ownerId: 7, houses: 2, buildCosts: [0, 200, 999], mortgaged: false },
    2: { ownerId: 7, houses: 0, buildCosts: [], mortgaged: true },
    3: { ownerId: 7, houses: 0, buildCosts: [], mortgaged: false }
  } }, BOARD_SPACES: {
    1: { type: 'city', price: 1000, houseCost: 200 },
    2: { type: 'railroad', price: 600 },
    3: { type: 'utility', price: 400 }
  } };
  vm.createContext(c);
  vm.runInContext(fn + '; this.recovery = getPlayerRecoveryPotential;', c);
  const r = c.recovery({ id: 7, cash: 100, rescueUsed: false });
  assert.equal(r.structureRefund, 100);
  assert.equal(r.mortgagePotential, 700);
  assert.equal(r.maxPossibleCash, 2900);
});
test('insolvency records net worth before asset/cash mutation', () => {
  const fn = extract('function handleRbiWorkoutDeclareInsolvency() {', 'function finalizeRbiAuditReport()');
  assert.match(fn, /const nwBefore = getNetWorthBreakdown\(p\.id\)\.total;/);
  assert.match(fn, /nwBefore,/);
  assert.doesNotMatch(fn, /nwBefore: getNetWorthBreakdown\(p\.id\)\.total/);
});
test('structure refund preview normalizes history like actual sale', () => {
  const modal = extract('function renderRbiWorkoutModalContent(', 'function updateRbiWorkoutModalUI()');
  assert.match(modal, /pr\.buildCosts\.slice\(0, houseCount\)/);
});
test('Market Prediction remains removed', () => {
  assert.doesNotMatch(html, /Market Prediction|market prediction|MarketPrediction/);
});
