// Regression coverage for the end-of-match winner presentation.
// Run: node tests/victory-celebration-regression.test.js
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

function makeNode(id) {
    const classes = new Set();
    const attributes = {};
    const properties = {};
    return {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        dataset: {},
        value: 'ALL',
        children: [],
        attributes,
        focusCount: 0,
        style: {
            properties,
            setProperty(name, value) { properties[name] = String(value); }
        },
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) { return classes.has(name); },
            toggle(name, force) {
                const enabled = force === undefined ? !classes.has(name) : Boolean(force);
                if (enabled) classes.add(name); else classes.delete(name);
                return enabled;
            }
        },
        setAttribute(name, value) { attributes[name] = String(value); },
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        focus() { this.focusCount += 1; }
    };
}

function createHarness(options = {}) {
    const nodes = new Map();
    const getNode = id => {
        if (!nodes.has(id)) nodes.set(id, makeNode(id));
        return nodes.get(id);
    };
    ['victoryStats', 'victoryBreakdown', 'victoryDrawMessage'].forEach(id => {
        if (id !== 'victoryDrawMessage') getNode(id).classList.add('hidden');
        else getNode(id).classList.add('hidden');
    });
    const scheduled = [];
    const calls = { render: [], fanfare: 0, confetti: 0, taunts: [], logs: [], banners: 0, ledger: 0 };
    const gameState = {
        phase: options.phase || 'PRE_ROLL',
        round: options.round || 8,
        finalShowdownAnnounced: false,
        players: options.players || [
            { id: 0, name: 'आर्या', bankrupt: false, cash: 8000 },
            { id: 1, name: 'वीर', bankrupt: true, cash: 0 }
        ],
        ownership: options.ownership || {}
    };
    const context = {
        gameState,
        document: {
            getElementById: getNode,
            createElement(tag) {
                const node = makeNode(tag);
                node.tagName = tag;
                return node;
            }
        },
        formatRupee(value) { return '₹' + Math.round(Math.abs(Number(value) || 0)).toLocaleString('en-IN'); },
        getNetWorthBreakdown(playerId) {
            return options.breakdown || {
                cash: 8000, propVal: 4000, buildVal: 1200,
                mortgageDeduction: 500, rescueLoanDebt: 200, total: 12500
            };
        },
        scheduleGameTimeout(fn, delay) { scheduled.push({ fn, delay }); return scheduled.length; },
        sfxVictoryFanfare() { calls.fanfare += 1; },
        renderVictoryPresentation(winner) { calls.render.push(winner ? winner.id : null); },
        launchVictoryConfetti() { calls.confetti += 1; },
        triggerAutomaticTaunt(...args) { calls.taunts.push(args); },
        addLog(...args) { calls.logs.push(args); },
        showCenterScreenBanner() { calls.banners += 1; },
        openLedgerModal() { calls.ledger += 1; },
        scheduled,
        calls,
        nodes,
        getNode
    };
    vm.createContext(context);
    return context;
}

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log('PASS ' + name);
    } catch (err) {
        console.error('FAIL ' + name + ': ' + err.message);
        process.exitCode = 1;
    }
}

test('single surviving player gets one champion reveal, fanfare, confetti and existing final taunt', () => {
    const c = createHarness();
    vm.runInContext(extractFunction('checkWinCondition'), c);
    assert.equal(c.checkWinCondition(), true);
    assert.equal(c.gameState.phase, 'GAME_OVER');
    assert.deepEqual(c.calls.render, [0]);
    assert.equal(c.calls.fanfare, 1);
    assert.equal(c.calls.confetti, 1);
    assert.deepEqual(c.calls.taunts, [[4, 'game-victory', 'आर्या']]);

    assert.equal(c.checkWinCondition(), true);
    assert.equal(c.calls.render.length, 1, 'repeated checks must not replay the reveal');
    assert.equal(c.calls.fanfare, 1);
    assert.equal(c.calls.confetti, 1);
    assert.equal(c.calls.taunts.length, 1);
});

test('zero surviving players gets a draw state without a winner celebration', () => {
    const c = createHarness({
        players: [
            { id: 0, name: 'आर्या', bankrupt: true, cash: 0 },
            { id: 1, name: 'वीर', bankrupt: true, cash: 0 }
        ]
    });
    vm.runInContext(extractFunction('checkWinCondition'), c);
    assert.equal(c.checkWinCondition(), true);
    assert.equal(c.gameState.phase, 'GAME_OVER');
    assert.deepEqual(c.calls.render, [null]);
    assert.equal(c.calls.fanfare, 0);
    assert.equal(c.calls.confetti, 0);
    assert.equal(c.calls.taunts.length, 0);
});

