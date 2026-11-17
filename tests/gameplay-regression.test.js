// Gameplay regression suite: auctions, rent, payments and bankruptcy.
// Run: node tests/gameplay-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');

function extractFunction(name) {
    const marker = '        function ' + name + '(';
    const start = html.indexOf(marker);
    assert.notEqual(start, -1, 'missing game function: ' + name);
    const rest = html.slice(start);
    const next = rest.slice(1).search(/\n        function [A-Za-z_$][\w$]*\s*\(/);
    return rest.slice(0, next < 0 ? rest.length : next + 1).trim();
}

function install(context, names) {
    vm.createContext(context);
    vm.runInContext(names.map(extractFunction).join('\n\n'), context, { timeout: 1000 });
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

function makeNode(id) {
    const classes = new Set();
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        disabled: false,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: (name, force) => {
                const on = force === undefined ? !classes.has(name) : Boolean(force);
                if (on) classes.add(name); else classes.delete(name);
                return on;
            }
        }
    };
}

function auctionContext(options = {}) {
    const nodes = new Map();
    const getNode = id => {
        if (!nodes.has(id)) nodes.set(id, makeNode(id));
        return nodes.get(id);
    };
    const scheduled = [];
    const logs = [];
    const ledger = [];
    const toasts = [];
    const finished = [];
    const spaces = [
        { id: 0, name: 'Start', type: 'corner', price: 0 },
        { id: 1, name: 'Patna', type: 'city', group: 'brown', price: 1000, rents: [50, 220, 550, 1250, 2100] },
        { id: 2, name: 'Ranchi', type: 'city', group: 'brown', price: 600, rents: [60, 250, 620, 1400, 2350] }
    ];
    const context = {
        BOARD_SPACES: spaces,
        gameState: {
            players: options.players || [
                { id: 0, name: 'Human A', isAI: false, cash: 2000, bankrupt: false },
                { id: 1, name: 'Human B', isAI: false, cash: 1800, bankrupt: false },
                { id: 2, name: 'AI', isAI: true, cash: 2000, bankrupt: false }
            ],
            currentPlayerIndex: options.currentPlayerIndex ?? 0,
            phase: 'PRE_ROLL',
            pendingBonusTurn: false,
            auction: null,
            ownership: {},
            jackpotPot: 1000
        },
        document: {
            getElementById: getNode,
            createElement: tag => ({ tagName: tag, className: '', innerHTML: '', remove() { this.removed = true; } }),
            body: { appendChild() {} }
        },
        formatRupee: value => '₹' + Number(value).toLocaleString('en-IN'),
        scheduleGameTimeout: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
        renderAuctionModal() {},
        finishTurnPhase: value => { finished.push(value); },
        setToast: value => { toasts.push(value); },
        addLog: value => { logs.push(value); },
        recordLedgerEntry: (...args) => { ledger.push(args); },
        sfxCash() {},
        sfxFanfare() {},
        sfxWorldEventAlert() {},
        showCenterScreenBanner() {},
        getAISealedAuctionBid: options.aiBid || (() => ({ bid: 0, reason: 'pass' })),
        scheduled, logs, ledger, toasts, finished
    };
    return install(context, [
        'startPropertyAuction',
        'submitSealedAuctionBid',
        'resolveSealedAuctionBids',
        'finalizeSealedAuction'
    ]);
}

