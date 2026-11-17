// Regression tests for automatic use of the game's six existing live taunts.
// Run: node tests/situational-dialogue-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');
const startMarker = '/* AUTOMATIC EXISTING TAUNTS START';
const endMarker = '/* AUTOMATIC EXISTING TAUNTS END */';
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start);
assert.notEqual(start, -1, 'missing original-taunt automation');
assert.ok(end > start, 'missing original-taunt automation end marker');
const automationCode = html.slice(start, end + endMarker.length);

function createHarness(options = {}) {
    const layer = {
        hasBubble: false,
        querySelector(selector) {
            return selector === '.taunt-floating-pill' && this.hasBubble ? {} : null;
        }
    };
    const toggle = {
        attributes: {},
        textContent: '',
        className: '',
        setAttribute(name, value) { this.attributes[name] = String(value); }
    };
    const document = {
        getElementById(id) {
            if (id === 'floatingTauntLayer') return layer;
            if (id === 'autoTauntsToggle') return toggle;
            return null;
        }
    };
    const gameState = {
        started: options.started !== false,
        phase: options.phase || 'PRE_ROLL',
        activeTimers: []
    };
    const scheduled = [];
    const reactions = [];
    let now = 10000;
    class FakeDate extends Date {
        static now() { return now; }
    }
    function scheduleGameTimeout(fn, delay) {
        const item = { fn, delay, cancelled: false };
        scheduled.push(item);
        gameState.activeTimers.push(item);
        return item;
    }
    function clearTimeout(item) {
        if (item) item.cancelled = true;
    }
    const context = vm.createContext({
        document, gameState, scheduleGameTimeout, clearTimeout, Date: FakeDate,
        HINDI_TAUNTS: [
            { id: 0, text: 'पैसा ही पैसा होगा!' },
            { id: 1, text: 'गजब बेइज्जती है यार!' },
            { id: 2, text: 'अरे भाई, माफ़ कर दे!' },
            { id: 3, text: 'कंगाल हो गया रे!' },
            { id: 4, text: 'असली व्यापार सम्राट तो हम हैं!' },
            { id: 5, text: 'अभी तो पार्टी शुरू हुई है!' }
        ],
        triggerTauntReaction(index, speaker) { reactions.push({ index, speaker }); },
        console, Object, Array, String, Number, Boolean, Math
    });
    vm.runInContext(automationCode, context, { timeout: 1000 });
    return {
        context, gameState, scheduled, reactions, layer, toggle,
        advance(ms) { now += ms; },
        runNext() {
            const item = scheduled.shift();
            if (!item) return null;
            gameState.activeTimers = gameState.activeTimers.filter(timer => timer !== item);
            if (!item.cancelled) item.fn();
            return item;
        },
        state(expression) { return vm.runInContext(expression, context); }
    };
}

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('PASS ' + name);
    } catch (error) {
        console.error('FAIL ' + name + ': ' + error.message);
        process.exitCode = 1;
    }
}

test('automatic reactions reuse the original six-index taunt renderer', () => {
    const h = createHarness();
    assert.equal(h.state('autoTauntsEnabled'), true);
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), true);
    assert.equal(h.scheduled.length, 1);
    assert.equal(h.scheduled[0].delay, 120);
    h.runNext();
    assert.deepEqual(h.reactions, [{ index: 5, speaker: 'आर्यन' }]);
});

test('AUTO OFF suppresses automatic reactions but does not disable manual reactions', () => {
    const h = createHarness();
    h.context.setAutoTauntsEnabled(false);
    assert.equal(h.toggle.attributes['aria-pressed'], 'false');
    assert.equal(h.toggle.textContent, '⚡ AUTO OFF');
    assert.equal(h.context.triggerAutomaticTaunt(0, 'jackpot', 'दिव्या'), false);
    assert.equal(h.scheduled.length, 0);
    // The manual button still calls the original renderer directly.
    h.context.triggerTauntReaction(1, 'मीरा');
    assert.deepEqual(h.reactions, [{ index: 1, speaker: 'मीरा' }]);
});

test('AUTO ON/OFF control updates its accessible state and visual label', () => {
    const h = createHarness();
    h.context.setAutoTauntsEnabled(false);
    assert.equal(h.context.toggleAutoTaunts(), true);
    assert.equal(h.toggle.attributes['aria-pressed'], 'true');
    assert.equal(h.toggle.textContent, '⚡ AUTO ON');
    assert.match(h.toggle.className, /bg-emerald-950/);
});

test('global cooldown prevents dialogue bursts from different gameplay events', () => {
    const h = createHarness();
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), true);
    h.runNext();
    h.advance(5000);
    assert.equal(h.context.triggerAutomaticTaunt(2, 'rent-heavy', 'दिव्या'), false);
    assert.equal(h.scheduled.length, 0);
});

test('the same situation cannot repeat until its longer event cooldown expires', () => {
    const h = createHarness();
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), true);
    h.runNext();
    h.advance(12000);
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), false);
    h.advance(19000);
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), true);
});

test('doubles and 6+6 share a separate cooldown so dice reactions stay spaced apart', () => {
    const h = createHarness();
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), true);
    h.runNext();
    h.advance(10000);
    assert.equal(h.context.triggerAutomaticTaunt(0, 'dice-jackpot', 'दिव्या'), false);
    assert.equal(h.scheduled.length, 0);
    h.advance(10000);
    assert.equal(h.context.triggerAutomaticTaunt(0, 'dice-jackpot', 'दिव्या'), true);
});

