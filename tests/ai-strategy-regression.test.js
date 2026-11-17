// Strategic AI regression suite.
// Run: node tests/ai-strategy-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');

function extractFunction(name) {
    const marker = '        function ' + name + '(';
    const start = html.indexOf(marker);
    assert.notEqual(start, -1, 'missing AI function: ' + name);
    const rest = html.slice(start);
    const next = rest.slice(1).search(/\n        function [A-Za-z_$][\w$]*\s*\(/);
    return rest.slice(0, next < 0 ? rest.length : next + 1).trim();
}

const AI_FUNCTIONS = [
    'getAIActiveOpponents',
    'getAIPlayerLandingProbability',
    'getAIExpectedVisitsForSpace',
    'getAIPropertyRent',
    'getAIGroupContext',
    'getAIPropertyValuation',
    'getAITradePropertyValue',
    'getAITradeOfferAssessment',
    'getAIReserveCash',
    'getAIPurchaseDecision',
    'getAISealedAuctionBid',
    'getAIBestVandeBharatTarget',
    'getAIImmediateRentThreat',
    'shouldAIPayBail',
    'getAIBestBuildOption',
    'getAIBestMortgageRedemption',
    'getAIBestTrapOpportunity',
    'getAIStrategicPowerPlan',
    'getAIStructureSalePriority',
    'getAIMortgageLiquidationPriority'
];

function makeBoard() {
    const board = Array.from({ length: 40 }, (_, id) => ({
        id, name: 'Space ' + id, type: 'corner', price: 0
    }));
    const city = (id, name, group, price, rents, houseCost = 100) => {
        board[id] = { id, name, type: 'city', group, price, rents, houseCost };
    };
    city(1, 'Patna', 'red', 1000, [100, 300, 900, 1800, 3000]);
    city(3, 'Ranchi', 'red', 1200, [120, 350, 1000, 2000, 3200]);
    city(5, 'Gaya', 'blue', 1600, [140, 420, 1100, 2200, 3500]);
    city(7, 'Delhi', 'blue', 2200, [200, 600, 1500, 2800, 4200]);
    city(9, 'Jaipur', 'green', 2600, [240, 700, 1700, 3100, 4600]);
    board[11] = { id: 11, name: 'Railway', type: 'utility', price: 1000 };
    return board;
}

function basePlayers(options = {}) {
    return options.players || [
        { id: 0, name: 'AI', isAI: true, cash: 10000, position: 20, bankrupt: false, inJail: false, jailTurns: 0, powerCards: [] },
        { id: 1, name: 'Rival One', isAI: false, cash: 7000, position: 35, bankrupt: false, inJail: false, jailTurns: 0, powerCards: [] },
        { id: 2, name: 'Rival Two', isAI: false, cash: 6500, position: 35, bankrupt: false, inJail: false, jailTurns: 0, powerCards: [] }
    ];
}

function createContext(options = {}) {
    const BOARD_SPACES = makeBoard();
    const players = basePlayers(options);
    const context = {
        BOARD_SPACES,
        gameState: {
            players,
            ownership: options.ownership || {},
            round: options.round || 1,
            phase: options.phase || 'PRE_ROLL',
            currentPlayerIndex: options.currentPlayerIndex ?? 0,
            activeWorldEvent: null,
            inflationMultiplier: 1,
            jackpotPot: 1000
        },
        setupConfig: options.setupConfig || { progressiveElimination: false, jailRentAllowed: true },
        RBI_AUDIT_INTERVAL: 5,
        getScheduledLicenseFee(stage) { return [0, 1000, 1800, 2800, 4000][stage] || 5000; },
        getScheduledStartSalary() { return 1500; },
        formatRupee(value) { return '₹' + Math.round(Number(value) || 0).toLocaleString('en-IN'); },
        getMortgagePrincipal(space) { return Math.floor(space.price / 2); },
        getMortgageRedemptionCost(space, property) {
            return Math.floor(space.price / 2) + Math.ceil(space.price * 0.05) +
                Math.max(0, Math.floor(Number(property?.mortgageTransferInterestDue) || 0));
        },
        getTradeTransferFee(spaceId) {
            const property = context.gameState.ownership[spaceId];
            return property && property.mortgaged ? Math.ceil(BOARD_SPACES[spaceId].price * 0.05) : 0;
        },
        getEffectiveHouseCost(space) { return Number(space.houseCost) || 0; },
        canBuildEvenlyOnSpace(playerId, spaceId) {
            const space = BOARD_SPACES[spaceId];
            const property = context.gameState.ownership[spaceId];
            if (!space || !property || property.ownerId !== playerId || property.mortgaged || property.houses >= 4) {
                return { allowed: false };
            }
            const group = BOARD_SPACES.filter(item => item.type === 'city' && item.group === space.group);
            if (group.length < 2 || !group.every(item => {
                const state = context.gameState.ownership[item.id];
                return state && state.ownerId === playerId && !state.mortgaged;
            })) return { allowed: false };
            const minHouses = Math.min(...group.map(item => context.gameState.ownership[item.id].houses || 0));
            return { allowed: property.houses <= minHouses };
        }
    };
    vm.createContext(context);
    vm.runInContext(AI_FUNCTIONS.map(extractFunction).join('\n\n'), context, { timeout: 1000 });
    return context;
}

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('PASS ' + name);
    } catch (err) {
        console.error('FAIL ' + name + ': ' + err.message);
        process.exitCode = 1;
    }
}