function rentContext(options = {}) {
    const context = {
        BOARD_SPACES: options.spaces || [
            { id: 0, type: 'corner', name: 'Start' },
            { id: 1, type: 'city', name: 'Patna', group: 'brown', rents: [50, 220, 550, 1250, 2100] },
            { id: 2, type: 'city', name: 'Ranchi', group: 'brown', rents: [60, 250, 620, 1400, 2350] },
            { id: 3, type: 'utility', name: 'Railway', price: 1000 },
            { id: 4, type: 'utility', name: 'Power', price: 900 }
        ],
        gameState: {
            players: options.players || [
                { id: 0, cash: 1000, bankrupt: false },
                { id: 1, cash: 1000, bankrupt: false },
                { id: 2, cash: 1000, bankrupt: false }
            ],
            ownership: options.ownership || {
                1: { ownerId: 0, houses: 0, mortgaged: false },
                2: { ownerId: 1, houses: 0, mortgaged: false },
                3: { ownerId: 0, houses: 0, mortgaged: false },
                4: { ownerId: 0, houses: 0, mortgaged: false }
            },
            activeWorldEvent: null,
            inflationMultiplier: 1
        },
        setupConfig: { progressiveElimination: true },
        hasGroupMonopoly: options.hasGroupMonopoly || (() => false)
    };
    return install(context, ['calculateSpaceRent']);
}

function paymentContext(options = {}) {
    const nodes = new Map();
    const getNode = id => {
        if (!nodes.has(id)) nodes.set(id, makeNode(id));
        return nodes.get(id);
    };
    const ledger = [];
    const logs = [];
    const toasts = [];
    let callbackCount = 0;
    const players = options.players || [
        { id: 0, name: 'Debtor', cash: 500, isAI: false, bankrupt: false, financialStrikes: 0, rbiHearingPending: false },
        { id: 1, name: 'Creditor', cash: 1000, isAI: false, bankrupt: false, financialStrikes: 0 }
    ];
    const context = {
        gameState: {
            players,
            currentPlayerIndex: 0,
            phase: 'PRE_ROLL',
            pendingDebt: null,
            jackpotPot: 100
        },
        setupConfig: { progressiveElimination: options.progressiveElimination ?? false },
        document: { getElementById: getNode },
        recordLedgerEntry: (...args) => ledger.push(args),
        addLog: value => logs.push(value),
        setToast: value => toasts.push(value),
        renderAll() {},
        sfxPay() {},
        showCenterScreenBanner() {},
        openDebtModal() { context.debtModalOpened = true; },
        scheduleGameTimeout() {},
        autoResolveAIDebt() {},
        formatRupee: value => '₹' + Number(value).toLocaleString('en-IN'),
        callback() { callbackCount++; },
        get callbackCount() { return callbackCount; },
        ledger, logs, toasts
    };
    return install(context, ['executeDirectPayment', 'requirePayment', 'completeDebtPayment']);
}

function bankruptcyContext(options = {}) {
    const nodes = new Map();
    const getNode = id => {
        if (!nodes.has(id)) nodes.set(id, makeNode(id));
        return nodes.get(id);
    };
    const ledger = [];
    const logs = [];
    const toasts = [];
    let callbackCount = 0;
    const context = {
        BOARD_SPACES: options.spaces || [
            { id: 0, name: 'Start', type: 'corner', price: 0, houseCost: 0 },
            { id: 1, name: 'Patna', type: 'city', price: 500, houseCost: 200 },
            { id: 2, name: 'Railway', type: 'utility', price: 1000 }
        ],
        gameState: {
            players: options.players || [
                { id: 0, name: 'Debtor', cash: 100, bankrupt: false },
                { id: 1, name: 'Creditor', cash: 1000, bankrupt: false }
            ],
            ownership: options.ownership || {
                1: { ownerId: 0, houses: 1, buildCosts: [400], mortgaged: true },
                2: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: false }
            },
            pendingDebt: options.pendingDebt === undefined ? {
                playerId: 0, amount: 800, creditorId: 1, creditorName: 'Creditor',
                onComplete: () => { callbackCount++; }
            } : options.pendingDebt,
            jackpotPot: 100,
            currentPlayerIndex: options.currentPlayerIndex ?? 1
        },
        document: { getElementById: getNode },
        canSellEvenlyOnSpace: options.canSellEvenlyOnSpace || (() => ({ allowed: false })),
        canMortgageSpace: options.canMortgageSpace || (() => false),
        renderDebtModalContent() { context.debtModalRefreshed = true; },
        ensureBuildCostHistory: (property) => Array.isArray(property.buildCosts) ? property.buildCosts : [],
        recordLedgerEntry: (...args) => ledger.push(args),
        addLog: value => logs.push(value),
        setToast: value => toasts.push(value),
        renderAll() {},
        checkWinCondition: options.checkWinCondition || (() => true),
        handleEndTurn() { context.endTurnCalled = true; },
        formatRupee: value => '₹' + Number(value).toLocaleString('en-IN'),
        get callbackCount() { return callbackCount; },
        ledger, logs, toasts
    };
    context.getMortgagePrincipal = space => Math.floor(space.price / 2);