test('two remaining players still trigger the existing final showdown only once', () => {
    const c = createHarness({
        players: [
            { id: 0, name: 'आर्या', bankrupt: false, cash: 4000 },
            { id: 1, name: 'वीर', bankrupt: false, cash: 5000 }
        ]
    });
    vm.runInContext(extractFunction('checkWinCondition'), c);
    assert.equal(c.checkWinCondition(), false);
    assert.equal(c.gameState.finalShowdownAnnounced, true);
    assert.equal(c.calls.banners, 1);
    assert.equal(c.checkWinCondition(), false);
    assert.equal(c.calls.banners, 1);
});

test('winner screen renders real net worth, cash, asset and building counts safely', () => {
    const c = createHarness({
        round: 12,
        ownership: {
            1: { ownerId: 0, houses: 2 },
            2: { ownerId: 0, houses: 4 },
            3: { ownerId: 1, houses: 1 }
        }
    });
    vm.runInContext(extractFunction('renderVictoryPresentation'), c);
    c.renderVictoryPresentation({
        id: 0, name: '<आर्या>', color: '#12abef', icon: 'fa-crown'
    });

    assert.equal(c.getNode('victoryModal').classList.contains('hidden'), false);
    assert.equal(c.getNode('victoryModal').dataset.result, 'champion');
    assert.equal(c.getNode('victoryRoundValue').textContent, 'ROUND 12');
    assert.equal(c.getNode('winnerNameHeading').textContent, '<आर्या> की शाही विजय!');
    assert.equal(c.getNode('victoryNetWorthValue').textContent, '₹12,500');
    assert.equal(c.getNode('victoryCashValue').textContent, '₹8,000');
    assert.equal(c.getNode('victoryPropertiesValue').textContent, '2');
    assert.equal(c.getNode('victoryBuildingsValue').textContent, '6');
    assert.equal(c.getNode('victoryPropertyValue').textContent, '₹4,000');
    assert.equal(c.getNode('victoryBuildValue').textContent, '₹1,200');
    assert.equal(c.getNode('victoryMortgageValue').textContent, '−₹500');
    assert.equal(c.getNode('victoryLoanValue').textContent, '−₹200');
    assert.equal(c.getNode('victoryWinnerIcon').className, 'fa-solid fa-crown');
    assert.equal(c.getNode('victoryPanel').style.properties['--winner-accent'], '#12abef');
    assert.equal(c.getNode('victoryStats').classList.contains('hidden'), false);
    assert.equal(c.getNode('victoryBreakdown').classList.contains('hidden'), false);
    assert.equal(c.getNode('victoryDrawMessage').classList.contains('hidden'), true);
    assert.equal(c.getNode('victoryNewGameButton').focusCount, 1);
});

test('draw presentation clears winner stats and shows a neutral result', () => {
    const c = createHarness();
    vm.runInContext(extractFunction('renderVictoryPresentation'), c);
    c.renderVictoryPresentation({ id: 0, name: 'आर्या', color: '#12abef', icon: 'fa-crown' });
    c.renderVictoryPresentation(null);

    assert.equal(c.getNode('victoryModal').dataset.result, 'draw');
    assert.equal(c.getNode('winnerNameHeading').textContent, 'खेल बराबरी में समाप्त!');
    assert.equal(c.getNode('victoryWinnerIcon').className, 'fa-solid fa-handshake');
    assert.equal(c.getNode('victoryStats').classList.contains('hidden'), true);
    assert.equal(c.getNode('victoryBreakdown').classList.contains('hidden'), true);
    assert.equal(c.getNode('victoryDrawMessage').classList.contains('hidden'), false);
});

test('confetti uses a bounded 42-piece burst and clears its layer after animation', () => {
    const c = createHarness();
    vm.runInContext(extractFunction('launchVictoryConfetti'), c);
    c.launchVictoryConfetti();

    assert.equal(c.getNode('victoryConfetti').children.length, 42);
    assert.equal(c.scheduled.length, 1);
    assert.equal(c.scheduled[0].delay, 5600);
    c.scheduled[0].fn();
    assert.equal(c.getNode('victoryConfetti').children.length, 0);
});

test('final-ledger action closes the celebration and opens the existing passbook', () => {
    const c = createHarness();
    vm.runInContext(extractFunction('openFinalLedgerFromVictory'), c);
    c.openFinalLedgerFromVictory();
    assert.equal(c.getNode('victoryModal').classList.contains('hidden'), true);
    assert.equal(c.calls.ledger, 1);
});

test('victory dialog includes mobile, keyboard-focus, and reduced-motion support', () => {
    assert.match(html, /id="victoryModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /id="victoryNewGameButton"[^>]*type="button"/);
    assert.ok(html.includes('@media (max-width:640px)'));
    assert.ok(html.includes('@media (prefers-reduced-motion:reduce)'));
    assert.ok(html.includes('victoryConfetti'));
    assert.ok(html.includes('victory-taunt-pill'));
});

console.log('RESULT ' + passed + ' victory presentation regression tests passed');
if (passed !== 8) process.exitCode = 1;
