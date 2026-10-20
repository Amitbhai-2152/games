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
test('AI liquidation continues beyond 60 structure sales when needed', () => {
  const fn = extract('function executeSmartAILiquidation(aiPlayer, targetAmount) {', 'function getPlayerRecoveryPotential(');
  const c = { gameState: { ownership: {} }, BOARD_SPACES: {}, canSellEvenlyOnSpace(playerId, id) { const p = gameState.ownership[id]; return { allowed: !!p && p.ownerId === playerId && p.houses > 0 }; },
    popStructureCost(prop) { if (Array.isArray(prop.buildCosts)) prop.buildCosts.pop(); return 0; },
    canMortgageSpace() { return false; }, hasGroupMonopoly() { return false; },
    recordLedgerEntry() {}, addLog() {} };
  for (let id = 1; id <= 65; id++) {
    c.gameState.ownership[id] = { ownerId: 7, houses: 1, buildCosts: [0], mortgaged: false };
    c.BOARD_SPACES[id] = { type: 'city', price: id, houseCost: 0, name: 'Test ' + id, group: 'g' + id };
  }
  vm.createContext(c);
  vm.runInContext(fn + '; this.liquidate = executeSmartAILiquidation;', c);
  const player = { id: 7, cash: 0, rescueUsed: false, rescueLoanBalance: 0 };
  c.liquidate(player, 2500);
  assert.equal(Object.values(c.gameState.ownership).filter(p => p.houses > 0).length, 0);
  assert.equal(player.cash, 2000);
});
test('audit dashboard discloses hearing surcharge per eligible player', () => {
  const fn = extract('function renderRbiEliminationTracker() {', 'function ');
  assert.match(fn, /\+₹500 यदि सुनवाई लंबित/);
  assert.doesNotMatch(fn, /gameState\.currentPlayerIndex/);
});
test('actual structure-sale helper safely handles corrupted and zero-cost history', () => {
  const fn = extract('function popStructureCost(prop, space) {', 'function handleBuyProperty() {');
  const c = { ensureBuildCostHistory(prop) { return prop.buildCosts; } };
  vm.createContext(c);
  vm.runInContext(fn + '; this.popCost = popStructureCost;', c);
  assert.equal(c.popCost({ buildCosts: [NaN] }, { houseCost: 200 }), 200);
  assert.equal(c.popCost({ buildCosts: [0] }, { houseCost: 200 }), 0);
});
test('all inline JavaScript parses without syntax errors', () => {
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let checked = 0;
  for (const block of blocks) {
    const type = (block[1].match(/\btype=["']([^"']+)["']/i) || [])[1];
    if (type && !/javascript|ecmascript|module/i.test(type)) continue;
    if (block[2].trim()) { new vm.Script(block[2]); checked++; }
  }
  assert.ok(checked > 0, 'expected at least one inline JavaScript block');
});
test('Market Prediction remains removed', () => {
  assert.doesNotMatch(html, /Market Prediction|market prediction|MarketPrediction/);
});