context.getMortgageTransferInterest = space => Math.ceil(context.getMortgagePrincipal(space) * 0.10);
return install(context, ['confirmBankruptcy']);
}

// ---------- Auctions ----------

test('auction uses half-price minimum with a ₹200 floor and skips ineligible players', () => {
    const players = [
        { id: 0, name: 'A', isAI: false, cash: 1200, bankrupt: false },
        { id: 1, name: 'B', isAI: false, cash: 500, bankrupt: false },
        { id: 2, name: 'C', isAI: true, cash: 1000, bankrupt: true }
    ];
    const c = auctionContext({ players, currentPlayerIndex: 1 });
    c.startPropertyAuction(c.BOARD_SPACES[1]);
    assert.equal(c.gameState.auction.minimumBid, 500);
    assert.deepEqual(Array.from(c.gameState.auction.activeBidders), [1, 0]);
    assert.equal(c.gameState.auction.initiatorId, 1);
    assert.equal(c.gameState.phase, 'AUCTION');
});

test('auction with no eligible bidder leaves the property unowned and finishes the phase', () => {
    const players = [
        { id: 0, name: 'A', isAI: false, cash: 100, bankrupt: false },
        { id: 1, name: 'B', isAI: true, cash: 200, bankrupt: true }
    ];
    const c = auctionContext({ players });
    c.startPropertyAuction(c.BOARD_SPACES[1]);
    assert.equal(c.gameState.auction, null);
    assert.equal(c.gameState.ownership[1], undefined);
    assert.deepEqual(Array.from(c.finished), [false]);
});

test('auction bid rejects blank, fractional, negative, below-minimum and over-budget bids', () => {
    const c = auctionContext();
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, activeBidders: [0, 1], humanBidders: [0, 1],
        humanCursor: 0, bidByPlayerId: {}, bidReasons: {}, stage: 'BIDDING'
    };
    const input = c.document.getElementById('auctionBidInput');
    for (const value of ['', '499', '500.5', '-1', '2001']) {
        input.value = value;
        c.submitSealedAuctionBid();
        assert.equal(Object.hasOwn(c.gameState.auction.bidByPlayerId, 0), false, 'rejected bid was recorded: ' + value);
        assert.equal(c.gameState.auction.humanCursor, 0);
    }
    assert.equal(c.toasts.length, 5);
});

test('auction accepts a valid integer bid and records it without charging before reveal', () => {
    const c = auctionContext();
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, activeBidders: [0, 1], humanBidders: [0, 1],
        humanCursor: 0, bidByPlayerId: {}, bidReasons: {}, stage: 'BIDDING'
    };
    c.document.getElementById('auctionBidInput').value = '750';
    c.submitSealedAuctionBid();
    assert.equal(c.gameState.auction.bidByPlayerId[0], 750);
    assert.equal(c.gameState.players[0].cash, 2000);
    assert.equal(c.gameState.auction.humanCursor, 1);
    assert.equal(c.scheduled.length, 1);
    assert.equal(c.scheduled[0].ms, 620);
});