test('two-dice landing probabilities match the exact 2–12 distribution', () => {
    const c = createContext();
    const rival = c.gameState.players[1];
    rival.position = 0;
    assert.ok(Math.abs(c.getAIPlayerLandingProbability(rival, 2) - 1 / 36) < 1e-10);
    assert.ok(Math.abs(c.getAIPlayerLandingProbability(rival, 7) - 6 / 36) < 1e-10);
    assert.equal(c.getAIPlayerLandingProbability(rival, 13), 0);
    rival.inJail = true;
    rival.jailTurns = 0;
    assert.ok(Math.abs(c.getAIPlayerLandingProbability(rival, 6) - 1 / 36) < 1e-10);
    assert.equal(c.getAIPlayerLandingProbability(rival, 7), 0);
});

test('buying the final missing city gets a strong monopoly valuation', () => {
    const c = createContext({ ownership: { 1: { ownerId: 0, houses: 0, mortgaged: false } } });
    const ai = c.gameState.players[0];
    ai.cash = 2500;
    const value = c.getAIPropertyValuation(ai, c.BOARD_SPACES[3]);
    assert.equal(value.completesGroup, true);
    assert.ok(value.marketValue >= c.BOARD_SPACES[3].price * 1.8);
    const decision = c.getAIPurchaseDecision(ai, c.BOARD_SPACES[3]);
    assert.equal(decision.shouldBuy, true);
});

test('buying a property that would make the rival monopolist is valued as a block', () => {
    const c = createContext({ ownership: { 1: { ownerId: 1, houses: 0, mortgaged: false } } });
    const value = c.getAIPropertyValuation(c.gameState.players[0], c.BOARD_SPACES[3]);
    assert.equal(value.blocksRivalMonopoly, true);
    assert.ok(value.marketValue > c.BOARD_SPACES[3].price);
});

test('purchase policy preserves a cash reserve instead of spending down to a flat tiny balance', () => {
    const c = createContext();
    const ai = c.gameState.players[0];
    ai.cash = 1800;
    const decision = c.getAIPurchaseDecision(ai, c.BOARD_SPACES[5]);
    assert.equal(decision.shouldBuy, false);
    assert.ok(decision.cashAfterPurchase < decision.reserve);
});

