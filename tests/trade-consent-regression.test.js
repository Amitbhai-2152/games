// Human trade-consent regression tests. Run: node tests/trade-consent-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');
const start = html.indexOf('        function isTradeableProperty(spaceId, ownerId) {');
const endTitle = html.indexOf('सख्त घर/होटल निर्माण एवं 55% गिरवी प्रबंधन', start);
const end = endTitle === -1 ? -1 : html.lastIndexOf('        /*', endTitle);
assert.notEqual(start, -1, 'missing trade implementation start');
assert.ok(end > start, 'missing trade implementation end');
const tradeCode = html.slice(start, end);

function test(name, fn) {
    try {
        fn();
        console.log('PASS ' + name);
    } catch (err) {
        console.error('FAIL ' + name + ': ' + err.message);
        process.exitCode = 1;
    }
}

function createGame(options = {}) {
    const players = options.players || [
        { id: 0, name: 'Player A', isAI: false, cash: 10000, bankrupt: false },
        { id: 1, name: 'Player B', isAI: false, cash: 10000, bankrupt: false },
        { id: 2, name: 'AI Player', isAI: true, cash: 10000, bankrupt: false }
    ];
    const spaces = {
        1: { id: 1, name: 'Patna', type: 'city', group: 'brown', price: 500, houseCost: 200 },
        2: { id: 2, name: 'Ranchi', type: 'city', group: 'brown', price: 600, houseCost: 200 },
        3: { id: 3, name: 'Bhopal', type: 'city', group: 'teal', price: 800, houseCost: 300 },
        4: { id: 4, name: 'Varanasi', type: 'city', group: 'teal', price: 850, houseCost: 300 },
        5: { id: 5, name: 'Indian Railways', type: 'utility', group: 'utility', price: 1000 }
    };
    const ownership = options.ownership || {
        1: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: false },
        2: { ownerId: 1, houses: 0, buildCosts: [], mortgaged: false }
    };
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) {
            const classes = new Set();
            nodes.set(id, {
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
            });
        }
        return nodes.get(id);
    };
    node('tradeModal').classList.add('hidden');
    node('tradeResponseModal').classList.add('hidden');
    const ledger = [];
    const logs = [];
    const toasts = [];
    const context = {
        gameState: {
            players,
            currentPlayerIndex: 0,
            phase: options.phase || 'PRE_ROLL',
            round: 1,
            ownership,
            pendingTradeOffer: null,
            pendingDebt: null,
            auction: null,
            jackpotPot: 1000
        },
        BOARD_SPACES: Object.values(spaces),
        GROUP_COLORS: { brown: { name: 'Brown' }, teal: { name: 'Teal' } },
        formatRupee: value => '₹' + Number(value).toLocaleString('en-IN'),
        groupHasAnyHouses(group) {
            return context.BOARD_SPACES.some(space =>
                space.type === 'city' &&
                space.group === group &&
                (Number(context.gameState.ownership[space.id]?.houses) || 0) > 0
            );
        },
        hasGroupMonopoly(playerId, group) {
            const groupSpaces = context.BOARD_SPACES.filter(space =>
                space.type === 'city' && space.group === group
            );
            return groupSpaces.length > 0 && groupSpaces.every(space =>
                context.gameState.ownership[space.id]?.ownerId === playerId &&
                !context.gameState.ownership[space.id]?.mortgaged
            );
        },
        recordLedgerEntry(...args) { ledger.push(args); },
        sfxFanfare() {},
        sfxPay() {},
        addLog(message) { logs.push(message); },
        setToast(message) { toasts.push(message); },
        renderAll() {},
        closeTradeModal() { node('tradeModal').classList.add('hidden'); },
        document: { getElementById: node },
        ledger,
        logs,
        toasts
    };
    vm.createContext(context);
    vm.runInContext(tradeCode, context, { timeout: 1000 });
    node('tradePartnerSelect').value = '1';
    node('tradeOfferPropSelect').value = '';
    node('tradeRequestPropSelect').value = '2';
    node('tradeOfferCashInput').value = '0';
    node('tradeRequestCashInput').value = '0';
    return context;
}

function sendHumanOffer(context, values = {}) {
    const nodes = context.document;
    nodes.getElementById('tradePartnerSelect').value = String(values.partnerId ?? 1);
    nodes.getElementById('tradeOfferPropSelect').value = values.offerPropId == null ? '' : String(values.offerPropId);
    nodes.getElementById('tradeRequestPropSelect').value = values.requestPropId == null ? '' : String(values.requestPropId);
    nodes.getElementById('tradeOfferCashInput').value = String(values.offerCash ?? 0);
    nodes.getElementById('tradeRequestCashInput').value = String(values.requestCash ?? 0);
    context.executeTradeProposal();
}