test('AI auction strategy respects reserve cash and values completing a colour set', () => {
    const c = install({
        BOARD_SPACES: [
            { id: 1, type: 'city', group: 'brown', price: 1000 },
            { id: 2, type: 'city', group: 'brown', price: 600 }
        ],
        gameState: { ownership: {}, players: [
            { id: 0, name: 'AI', isAI: true, cash: 2000, bankrupt: false },
            { id: 1, name: 'Opponent', isAI: false, cash: 2000, bankrupt: false }
        ] },
        formatRupee: value => '₹' + value
    }, ['getAISealedAuctionBid']);

    const conservative = c.getAISealedAuctionBid({ id: 0, cash: 2000 }, c.BOARD_SPACES[0], { minimumBid: 500 });
    assert.equal(conservative.bid, 700);
    const lowCash = c.getAISealedAuctionBid({ id: 0, cash: 600 }, c.BOARD_SPACES[0], { minimumBid: 500 });
    assert.equal(lowCash.bid, 0);

    c.gameState.ownership[2] = { ownerId: 0, mortgaged: false };
    const setBid = c.getAISealedAuctionBid({ id: 0, cash: 2000 }, c.BOARD_SPACES[0], { minimumBid: 500 });
    assert.equal(setBid.bid, 1100);
});

test('auction applies the minimum bid floor to low-priced properties', () => {
    const c = auctionContext();
    c.startPropertyAuction({ id: 1, name: 'Low Price City', type: 'city', price: 250 });
    assert.equal(c.gameState.auction.minimumBid, 200);
});

test('human player can explicitly pass without being charged', () => {
    const c = auctionContext();
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, activeBidders: [0, 1], humanBidders: [0, 1],
        humanCursor: 0, bidByPlayerId: {}, bidReasons: {}, stage: 'BIDDING'
    };
    c.submitSealedAuctionBid(0);
    assert.equal(c.gameState.auction.bidByPlayerId[0], 0);
    assert.equal(c.gameState.players[0].cash, 2000);
    assert.equal(c.gameState.auction.humanCursor, 1);
});

test('auction resolves missing human bids as passes and uses initiator-order tie breaking', () => {
    const c = auctionContext({ aiBid: () => ({ bid: 700, reason: 'AI value' }) });
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, activeBidders: [0, 1, 2], humanBidders: [0, 1],
        humanCursor: 0, initiatorId: 1, bidByPlayerId: { 0: 700, 1: 700 },
        bidReasons: { 0: 'human A', 1: 'human B' }, stage: 'BIDDING',
        results: [], winnerId: null, winningBid: 0
    };
    c.resolveSealedAuctionBids();
    assert.equal(c.gameState.auction.bidByPlayerId[2], 700);
    assert.equal(c.gameState.auction.winnerId, 1, 'initiator wins a tied bid by turn order');
    assert.equal(c.gameState.auction.winningBid, 700);
    assert.equal(c.gameState.auction.stage, 'REVEAL');
    assert.equal(c.scheduled.at(-1).fn.name, 'finalizeSealedAuction');
});

test('auction with only passes produces no winner', () => {
    const c = auctionContext({ aiBid: () => ({ bid: 0, reason: 'AI pass' }) });
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, activeBidders: [0, 1, 2], humanBidders: [0, 1],
        initiatorId: 0, bidByPlayerId: { 0: 0, 1: 0 }, bidReasons: {}, stage: 'BIDDING',
        results: [], winnerId: null, winningBid: 0
    };
    c.resolveSealedAuctionBids();
    assert.equal(c.gameState.auction.winnerId, null);
    assert.equal(c.gameState.auction.winningBid, 0);
    assert.equal(c.gameState.auction.stage, 'REVEAL');
});

test('auction reveal finalizes winner, charges exactly once and assigns ownership', () => {
    const c = auctionContext();
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, activeBidders: [0, 1], initiatorId: 0,
        stage: 'REVEAL', results: [{ playerId: 0, bid: 750 }, { playerId: 1, bid: 500 }],
        winnerId: 0, winningBid: 750
    };
    c.finalizeSealedAuction();
    assert.equal(c.gameState.auction, null);
    assert.equal(c.gameState.ownership[1].ownerId, 0);
    assert.equal(c.gameState.players[0].cash, 1250);
    assert.equal(c.ledger.length, 1);
    assert.deepEqual(Array.from(c.finished), [false]);
});

