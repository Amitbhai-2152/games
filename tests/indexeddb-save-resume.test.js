// Regression tests for Phase 3 IndexedDB save/resume.
// Run: node tests/indexeddb-save-resume.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');
const startMarker = '/* INDEXEDDB GAME SAVE START */';
const endMarker = '/* INDEXEDDB GAME SAVE END */';
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start);
assert.notEqual(start, -1, 'missing IndexedDB save/resume implementation');
assert.ok(end > start, 'missing IndexedDB save/resume end marker');
const persistenceCode = html.slice(start + startMarker.length, end);

function makeElement() {
    const classes = new Set();
    return {
        textContent: '',
        innerHTML: '',
        title: '',
        disabled: false,
        attributes: {},
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) { return classes.has(name); }
        },
        setAttribute(name, value) { this.attributes[name] = String(value); }
    };
}

function createFakeIndexedDB(seed = null) {
    const records = new Map();
    if (seed) records.set(seed.id, JSON.parse(JSON.stringify(seed)));
    let storeCreated = false;

    const db = {
        objectStoreNames: { contains(name) { return name === 'game-saves' && storeCreated; } },
        createObjectStore(name) {
            if (name !== 'game-saves') throw new Error('Unexpected object store: ' + name);
            storeCreated = true;
            return {};
        },
        transaction(name, mode) {
            if (name !== 'game-saves') throw new Error('Unexpected transaction store');
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null, mode };
            const store = {
                get(key) {
                    const request = { result: undefined, onsuccess: null, onerror: null, error: null };
                    queueMicrotask(() => {
                        const found = records.get(key);
                        request.result = found ? JSON.parse(JSON.stringify(found)) : undefined;
                        if (request.onsuccess) request.onsuccess({ target: request });
                        queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete({ target: tx }); });
                    });
                    return request;
                },
                put(value) {
                    queueMicrotask(() => {
                        records.set(value.id, JSON.parse(JSON.stringify(value)));
                        if (tx.oncomplete) tx.oncomplete({ target: tx });
                    });
                    return { onsuccess: null, onerror: null };
                },
                delete(key) {
                    queueMicrotask(() => {
                        records.delete(key);
                        if (tx.oncomplete) tx.oncomplete({ target: tx });
                    });
                }
            };
            tx.objectStore = () => store;
            return tx;
        },
        close() {}
    };

    const indexedDB = {
        open(name, version) {
            const request = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, error: null };
            queueMicrotask(() => {
                if (!storeCreated && request.onupgradeneeded) request.onupgradeneeded({ target: request });
                if (request.onsuccess) request.onsuccess({ target: request });
            });
            return request;
        }
    };
    return { indexedDB, records };
}

function createHarness(options = {}) {
    const fakeIDB = options.fakeIDB || createFakeIndexedDB();
    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement());
            return elements.get(id);
        }
    };
    const spaces = Array.from({ length: 40 }, (_, id) => ({
        id,
        type: id === 3 || id === 5 ? 'city' : id === 4 ? 'utility' : 'corner',
        name: 'Space ' + id
    }));
    const worldEvent = { id: 'TEST_FESTIVAL', name: 'Festival', icon: '🎉', rentMultiplierFn: () => 1.5 };
    const gameState = {
        started: true,
        round: 3,
        currentPlayerIndex: 0,
        phase: 'PRE_ROLL',
        lastDice: [3, 4],
        doublesStreak: 0,
        selectedSpaceId: 0,
        highlightedChart: null,
        players: [
            { id: 0, name: 'आर्यन', tokenTitle: 'हाथी', color: '#f00', icon: 'fa-user', isAI: false, cash: 12000, position: 0, inJail: false, jailTurns: 0, bankrupt: false, powerCards: [], rollCount: 5, rollSumTotal: 30, doublesCount: 1 },
            { id: 1, name: 'दिव्या', tokenTitle: 'ताज', color: '#00f', icon: 'fa-crown', isAI: true, cash: 14500, position: 5, inJail: false, jailTurns: 0, bankrupt: false, powerCards: [], rollCount: 4, rollSumTotal: 22, doublesCount: 0 }
        ],
        ownership: {},
        auction: null,
        pendingDebt: null,
        pendingTradeOffer: null,
        rollAuditLog: [{ rollNum: 1, playerName: 'आर्यन', d1: 3, d2: 4, sum: 7, hexOutput: 'TEST', time: '10:00:00' }],
        rngMode: 'Web Crypto',
        diceSumCounts: { 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
        ledger: [{ id: 1, playerId: 0, delta: 15000 }],
        jackpotPot: 1200,
        activeWorldEvent: worldEvent,
        lastEventRoundTriggered: 1,
        lastEliminationAuditRound: 0,
        finalShowdownAnnounced: false,
        inflationMultiplier: 1,
        aiTimer: { runtimeTimer: true },
        activeTimers: [{ runtimeTimer: true }],
        rbiAuditContext: null
    };
    const setupConfig = {
        playerCount: 2,
        startingCash: 15000,
        jailRentAllowed: true,
        progressiveElimination: true,
        slots: [
            { name: 'आर्यन', tokenTitle: 'हाथी', color: '#f00', icon: 'fa-user', isAI: false },
            { name: 'दिव्या', tokenTitle: 'ताज', color: '#00f', icon: 'fa-crown', isAI: true }
        ]
    };

    const context = vm.createContext({
        window: { indexedDB: fakeIDB.indexedDB },
        document,
        gameState,
        setupConfig,
        BOARD_SPACES: spaces,
        WORLD_EVENTS_POOL: [worldEvent],
        console: { warn() {} },
        setTimeout(fn, ms) { return { fn, ms }; },
        clearTimeout() {},
        renderSetupModalUI() {},
        renderAll() {},
        selectSpace() {},
        addLog() {},
        clearAllGameTimers() { gameState.aiTimer = null; gameState.activeTimers = []; },
        checkAndTriggerAITurn() {},
        executeAIPostTurnMaintenance() {},
        handleEndTurn() {},
        executeAIDecisionOnLanding() {},
        scheduleGameTimeout(fn, ms) { return { fn, ms }; },
        initGameFromConfig() { context.initCalls = (context.initCalls || 0) + 1; }
    });
    vm.runInContext(persistenceCode, context, { timeout: 1000 });
    return {
        context, gameState, setupConfig, elements, fakeIDB, worldEvent, spaces,
        evaluate(expression) { return vm.runInContext(expression, context); },
        getElement(id) { return document.getElementById(id); }
    };
}

let passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log('PASS ' + name);
    } catch (error) {
        console.error('FAIL ' + name + ': ' + error.stack);
        process.exitCode = 1;
    }
}

(async () => {
    await test('safe checkpoints include PRE_ROLL, POST_ROLL and valid ACTION_DECISION', () => {
        const h = createHarness();
        for (const phase of ['PRE_ROLL', 'POST_ROLL']) {
            h.gameState.phase = phase;
            assert.equal(h.context.getGameSaveEligibility().allowed, true, phase);
        }
        h.gameState.phase = 'ACTION_DECISION';
        h.gameState.players[0].position = 3;
        h.gameState.pendingBonusTurn = false;
        assert.equal(h.context.getGameSaveEligibility().allowed, true);
    });

    await test('transient animation, debt, trade, auction and RBI audit states are not saved', () => {
        const h = createHarness();
        h.gameState.phase = 'MOVING';
        assert.equal(h.context.buildGameSaveRecord(), null);
        h.gameState.phase = 'PRE_ROLL';
        h.gameState.pendingDebt = { amount: 500, onComplete() {} };
        assert.equal(h.context.buildGameSaveRecord(), null);
        h.gameState.pendingDebt = null;
        h.gameState.pendingTradeOffer = { proposerId: 0 };
        assert.equal(h.context.buildGameSaveRecord(), null);
        h.gameState.pendingTradeOffer = null;
        h.gameState.auction = { stage: 'BIDDING' };
        assert.equal(h.context.buildGameSaveRecord(), null);
        h.gameState.auction = null;
        h.gameState.rbiAuditContext = { queue: [0, 1] };
        assert.equal(h.context.buildGameSaveRecord(), null);
    });

    await test('snapshot preserves game data but excludes live timers and event functions', () => {
        const h = createHarness();
        const record = h.context.buildGameSaveRecord();
        assert.ok(record);
        assert.equal(record.schemaVersion, 1);
        assert.equal(record.gameState.round, 3);
        assert.deepEqual(Array.from(record.gameState.lastDice), [3, 4]);
        assert.equal(record.gameState.activeWorldEventId, 'TEST_FESTIVAL');
        assert.equal(Object.hasOwn(record.gameState, 'aiTimer'), false);
        assert.equal(Object.hasOwn(record.gameState, 'activeTimers'), false);
        assert.equal(Object.hasOwn(record.gameState, 'activeWorldEvent'), false);
        assert.equal(JSON.stringify(record).includes('rentMultiplierFn'), false);
    });

    await test('snapshot validation rejects unsupported or structurally corrupt records', () => {
        const h = createHarness();
        const valid = h.context.buildGameSaveRecord();
        assert.equal(h.context.validateGameSaveRecord(valid), true);

        const wrongVersion = structuredClone(valid);
        wrongVersion.schemaVersion = 999;
        assert.equal(h.context.validateGameSaveRecord(wrongVersion), false);

        const invalidPlayer = structuredClone(valid);
        invalidPlayer.gameState.players[1].id = 0;
        assert.equal(h.context.validateGameSaveRecord(invalidPlayer), false);

        const invalidOwner = structuredClone(valid);
        invalidOwner.gameState.ownership['3'] = { ownerId: 9, houses: 0, mortgaged: false, buildCosts: [] };
        assert.equal(h.context.validateGameSaveRecord(invalidOwner), false);

        const invalidDecision = structuredClone(valid);
        invalidDecision.gameState.phase = 'ACTION_DECISION';
        invalidDecision.gameState.players[0].position = 2;
        invalidDecision.gameState.pendingBonusTurn = false;
        assert.equal(h.context.validateGameSaveRecord(invalidDecision), false);
    });

    await test('IndexedDB write, read and delete round-trip correctly', async () => {
        const h = createHarness();
        const record = h.context.buildGameSaveRecord();
        assert.equal(await h.context.writeStoredGameSave(record), true);
        const loaded = await h.context.readStoredGameSave();
        assert.deepEqual(loaded, record);
        assert.equal(await h.context.deleteStoredGameSave(), true);
        assert.equal(await h.context.readStoredGameSave(), null);
    });

    await test('restore rehydrates state, setup and event functions without restoring timers', async () => {
        const h = createHarness();
        h.gameState.round = 8;
        h.gameState.players[0].cash = 22000;
        h.gameState.players[0].position = 3;
        h.gameState.ownership['3'] = { ownerId: 0, houses: 0, buildCosts: [], mortgaged: false };
        h.gameState.phase = 'POST_ROLL';
        const record = h.context.buildGameSaveRecord();
        assert.ok(record);

        h.gameState.round = 1;
        h.gameState.players[0].cash = 10;
        h.context.pendingGameSaveRecord = record;
        const resumed = await h.context.resumeSavedGame();
        assert.equal(resumed, true);
        assert.equal(h.gameState.round, 8);
        assert.equal(h.gameState.players[0].cash, 22000);
        assert.equal(h.gameState.ownership['3'].ownerId, 0);
        assert.equal(h.gameState.phase, 'POST_ROLL');
        assert.equal(h.gameState.aiTimer, null);
        assert.deepEqual(Array.from(h.gameState.activeTimers), []);
        assert.equal(typeof h.gameState.activeWorldEvent.rentMultiplierFn, 'function');
        assert.equal(h.getElement('resumeGameModal').classList.contains('hidden'), true);
    });

    await test('ACTION_DECISION restores the property choice and schedules an AI decision only for AI', async () => {
        const h = createHarness();
        h.gameState.phase = 'ACTION_DECISION';
        h.gameState.players[0].position = 3;
        h.gameState.pendingBonusTurn = true;
        h.gameState.players[0].isAI = true;
        h.setupConfig.slots[0].isAI = true;
        const record = h.context.buildGameSaveRecord();
        assert.ok(record);
        h.context.pendingGameSaveRecord = record;
        const resumed = await h.context.resumeSavedGame();
        assert.equal(resumed, true);
        assert.equal(h.gameState.phase, 'ACTION_DECISION');
        assert.ok(h.gameState.aiTimer);
        assert.equal(h.gameState.aiTimer.ms, 650);
    });

    await test('startup offers resume instead of silently creating a fresh game when a save exists', async () => {
        const source = createHarness();
        source.gameState.round = 6;
        const record = source.context.buildGameSaveRecord();
        const seededDB = createFakeIndexedDB(record);
        const h = createHarness({ fakeIDB: seededDB });
        await h.context.initializeGamePersistence();
        assert.equal(h.context.initCalls || 0, 0);
        assert.equal(h.getElement('resumeGameModal').classList.contains('hidden'), false);
        assert.match(h.getElement('resumeGameDetails').textContent, /राउंड 6/);
    });

    await test('startup creates a new game when no saved record exists', async () => {
        const h = createHarness();
        await h.context.initializeGamePersistence();
        assert.equal(h.context.initCalls, 1);
        assert.equal(h.evaluate('gamePersistenceEnabled'), true);
    });

    await test('manual save refuses unstable phases without overwriting the last checkpoint', async () => {
        const h = createHarness();
        h.context.gamePersistenceEnabled = true;
        const initial = h.context.buildGameSaveRecord();
        await h.context.writeStoredGameSave(initial);
        h.gameState.phase = 'DEBT_SETTLEMENT';
        h.gameState.pendingDebt = { amount: 500, onComplete() {} };
        assert.equal(await h.context.saveGameNow(), false);
        const stored = await h.context.readStoredGameSave();
        assert.deepEqual(stored, initial);
        assert.match(h.getElement('gameSaveStatus').textContent, /ऋण/);
    });

    await test('rendering schedules autosave and the header exposes manual save', () => {
        assert.match(html, /function renderAll\(\)[\s\S]*?queueGameSave\(\);/);
        assert.match(html, /id="saveGameNowBtn"[^>]*onclick="saveGameNow\(\)"/);
        assert.match(html, /window\.onload = function \(\)[\s\S]*?initializeGamePersistence\(\);/);
        assert.match(html, /id="resumeGameModal"/);
    });

    console.log('RESULT ' + passed + ' IndexedDB save/resume regression tests passed');
    if (passed !== 11) process.exitCode = 1;
})();
