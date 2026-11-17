// Static regression coverage for the game's phone and tablet layout rules.
// Run: node tests/mobile-layout-regression.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'bharatiya_vyapari_FINAL (2).html'), 'utf8');
const marker = '/* Full-game mobile and tablet layout:';
const start = html.lastIndexOf(marker);
assert.notEqual(start, -1, 'missing full-game responsive CSS block');
const styleEnd = html.indexOf('</style>', start);
assert.notEqual(styleEnd, -1, 'responsive CSS must stay inside the document style block');
const css = html.slice(start, styleEnd);

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

test('phone layout uses a single fluid content column and preserves page scrolling', () => {
    assert.match(css, /@media\s*\(max-width:\s*767px\)/);
    assert.match(css, /body\s*>\s*main\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    assert.match(css, /body\s*\{\s*padding-bottom:\s*calc\(4\.75rem\s*\+\s*env\(safe-area-inset-bottom\)\)/);
});

test('the board scales to the device width without forcing horizontal overflow', () => {
    assert.match(css, /\.physical-board-wrapper\s*\{[^}]*width:\s*min\(100%,\s*calc\(100vw\s*-\s*22px\)\)/s);
    assert.match(css, /\.physical-board-wrapper\.view-3d\s*\{[^}]*transform:\s*rotateX\(8deg\)\s*scale\(\.985\)/s);
    assert.match(css, /\.board-center\s*\{\s*padding:\s*3px/s);
});

test('touch controls and the fixed mobile navigation respect safe-area insets', () => {
    assert.match(html, /<nav id="mobileQuickNav"[^>]*>/);
    assert.match(css, /#mobileQuickNav\s*\{[^}]*env\(safe-area-inset-bottom\)/s);
    assert.match(css, /#mobileQuickNav button\s*\{[^}]*min-height:\s*44px/s);
    assert.match(css, /#centerActionButtons button\s*\{[^}]*min-height:\s*44px/s);
});

test('phone player cards expand naturally instead of trapping content in a short nested scroller', () => {
    assert.match(css, /#playersListContainer\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible/s);
    assert.match(css, /@media\s*\(min-width:\s*420px\)\s*and\s*\(max-width:\s*767px\)/);
    assert.match(css, /#playersListContainer\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('tablet layout places the board above two readable side panels', () => {
    assert.match(css, /@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023px\)/);
    assert.match(css, /body\s*>\s*main\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /#centerBoardSection\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
});

test('modal panels can scroll within short phone viewports and avoid unsafe screen edges', () => {
    assert.match(css, /body\s*>\s*div\[id\$="Modal"\]:not\(#victoryModal\)\s*\{[^}]*safe-area-inset-top/s);
    assert.match(css, /max-height:\s*calc\(100dvh\s*-\s*1\.1rem\s*-\s*env\(safe-area-inset-top\)\s*-\s*env\(safe-area-inset-bottom\)\)/);
    assert.match(css, /overscroll-behavior:\s*contain/);
});

test('responsive layout overrides laptop cockpit locking when the viewport becomes narrow', () => {
    assert.match(css, /body\.laptop-cockpit-mode\s*\{[^}]*height:\s*auto\s*!important/);
    assert.match(css, /body\.laptop-cockpit-mode main\s*\{[^}]*overflow:\s*visible\s*!important/s);
    assert.match(css, /@media\s*\(max-width:\s*380px\)/);
    assert.match(css, /@media\s*\(max-width:\s*767px\)\s*and\s*\(orientation:\s*landscape\)/);
});

console.log('RESULT ' + passed + ' mobile layout regression tests passed');
if (passed !== 7) process.exitCode = 1;