test('auction reveal does not award property if winner became bankrupt or cannot pay', () => {
    for (const scenario of [
        { mutate: player => { player.bankrupt = true; }, expectedCash: 2000 },
        { mutate: player => { player.cash = 200; }, expectedCash: 200 }
    ]) {
        const c = auctionContext();
        c.gameState.auction = {
            spaceId: 1, minimumBid: 500, stage: 'REVEAL',
            results: [{ playerId: 0, bid: 750 }], winnerId: 0, winningBid: 750
        };
        scenario.mutate(c.gameState.players[0]);
        c.finalizeSealedAuction();
        assert.equal(c.gameState.ownership[1], undefined);
        assert.equal(c.gameState.players[0].cash, scenario.expectedCash);
        assert.equal(c.ledger.length, 0);
    }
});

test('auction without a qualifying bid leaves the property unowned', () => {
    const c = auctionContext();
    c.gameState.auction = {
        spaceId: 1, minimumBid: 500, stage: 'REVEAL',
        results: [{ playerId: 0, bid: 0 }, { playerId: 1, bid: 400 }],
        winnerId: null, winningBid: 0
    };
    c.finalizeSealedAuction();
    assert.equal(c.gameState.ownership[1], undefined);
    assert.equal(c.gameState.players[0].cash, 2000);
    assert.equal(c.gameState.players[1].cash, 1800);
});

// ---------- Rent calculation ----------

test('city rent uses base rent when there is no monopoly or building', () => {
    const c = rentContext();
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], c.gameState.ownership[1]), 50);
});

test('city rent doubles for an unmortgaged full colour monopoly', () => {
    const c = rentContext({ hasGroupMonopoly: () => true });
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], c.gameState.ownership[1]), 100);
});

test('city rent uses the exact building tier instead of monopoly base rent', () => {
    const ownership = {
        1: { ownerId: 0, houses: 2, mortgaged: false },
        2: { ownerId: 1, houses: 0, mortgaged: false }
    };
    const c = rentContext({ ownership, hasGroupMonopoly: () => true });
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], ownership[1]), 550);
});

test('utility rent counts only unmortgaged utilities owned by the same player', () => {
    const c = rentContext();
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[3], c.gameState.ownership[3]), 600);
    c.gameState.ownership[4].mortgaged = true;
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[3], c.gameState.ownership[3]), 250);
});

test('world-event and inflation multipliers combine before currency rounding', () => {
    const c = rentContext();
    c.gameState.activeWorldEvent = { rentMultiplierFn: () => 0.5 };
    c.gameState.inflationMultiplier = 1.5;
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], c.gameState.ownership[1]), 38);
});

test('final showdown rent multiplier applies only with exactly two active players', () => {
    const c = rentContext({ players: [
        { id: 0, cash: 1000, bankrupt: false },
        { id: 1, cash: 1000, bankrupt: false },
        { id: 2, cash: 1000, bankrupt: true }
    ]});
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], c.gameState.ownership[1]), 63);
    c.gameState.players[1].bankrupt = true;
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], c.gameState.ownership[1]), 50);
});

test('inflation is ignored when progressive elimination is disabled', () => {
    const c = rentContext();
    c.setupConfig.progressiveElimination = false;
    c.gameState.inflationMultiplier = 2;
    assert.equal(c.calculateSpaceRent(c.BOARD_SPACES[1], c.gameState.ownership[1]), 50);
});

// ---------- Payments and debt ----------