test('sealed auction bids are capped by strategic value and protected liquidity', () => {
    const c = createContext();
    const ai = c.gameState.players[0];
    ai.cash = 1500;
    const bid = c.getAISealedAuctionBid(ai, c.BOARD_SPACES[5], { minimumBid: 500 });
    assert.ok(bid.bid >= 500);
    assert.ok(bid.bid <= ai.cash - c.getAIReserveCash(ai));
    assert.equal(bid.bid % 100, 0);

    ai.cash = 900;
    const conservativeBid = c.getAISealedAuctionBid(ai, c.BOARD_SPACES[5], { minimumBid: 500 });
    assert.equal(conservativeBid.bid, 0);
});

test('Vande Bharat selects the best-value affordable monopoly opportunity', () => {
    const c = createContext({
        ownership: { 1: { ownerId: 0, houses: 0, mortgaged: false } }
    });
    const ai = c.gameState.players[0];
    ai.cash = 8000;
    const target = c.getAIBestVandeBharatTarget(ai);
    assert.ok(target);
    assert.equal(target.space.id, 3);
    assert.equal(target.valuation.completesGroup, true);
});

test('rent shield is used for a meaningful reachable rent threat, not simply because the board is full', () => {
    const c = createContext({
        ownership: { 7: { ownerId: 1, houses: 4, mortgaged: false } }
    });
    const ai = c.gameState.players[0];
    ai.position = 0;
    ai.cash = 8000;
    ai.powerCards = [{ type: 'RENT_SHIELD', used: false }];
    const plan = c.getAIStrategicPowerPlan(ai);
    assert.equal(plan.shieldIndex, 0);
    assert.ok(c.getAIImmediateRentThreat(ai).expectedLoss > 250);

    const safe = createContext();
    safe.gameState.players[0].powerCards = [{ type: 'RENT_SHIELD', used: false }];
    assert.equal(safe.getAIStrategicPowerPlan(safe.gameState.players[0]).shieldIndex, -1);
});

test('IT Raid is reserved for a meaningful cash-leading opponent', () => {
    const c = createContext();
    const ai = c.gameState.players[0];
    ai.cash = 5000;
    ai.powerCards = [{ type: 'IT_RAID', used: false }];
    c.gameState.players[1].cash = 12000;
    assert.equal(c.getAIStrategicPowerPlan(ai).raidIndex, 0);

    c.gameState.players[1].cash = 1000;
    c.gameState.players[2].cash = 1000;
    assert.equal(c.getAIStrategicPowerPlan(ai).raidIndex, -1);
});

test('bail policy balances cash strength and jail-turn urgency', () => {
    const c = createContext();
    const ai = c.gameState.players[0];
    ai.inJail = true;
    ai.cash = 900;
    ai.jailTurns = 0;
    assert.equal(c.shouldAIPayBail(ai), false);
    ai.cash = 8000;
    assert.equal(c.shouldAIPayBail(ai), true);
    ai.cash = 900;
    ai.jailTurns = 2;
    assert.equal(c.shouldAIPayBail(ai), true);
});

test('construction is chosen by projected rent increase and still requires the even-build rule', () => {
    const ownership = {
        1: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: false },
        3: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: false }
    };
    const c = createContext({ ownership });
    const ai = c.gameState.players[0];
    ai.cash = 10000;
    c.gameState.players[1].position = 35;
    c.gameState.players[2].position = 35;
    const plan = c.getAIBestBuildOption(ai);
    assert.ok(plan);
    assert.ok(plan.projectedIncome > plan.cost * 1.12);
    assert.ok([1, 3].includes(plan.spaceId));
});

test('mortgage redemption is selected only when its rent return covers the redemption cost', () => {
    const ownership = {
        1: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: true },
        3: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: false }
    };
    const c = createContext({ ownership });
    const ai = c.gameState.players[0];
    ai.cash = 10000;
    c.gameState.players[1].position = 35;
    c.gameState.players[2].position = 35;
    const plan = c.getAIBestMortgageRedemption(ai);
    assert.ok(plan);
    assert.equal(plan.spaceId, 1);
    assert.ok(plan.projectedValue > plan.cost * 1.15);
});