test('automatic reactions do not overlap a visible manual taunt', () => {
    const h = createHarness();
    h.layer.hasBubble = true;
    assert.equal(h.context.triggerAutomaticTaunt(2, 'rent-heavy', 'कबीर'), false);
    assert.equal(h.scheduled.length, 0);
});

test('pending automatic reaction is cancelled immediately when AUTO is switched off', () => {
    const h = createHarness();
    assert.equal(h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन'), true);
    const pending = h.scheduled[0];
    h.context.setAutoTauntsEnabled(false);
    assert.equal(pending.cancelled, true);
    assert.equal(h.gameState.activeTimers.length, 0);
    h.runNext();
    assert.equal(h.reactions.length, 0);
});

test('cooldown reset clears event history but preserves the Auto preference', () => {
    const h = createHarness();
    h.context.triggerAutomaticTaunt(5, 'doubles', 'आर्यन');
    h.runNext();
    h.context.setAutoTauntsEnabled(false);
    h.context.resetAutomaticTauntCooldowns();
    assert.equal(h.state('autoTauntsEnabled'), false);
    assert.equal(h.state('lastAutoTauntAt'), 0);
    assert.equal(h.state('lastAutoDiceTauntAt'), 0);
    assert.equal(h.state('Object.keys(autoTauntEventTimes).length'), 0);
});

test('game-over blocks ordinary reactions but still allows the winner taunt', () => {
    const h = createHarness({ phase: 'GAME_OVER' });
    assert.equal(h.context.triggerAutomaticTaunt(1, 'jailed', 'आर्यन'), false);
    assert.equal(h.context.triggerAutomaticTaunt(4, 'game-victory', 'दिव्या'), true);
    h.runNext();
    assert.deepEqual(h.reactions, [{ index: 4, speaker: 'दिव्या' }]);
});

test('inactive game and invalid taunt indexes are ignored', () => {
    const notStarted = createHarness({ started: false });
    assert.equal(notStarted.context.triggerAutomaticTaunt(5, 'doubles'), false);
    const invalid = createHarness();
    assert.equal(invalid.context.triggerAutomaticTaunt(6, 'unknown'), false);
    assert.equal(invalid.scheduled.length, 0);
});

test('six original manual buttons and taunt texts remain present; duplicate dialogue UI is removed', () => {
    for (let index = 0; index < 6; index++) {
        assert.match(html, new RegExp('onclick="triggerTauntReaction\\(' + index + '\\)"'));
    }
    for (const line of [
        'पैसा ही पैसा होगा!', 'गजब बेइज्जती है यार!', 'अरे भाई, माफ़ कर दे!',
        'कंगाल हो गया रे!', 'असली व्यापार सम्राट तो हम हैं!', 'अभी तो पार्टी शुरू हुई है!'
    ]) assert.ok(html.includes(line), 'missing original taunt: ' + line);

    assert.equal(html.includes('SITUATIONAL_DIALOGUES'), false);
    assert.equal(html.includes('context-dialogue-bubble'), false);
    assert.equal(html.includes('autoDialogueToggle'), false);
    assert.match(html, /id="autoTauntsToggle"[^>]*aria-pressed="true"/);
});

test('ordinary dice rolls stay silent; doubles and 6+6 use their intended existing reactions', () => {
    const rollStart = html.indexOf('function handleRollDice()');
    const nextFunction = html.indexOf(String.fromCharCode(10) + '        function ', rollStart + 1);
    assert.notEqual(rollStart, -1, 'missing dice roll handler');
    assert.ok(nextFunction > rollStart, 'could not isolate dice roll handler');
    const rollHandler = html.slice(rollStart, nextFunction);
    assert.match(rollHandler, /const isDoubles = d1 === d2;/);
    assert.ok(
        rollHandler.includes("if (isDoubles && !(d1 === 6 && d2 === 6) && typeof triggerAutomaticTaunt === 'function') triggerAutomaticTaunt(5, 'doubles', p.name);"),
        'only non-jackpot doubles should trigger the party reaction'
    );
    assert.ok(
        rollHandler.includes("triggerAutomaticTaunt(0, 'dice-jackpot', p.name);"),
        '6+6 should trigger the jackpot reaction'
    );
    assert.equal(rollHandler.split('triggerAutomaticTaunt(').length - 1, 2,
        'ordinary rolls must not contain any automatic dialogue trigger');
});

test('all six original taunts are mapped to matching gameplay events', () => {
    for (const hook of [
        "triggerAutomaticTaunt(0, 'dice-jackpot'",
        "triggerAutomaticTaunt(0, 'rest-jackpot'",
        "triggerAutomaticTaunt(1, 'jailed'",
        "triggerAutomaticTaunt(1, 'rent-tease'",
        "triggerAutomaticTaunt(2, 'rent-heavy'",
        "triggerAutomaticTaunt(2, 'debt-crisis'",
        "triggerAutomaticTaunt(3, 'rent-shortfall'",
        "triggerAutomaticTaunt(3, 'bankruptcy'",
        "triggerAutomaticTaunt(4, 'monopoly'",
        "triggerAutomaticTaunt(4, 'auction-victory'",
        "triggerAutomaticTaunt(4, 'game-victory'",
        "triggerAutomaticTaunt(5, 'doubles'"
    ]) assert.ok(html.includes(hook), 'missing situation hook: ' + hook);
});

console.log('RESULT ' + passed + ' automatic existing-taunt regression tests passed');