test('direct player-to-player payment debits debtor and credits active creditor with ledger entries', () => {
    const c = paymentContext();
    c.requirePayment(c.gameState.players[0], 200, 1, 'Rent', () => c.callback());
    assert.equal(c.gameState.players[0].cash, 300);
    assert.equal(c.gameState.players[1].cash, 1200);
    assert.equal(c.gameState.pendingDebt, null);
    assert.equal(c.callbackCount, 1);
    assert.equal(c.ledger.length, 2);
});

test('bank fee allocates the configured share to the jackpot and records the full debit', () => {
    const c = paymentContext();
    c.requirePayment(c.gameState.players[0], 201, null, 'Bank fee', null, 0.5);
    assert.equal(c.gameState.players[0].cash, 299);
    assert.equal(c.gameState.jackpotPot, 201);
    assert.equal(c.ledger.length, 1);
    assert.equal(c.ledger[0][2], -201);
});

test('shortfall creates a debt phase without partial payment or premature callback', () => {
    const c = paymentContext({ progressiveElimination: true });
    c.gameState.players[0].cash = 100;
    c.gameState.players[0].financialStrikes = 2;
    c.requirePayment(c.gameState.players[0], 500, 1, 'Rent', () => c.callback());
    assert.equal(c.gameState.phase, 'DEBT_SETTLEMENT');
    assert.equal(c.gameState.pendingDebt.amount, 500);
    assert.equal(c.gameState.players[0].cash, 100);
    assert.equal(c.gameState.players[1].cash, 1000);
    assert.equal(c.callbackCount, 0);
    assert.equal(c.gameState.players[0].rbiHearingPending, true);
    assert.equal(c.gameState.players[0].financialStrikes, 0);
});

test('debt cannot be paid until the debtor has enough cash, then completes exactly once', () => {
    const c = paymentContext();
    c.gameState.players[0].cash = 100;
    c.gameState.pendingDebt = {
        playerId: 0, amount: 200, creditorId: 1, creditorName: 'Creditor',
        reason: 'Rent', onComplete: () => c.callback(), jackpotShareRate: 0.5
    };
    c.gameState.phase = 'DEBT_SETTLEMENT';
    c.completeDebtPayment();
    assert.equal(c.gameState.pendingDebt.amount, 200);
    assert.equal(c.gameState.players[1].cash, 1000);
    assert.equal(c.callbackCount, 0);

    c.gameState.players[0].cash = 250;
    c.completeDebtPayment();
    assert.equal(c.gameState.pendingDebt, null);
    assert.equal(c.gameState.phase, 'DEBT_SETTLEMENT');
    assert.equal(c.gameState.players[0].cash, 50);
    assert.equal(c.gameState.players[1].cash, 1200);
    assert.equal(c.callbackCount, 1);
});

// ---------- Bankruptcy ----------

test('bankruptcy is blocked while an eligible building sale or mortgage remains', () => {
    for (const options of [
        { canSellEvenlyOnSpace: () => ({ allowed: true }) },
        { canMortgageSpace: () => true }
    ]) {
        const c = bankruptcyContext(options);
        const beforeCash = c.gameState.players[0].cash;
        c.confirmBankruptcy();
        assert.equal(c.gameState.players[0].bankrupt, false);
        assert.equal(c.gameState.pendingDebt !== null, true);
        assert.equal(c.gameState.players[0].cash, beforeCash);
        assert.equal(c.debtModalRefreshed, true);
    }
});

test('creditor bankruptcy transfers remaining cash and properties and applies mortgage fee', () => {
    const c = bankruptcyContext();
    c.confirmBankruptcy();
    assert.equal(c.gameState.players[0].bankrupt, true);
    assert.equal(c.gameState.players[0].cash, 0);
    assert.equal(c.gameState.players[1].cash, 1275);
    assert.equal(c.gameState.ownership[1].ownerId, 1);
    assert.equal(c.gameState.ownership[1].houses, 0);
    assert.equal(c.gameState.ownership[2].ownerId, 1);
    assert.equal(c.gameState.jackpotPot, 113);
    assert.equal(c.gameState.pendingDebt, null);
    assert.equal(c.ledger.some(row => String(row[1]).includes('निर्माण') && row[2] === 200), true);
    assert.equal(c.ledger.some(row => String(row[1]).includes('हस्तांतरण ब्याज') && row[2] === -25), true);
    assert.equal(c.gameState.ownership[1].mortgageInterestPaid, true);
    assert.equal(c.gameState.ownership[1].mortgageTransferInterestDue, 0);
});

