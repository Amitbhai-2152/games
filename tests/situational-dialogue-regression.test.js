// Situational live-dialogue regression tests. Run: node tests/situational-dialogue-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');
const startMarker = '/* SITUATIONAL DIALOGUE ENGINE START';
const endMarker = '/* SITUATIONAL DIALOGUE ENGINE END */';
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start);
assert.notEqual(start, -1, 'missing situational dialogue engine');
assert.ok(end > start, 'missing situational dialogue engine end marker');
const engineCode = html.slice(start, end + endMarker.length);

function makeElement(tagName) {
    return {
        tagName,
        children: [],
        attributes: {},
        className: '',
        textContent: '',
        parentNode: null,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        remove() {
            if (!this.parentNode) return;
            this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            this.parentNode = null;
        }
    };
}

function createHarness() {
    const layer = makeElement('div');
    const liveRegion = makeElement('span');
    const toggle = makeElement('button');
    const elements = {
        floatingTauntLayer: layer,
        autoDialogueLiveRegion: liveRegion,
        autoDialogueToggle: toggle
    };
    const document = {
        getElementById(id) { return elements[id] || null; },
        createElement(tagName) { return makeElement(tagName); }
    };
    const gameState = { started: true, activeTimers: [] };
    const scheduled = [];
    let now = 10000;
    class FakeDate extends Date {
        static now() { return now; }
    }
    function scheduleGameTimeout(fn, delay) {
        const timer = { fn, delay, cancelled: false };
        scheduled.push(timer);
        gameState.activeTimers.push(timer);
        return timer;
    }
    function clearTimeout(timer) {
        if (timer) timer.cancelled = true;
    }
    const context = vm.createContext({
        document, gameState, scheduleGameTimeout, clearTimeout, Date: FakeDate,
        console, Object, Array, String, Number, Boolean, Math
    });
    vm.runInContext(engineCode, context, { timeout: 1000 });
    return {
        context, layer, liveRegion, toggle, gameState, scheduled,
        advance(ms) { now += ms; },
        runNext() {
            const timer = scheduled.shift();
            if (!timer) return null;
            gameState.activeTimers = gameState.activeTimers.filter(item => item !== timer);
            if (!timer.cancelled) timer.fn();
            return timer;
        },
        state(expression) { return vm.runInContext(expression, context); }
    };
}

const passed = [];
function test(name, fn) {
    try {
        fn();
        passed.push(name);
        console.log('PASS ' + name);
    } catch (error) {
        console.error('FAIL ' + name + ': ' + error.message);
        process.exitCode = 1;
    }
}

test('automatic dialogue is enabled by default and reflects the actual situation', () => {
    const h = createHarness();
    assert.equal(h.state('liveDialogueState.enabled'), true);
    assert.equal(h.context.queueSituationalDialogue('property_opportunity', { name: 'आर्यन' }, {
        space: 'पटना', amount: '₹500'
    }), true);
    assert.equal(h.layer.children.length, 1);
    const bubble = h.layer.children[0];
    assert.equal(bubble.className.includes('context-dialogue-bubble'), true);
    assert.match(bubble.children[1].children[0].textContent, /आर्यन कहते हैं/);
    assert.match(bubble.children[1].children[1].textContent, /पटना/);
    assert.match(bubble.children[1].children[1].textContent, /₹500/);
});

test('dynamic player names are rendered as text and never as injected markup', () => {
    const h = createHarness();
    const unsafeLookingName = '<img src=x onerror=alert(1)>';
    h.context.queueSituationalDialogue('doubles', { name: unsafeLookingName });
    const bubble = h.layer.children[0];
    const header = bubble.children[1].children[0];
    assert.equal(header.textContent.includes(unsafeLookingName), true);
    assert.equal(Object.prototype.hasOwnProperty.call(bubble, 'innerHTML'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(header, 'innerHTML'), false);
});

test('same situation is throttled during its cooldown window', () => {
    const h = createHarness();
    assert.equal(h.context.queueSituationalDialogue('doubles', { name: 'दिव्या' }), true);
    assert.equal(h.context.queueSituationalDialogue('doubles', { name: 'दिव्या' }), false);
    assert.equal(h.layer.children.length, 1);
    h.advance(2600);
    h.runNext(); // expire the first bubble
    h.advance(1);
    assert.equal(h.context.queueSituationalDialogue('doubles', { name: 'दिव्या' }), true);
});

test('queue remains bounded and a critical moment can replace a lower-priority line', () => {
    const h = createHarness();
    h.context.queueSituationalDialogue('doubles', { name: 'खिलाड़ी' });
    h.context.queueSituationalDialogue('property_opportunity', { name: 'खिलाड़ी' }, { space: 'पटना' });
    h.context.queueSituationalDialogue('build', { name: 'खिलाड़ी' }, { space: 'पटना' });
    h.context.queueSituationalDialogue('mortgage_on', { name: 'खिलाड़ी' }, { space: 'पटना' });
    h.context.queueSituationalDialogue('world_event', null, { event: 'मानसून' });
    h.context.queueSituationalDialogue('jackpot', { name: 'खिलाड़ी' }, { amount: '₹2,000' });
    assert.equal(h.state('liveDialogueState.queue.length'), 4);
    assert.equal(h.state('liveDialogueState.queue.some(item => item.text.includes("जैकपॉट"))'), true);
});

test('AUTO OFF cancels the pending animation, clears queued lines and hides the current bubble', () => {
    const h = createHarness();
    h.context.queueSituationalDialogue('doubles', { name: 'कबीर' });
    h.context.queueSituationalDialogue('build', { name: 'कबीर' }, { space: 'दिल्ली' });
    assert.equal(h.layer.children.length, 1);
    assert.equal(h.context.setAutoDialogueEnabled(false), false);
    assert.equal(h.state('liveDialogueState.queue.length'), 0);
    assert.equal(h.state('liveDialogueState.active'), false);
    assert.equal(h.layer.children.length, 0);
    assert.equal(h.toggle.attributes['aria-pressed'], 'false');
    assert.equal(h.toggle.textContent, '⚡ AUTO OFF');
    assert.equal(h.gameState.activeTimers.length, 0);
});

test('new-game reset clears pending dialogue without changing the ON/OFF preference', () => {
    const h = createHarness();
    h.context.queueSituationalDialogue('doubles', { name: 'मीरा' });
    h.context.resetSituationalDialogueQueue();
    assert.equal(h.state('liveDialogueState.queue.length'), 0);
    assert.equal(h.state('liveDialogueState.active'), false);
    assert.equal(h.layer.children.length, 0);
    assert.equal(h.state('liveDialogueState.enabled'), true);
});

test('dialogue UI is accessible, has a real toggle and respects reduced motion', () => {
    assert.match(html, /id="autoDialogueToggle"[^>]*aria-pressed="true"/);
    assert.match(html, /onclick="toggleAutoDialogue\(\)"/);
    assert.match(html, /id="autoDialogueLiveRegion"[^>]*aria-live="polite"/);
    assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.context-dialogue-bubble \{ animation: none !important;/);
    assert.match(html, /queueSituationalDialogue\('rent_due'/);
    assert.match(html, /queueSituationalDialogue\('auction_win'/);
    assert.match(html, /queueSituationalDialogue\('trade_success'/);
    assert.match(html, /queueSituationalDialogue\('bankruptcy'/);
});

console.log('RESULT ' + passed.length + ' situational dialogue regression tests passed');