test('Magnet Trap targets a payable high-rent opportunity and avoids an active shield', () => {
    const ownership = { 1: { ownerId: 0, houses: 4, buildCosts: [], mortgaged: false } };
    const c = createContext({ ownership });
    const ai = c.gameState.players[0];
    ai.cash = 5000;
    c.gameState.players[1].cash = 5000;
    const opportunity = c.getAIBestTrapOpportunity(ai);
    assert.ok(opportunity);
    assert.equal(opportunity.targetSpace.id, 1);
    c.gameState.players[1].rentShieldActive = true;
    assert.equal(c.getAIBestTrapOpportunity(ai), null);
});

test('AI rejects trades that hand a rival a monopoly and accepts a valuable set-completing offer', () => {
    const hostile = createContext({
        ownership: {
            1: { ownerId: 0, houses: 0, mortgaged: false },
            3: { ownerId: 1, houses: 0, mortgaged: false },
            5: { ownerId: 1, houses: 0, mortgaged: false }
        }
    });
    const ai = hostile.gameState.players[0];
    ai.cash = 6000;
    hostile.gameState.players[1].cash = 6000;
    const bad = hostile.getAITradeOfferAssessment(ai, {
        proposerId: 1, recipientId: 0, offerPropId: 5, requestPropId: 1,
        offerCash: 0, requestCash: 0
    });
    assert.equal(bad.accepted, false);

    const favorable = createContext({
        ownership: {
            5: { ownerId: 0, houses: 0, mortgaged: false },
            7: { ownerId: 1, houses: 0, mortgaged: false }
        }
    });
    const ai2 = favorable.gameState.players[0];
    ai2.cash = 6000;
    const good = favorable.getAITradeOfferAssessment(ai2, {
        proposerId: 1, recipientId: 0, offerPropId: 7, requestPropId: null,
        offerCash: 0, requestCash: 0
    });
    assert.equal(good.accepted, true);
    assert.ok(good.netGain > 0);
});

test('RBI liquidation ranks assets by strategic damage instead of only purchase price', () => {
    const ownership = {
        1: { ownerId: 0, houses: 2, buildCosts: [100, 100], mortgaged: false },
        5: { ownerId: 0, houses: 1, buildCosts: [100], mortgaged: false }
    };
    const c = createContext({ ownership });
    const ai = c.gameState.players[0];
    c.gameState.players[1].position = 35;
    c.gameState.players[2].position = 35;
    const strategicGroupSaleCost = c.getAIStructureSalePriority(ai, 1);
    const lowValueSaleCost = c.getAIStructureSalePriority(ai, 5);
    assert.ok(Number.isFinite(strategicGroupSaleCost));
    assert.ok(Number.isFinite(lowValueSaleCost));
    assert.ok(lowValueSaleCost < strategicGroupSaleCost);
});

test('AI turn, buying and maintenance decisions no longer use arbitrary random odds', () => {
    const turn = extractFunction('checkAndTriggerAITurn');
    const buy = extractFunction('executeAIDecisionOnLanding');
    const maintenance = extractFunction('executeAIPostTurnMaintenance');
    assert.doesNotMatch(turn, /Math\.random/);
    assert.doesNotMatch(maintenance, /Math\.random/);
    assert.match(buy, /getAIPurchaseDecision/);
    assert.match(maintenance, /getAIBestBuildOption/);
    assert.match(html, /function getAISealedAuctionBid/);
    assert.equal((html.match(/function getAISealedAuctionBid/g) || []).length, 1);
});

console.log('RESULT ' + passed + ' strategic AI regression tests passed');
if (passed !== 15) process.exitCode = 1;