test('bankruptcy defers full transfer interest when the creditor cannot pay it', () => {
    const c = bankruptcyContext({
        players: [
            { id: 0, name: 'Debtor', cash: 0, bankrupt: false },
            { id: 1, name: 'Creditor', cash: 0, bankrupt: false }
        ],
        ownership: {
            1: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: true, mortgageInterestPaid: false }
        },
        pendingDebt: { playerId: 0, amount: 1, creditorId: 1, creditorName: 'Creditor', onComplete: null }
    });
    c.confirmBankruptcy();
    assert.equal(c.gameState.ownership[1].ownerId, 1);
    assert.equal(c.gameState.ownership[1].mortgageInterestPaid, false);
    assert.equal(c.gameState.ownership[1].mortgageTransferInterestDue, 25);
    assert.equal(c.gameState.players[1].cash, 0, 'creditor cannot afford transfer interest');
    assert.equal(c.gameState.players[1].cash, 0, 'do not take a partial interest payment');
    assert.equal(c.gameState.jackpotPot, 100);
    assert.equal(c.ledger.some(row => String(row[1]).includes('हस्तांतरण ब्याज')), false);
    assert.match(c.logs.join(' '), /पूरा शुल्क स्थगित है/);
});

test('bank-debt bankruptcy releases the debtor properties back to the market', () => {
    const c = bankruptcyContext({
        pendingDebt: {
            playerId: 0, amount: 800, creditorId: null, creditorName: 'भारतीय रिज़र्व बैंक',
            onComplete: null
        }
    });
    c.confirmBankruptcy();
    assert.equal(c.gameState.players[0].bankrupt, true);
    assert.equal(c.gameState.ownership[1], undefined);
    assert.equal(c.gameState.ownership[2], undefined);
    assert.equal(c.gameState.players[0].cash, 0);
});

test('bankruptcy invokes continuation when the eliminated debtor is not the current player', () => {
    const c = bankruptcyContext({ currentPlayerIndex: 1, checkWinCondition: () => false });
    c.confirmBankruptcy();
    assert.equal(c.callbackCount, 1);
    assert.equal(c.endTurnCalled, undefined);
});

test('bankruptcy safely ignores missing debt and already bankrupt player', () => {
    const noDebt = bankruptcyContext({ pendingDebt: null });
    noDebt.confirmBankruptcy();
    assert.equal(noDebt.gameState.players[0].bankrupt, false);
    assert.equal(noDebt.gameState.ownership[1].ownerId, 0);

    const already = bankruptcyContext();
    already.gameState.players[0].bankrupt = true;
    already.confirmBankruptcy();
    assert.equal(already.gameState.ownership[1].ownerId, 0);
});

// ---------- Scoped trade-review UI regression ----------

test('trade review motion is responsive, accessible and respects reduced-motion preference', () => {
    assert.match(html, /@keyframes tradeResponseBackdropIn/);
    assert.match(html, /@keyframes tradeResponsePanelIn/);
    assert.match(html, /trade-response-panel[\s\S]*?animation: tradeResponsePanelIn/);
    assert.match(html, /trade-response-action:focus-visible/);
    assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?trade-response-action \{ transition: none !important;/);
    assert.match(html, /env\(safe-area-inset-bottom\)/);
    assert.match(html, /aria-modal="true"/);
});

console.log('RESULT ' + passed + ' gameplay regression tests passed');