test('human property cannot be transferred before recipient approval', () => {
    const c = createGame();
    const beforeA = c.gameState.players[0].cash;
    const beforeB = c.gameState.players[1].cash;

    sendHumanOffer(c, { requestPropId: 2 });

    assert.equal(c.gameState.phase, 'TRADE_RESPONSE');
    assert.equal(c.gameState.pendingTradeOffer.status, 'PENDING');
    assert.equal(c.gameState.ownership[2].ownerId, 1);
    assert.equal(c.gameState.players[0].cash, beforeA);
    assert.equal(c.gameState.players[1].cash, beforeB);
    assert.equal(c.document.getElementById('tradeResponseModal').classList.contains('hidden'), false);
});

test('recipient rejection leaves all assets and balances unchanged and restores phase', () => {
    const c = createGame();
    const before = c.gameState.players.map(player => player.cash);
    const owners = Object.fromEntries(Object.entries(c.gameState.ownership).map(([id, prop]) => [id, prop.ownerId]));

    sendHumanOffer(c, { offerPropId: 1, requestPropId: 2, offerCash: 1000, requestCash: 500 });
    c.rejectTradeOffer();

    assert.equal(c.gameState.pendingTradeOffer, null);
    assert.equal(c.gameState.phase, 'PRE_ROLL');
    assert.deepEqual(c.gameState.players.map(player => player.cash), before);
    assert.deepEqual(Object.fromEntries(Object.entries(c.gameState.ownership).map(([id, prop]) => [id, prop.ownerId])), owners);
});

test('recipient approval atomically exchanges agreed properties and cash', () => {
    const c = createGame();
    sendHumanOffer(c, { offerPropId: 1, requestPropId: 2, offerCash: 1000, requestCash: 500 });

    assert.equal(c.gameState.ownership[1].ownerId, 0);
    assert.equal(c.gameState.ownership[2].ownerId, 1);
    c.acceptTradeOffer();

    assert.equal(c.gameState.pendingTradeOffer, null);
    assert.equal(c.gameState.phase, 'PRE_ROLL');
    assert.equal(c.gameState.ownership[1].ownerId, 1);
    assert.equal(c.gameState.ownership[2].ownerId, 0);
    assert.equal(c.gameState.players[0].cash, 9500);
    assert.equal(c.gameState.players[1].cash, 10500);
    assert.ok(c.ledger.length >= 6);
});

test('stale property ownership cancels approval without transferring anything', () => {
    const c = createGame();
    sendHumanOffer(c, { offerPropId: 1, requestPropId: 2, offerCash: 1000, requestCash: 500 });
    c.gameState.ownership[2].ownerId = 2;
    const cash = c.gameState.players.map(player => player.cash);

    c.acceptTradeOffer();

    assert.equal(c.gameState.pendingTradeOffer, null);
    assert.equal(c.gameState.phase, 'PRE_ROLL');
    assert.equal(c.gameState.ownership[1].ownerId, 0);
    assert.equal(c.gameState.ownership[2].ownerId, 2);
    assert.deepEqual(c.gameState.players.map(player => player.cash), cash);
});

test('stale cash balance cancels approval rather than overdrawing recipient', () => {
    const c = createGame();
    sendHumanOffer(c, { offerCash: 1000, requestCash: 500 });
    c.gameState.players[1].cash = 100;
    const proposerCash = c.gameState.players[0].cash;

    c.acceptTradeOffer();

    assert.equal(c.gameState.pendingTradeOffer, null);
    assert.equal(c.gameState.phase, 'PRE_ROLL');
    assert.equal(c.gameState.players[0].cash, proposerCash);
    assert.equal(c.gameState.players[1].cash, 100);
});

test('fractional and negative cash offers are rejected', () => {
    for (const value of ['1.5', '-1']) {
        const c = createGame();
        sendHumanOffer(c, { offerCash: value, requestPropId: 2 });
        assert.equal(c.gameState.pendingTradeOffer, null, 'invalid amount must not create an offer: ' + value);
        assert.equal(c.gameState.phase, 'PRE_ROLL');
        assert.equal(c.gameState.ownership[2].ownerId, 1);
    }
});

