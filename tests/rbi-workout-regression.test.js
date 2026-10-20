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
test('insolvency records pre-mutation net worth in a real handler run', () => {
  const fn = extract('function handleRbiWorkoutDeclareInsolvency() {', 'function finalizeRbiAuditReport()');
  const context = {
    gameState: {
      players: [{ id: 0, name: 'Player', cash: 100, bankrupt: false, rbiHearingPending: false }],
      ownership: { 1: { ownerId: 0, houses: 0, mortgaged: false } },
      rbiAuditContext: { currentHumanWorkoutPlayerId: 0, licenseFee: 5000, eliminatedByDefaultNames: [], reportRows: [], liquidatedByPlayer: {}, queueIdx: 0 }
    },
    BOARD_SPACES: { 1: { name: 'Owned City', price: 1500, type: 'city', houseCost: 200 } },
    getNetWorthBreakdown(id) {
      const p = this.gameState.players[id];
      const propertyValue = Object.keys(this.gameState.ownership).reduce((sum, key) =>
        this.gameState.ownership[key].ownerId === id ? sum + this.BOARD_SPACES[key].price : sum, 0);
      return { total: p.cash + propertyValue };
    },
    getPlayerRecoveryPotential: () => ({ structureRefund: 0, mortgagePotential: 0, rescuePotential: 0, maxPossibleCash: 100 }),
    setToast() {}, updateRbiWorkoutModalUI() {}, recordLedgerEntry() {}, formatRupee: value => String(value),
    sfxJail() {}, addLog() {}, processNextRbiAuditPlayer() {},
    document: { getElementById: () => ({ classList: { add() {}, remove() {} } }) }
  };
  vm.createContext(context);
  vm.runInContext(fn + '; this.runInsolvency = handleRbiWorkoutDeclareInsolvency;', context);
  context.runInsolvency();
  assert.equal(context.gameState.rbiAuditContext.reportRows[0].nwBefore, 1600);
  assert.equal(context.gameState.players[0].bankrupt, true);
  assert.equal(context.gameState.players[0].cash, 0);
  assert.equal(Object.keys(context.gameState.ownership).length, 0);
});
test('structure refund preview normalizes history like actual sale', () => {
  const modal = extract('function renderRbiWorkoutModalContent(', 'function updateRbiWorkoutModalUI()');
  assert.match(modal, /pr\.buildCosts\.slice\(0, houseCount\)/);
});
test('Market Prediction remains removed', () => {
  assert.doesNotMatch(html, /Market Prediction|market prediction|MarketPrediction/);
});