test('properties with buildings or group development cannot be traded', () => {
    const direct = createGame();
    direct.gameState.ownership[2].houses = 1;
    const invalidDirect = direct.validateTradeProposal({
        proposerId: 0, recipientId: 1, offerPropId: null, requestPropId: 2,
        offerCash: 0, requestCash: 0, returnPhase: 'PRE_ROLL'
    });
    assert.equal(invalidDirect.valid, false);

    const group = createGame();
    group.gameState.ownership[1].houses = 1;
    const invalidGroup = group.validateTradeProposal({
        proposerId: 0, recipientId: 1, offerPropId: null, requestPropId: 2,
        offerCash: 0, requestCash: 0, returnPhase: 'PRE_ROLL'
    });
    assert.equal(invalidGroup.valid, false);
});

test('mortgaged property transfer fees are previewed and charged to each recipient', () => {
    const ownership = {
        1: { ownerId: 0, houses: 0, buildCosts: [], mortgaged: true },
        2: { ownerId: 1, houses: 0, buildCosts: [], mortgaged: true }
    };
    const c = createGame({ ownership });
    sendHumanOffer(c, { offerPropId: 1, requestPropId: 2, offerCash: 500, requestCash: 200 });
    const summary = c.document.getElementById('tradeResponseSummary').textContent;
    assert.match(summary, /आपका गिरवी हस्तांतरण शुल्क: ₹60/);
    assert.match(summary, /उनका गिरवी हस्तांतरण शुल्क: ₹50/);
    c.acceptTradeOffer();

    assert.equal(c.gameState.ownership[1].ownerId, 1);
    assert.equal(c.gameState.ownership[2].ownerId, 0);
    assert.equal(c.gameState.players[0].cash, 9640);
    assert.equal(c.gameState.players[1].cash, 10250);
    assert.equal(c.gameState.jackpotPot, 1055);
});

test('AI trade valuation and immediate acceptance path remain active', () => {
    const players = [
        { id: 0, name: 'Human', isAI: false, cash: 10000, bankrupt: false },
        { id: 1, name: 'AI', isAI: true, cash: 10000, bankrupt: false },
        { id: 2, name: 'Other', isAI: false, cash: 10000, bankrupt: false }
    ];
    const ownership = {
        2: { ownerId: 1, houses: 0, buildCosts: [], mortgaged: false }
    };
    const c = createGame({ players, ownership });
    sendHumanOffer(c, { partnerId: 1, offerCash: 600, requestPropId: 2 });
    assert.equal(c.gameState.pendingTradeOffer, null);
    assert.equal(c.gameState.phase, 'PRE_ROLL');
    assert.equal(c.gameState.ownership[2].ownerId, 0);
    assert.equal(c.gameState.players[0].cash, 9400);
    assert.equal(c.gameState.players[1].cash, 10600);
});

test('AI still rejects an under-valued property offer and protects a complete monopoly', () => {
    const players = [
        { id: 0, name: 'Human', isAI: false, cash: 10000, bankrupt: false },
        { id: 1, name: 'AI', isAI: true, cash: 10000, bankrupt: false },
        { id: 2, name: 'Other', isAI: false, cash: 10000, bankrupt: false }
    ];
    const low = createGame({ players, ownership: {
        2: { ownerId: 1, houses: 0, buildCosts: [], mortgaged: false }
    }});
    sendHumanOffer(low, { partnerId: 1, offerCash: 100, requestPropId: 2 });
    assert.equal(low.gameState.ownership[2].ownerId, 1);
    assert.equal(low.gameState.players[0].cash, 10000);

    const monopoly = createGame({ players, ownership: {
        1: { ownerId: 1, houses: 0, buildCosts: [], mortgaged: false },
        2: { ownerId: 1, houses: 0, buildCosts: [], mortgaged: false }
    }});
    sendHumanOffer(monopoly, { partnerId: 1, offerCash: 5000, requestPropId: 2 });
    assert.equal(monopoly.gameState.ownership[2].ownerId, 1);
    assert.equal(monopoly.gameState.players[0].cash, 10000);
});

test('recipient review dialog exposes explicit accept/reject actions and rulebook consent', () => {
    assert.match(html, /id="tradeResponseModal"[^>]*>/);
    assert.match(html, /onclick="acceptTradeOffer\(\)"/);
    assert.match(html, /onclick="rejectTradeOffer\(\)"/);
    assert.match(html, /मानव खिलाड़ी की स्पष्ट स्वीकृति के बाद ही अदला-बदली होगी/);
    assert.match(html, /'tradeResponseModal'/);
});
