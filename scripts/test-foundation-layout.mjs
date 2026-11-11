// O-032/O-040 layout canvas unit tests: real model + real panel component.
// Uses --preserve-symlinks for .audit-work bundles.
import esbuild from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const OUT = '.audit-work/foundation-layout10';
const STUBS = {
  'lucide-react': `export const Move=()=>null;export const ZoomIn=()=>null;export const ZoomOut=()=>null;`,
};
const plug = { name: 's', setup(b) {
  b.onResolve({ filter: /.*/ }, a => (STUBS[a.path] ? { path: path.resolve('s-' + a.path.replace(/[^a-z0-9]/gi, '_')), namespace: 's' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 's' }, a => ({ contents: STUBS[Object.keys(STUBS).find(k => path.resolve('s-' + k.replace(/[^a-z0-9]/gi, '_')) === a.path)], loader: 'js', resolveDir: path.resolve('.') }));
}};

const cfg = (entry, name) => ({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: true,
  external: ['react', 'react-dom', 'react-test-renderer', 'react-dom/*', 'react/*', 'scheduler', 'scheduler/*'],
  plugins: [plug], loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic',
  outfile: `${OUT}/${name}.mjs`,
});
await esbuild.build(cfg('src/components/estimator/foundation/FoundationLayoutCanvas.jsx', 'panel'));
await esbuild.build(cfg('src/components/estimator/foundation/foundationLayoutModel.js', 'model'));

globalThis.window = {};
const model = await import(pathToFileURL(path.resolve(`${OUT}/model.mjs`)));
const Panel = (await import(pathToFileURL(path.resolve(`${OUT}/panel.mjs`)))).default;
const React = (await import('react')).default;
const { create, act } = await import('react-test-renderer');
const { layoutPointInches, foundationLayoutFootprint, layoutPositionInches } = model;

let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log('ok', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); } };

// ---- model cases ----
await ok('point: rect(100,50,480x320) point(340,210) -> 240,160', async () => {
  const p = layoutPointInches(340, 210, { left: 100, top: 50, width: 480, height: 320 });
  assert.equal(p.x_inches, 240); assert.equal(p.z_inches, 160);
});
await ok('point: zoom2 rect(960x640) point(580,370) -> 240,160', async () => {
  const p = layoutPointInches(580, 370, { left: 100, top: 50, width: 960, height: 640 });
  assert.equal(p.x_inches, 240); assert.equal(p.z_inches, 160);
});
await ok('point: zoom.5 rect(240x160) point(220,130) -> 240,160', async () => {
  const p = layoutPointInches(220, 130, { left: 100, top: 50, width: 240, height: 160 });
  assert.equal(p.x_inches, 240); assert.equal(p.z_inches, 160);
});
await ok('point: negative scroll rects + invalid rects -> null, never NaN', async () => {
  const p = layoutPointInches(-60, -30, { left: -100, top: -50, width: 480, height: 320 });
  assert.equal(p.x_inches, 40); assert.equal(p.z_inches, 20);
  for (const r of [{ left: 0, top: 0, width: 0, height: 10 }, { left: 0, top: 0, width: 10, height: -1 }, null, { left: NaN, top: 0, width: 10, height: 10 }]) {
    assert.equal(layoutPointInches(5, 5, r), null);
  }
  assert.equal(layoutPointInches(NaN, 5, { left: 0, top: 0, width: 10, height: 10 }), null);
});
await ok('footprint: 48x36 and pillar 24x24 scale equally; invalid -> null', async () => {
  assert.deepEqual(foundationLayoutFootprint({ length_inches: 48, width_inches: 36 }), { width: 48, depth: 36 });
  assert.deepEqual(foundationLayoutFootprint({ foundation_type: 'pillar', diameter: 24 }), { width: 24, depth: 24 });
  assert.deepEqual(foundationLayoutFootprint({ length_inches: '48', width_inches: '36' }), { width: 48, depth: 36 });
  for (const bad of [{}, { length_inches: 0, width_inches: 36 }, { length_inches: -5, width_inches: 36 }, { length_inches: 'x', width_inches: 36 }, { length_inches: true, width_inches: 36 }, { length_inches: [4], width_inches: 36 }, { length_inches: Infinity, width_inches: 36 }]) {
    assert.equal(foundationLayoutFootprint(bad), null);
  }
});
await ok('position: null/undefined -> 0; invalid -> invalid flag, no fabricate', async () => {
  assert.deepEqual(layoutPositionInches({}), { valid: true, x_inches: 0, z_inches: 0 });
  assert.equal(layoutPositionInches({ x_inches: 'bad' }).valid, false);
  assert.equal(layoutPositionInches({ z_inches: [] }).valid, false);
  assert.deepEqual(layoutPositionInches({ x_inches: -30, z_inches: 40 }), { valid: true, x_inches: -30, z_inches: 40 });
});

// ---- panel cases ----
const mkRect = (w, h) => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h });
const nodeMock = (rect) => () => ({ getBoundingClientRect: () => rect, setPointerCapture: () => { }, releasePointerCapture: () => { }, addEventListener: () => { } });
const mount = async (props, rect = mkRect(480, 320)) => {
  let c;
  await act(async () => { c = create(React.createElement(Panel, props), { createNodeMock: nodeMock(rect) }); });
  return c;
};
const canvasOf = (c) => c.root.findAll(el => el.props?.onPointerMove)[0];
const itemOf = (c, label = 'Move Foundation 1') => c.root.findAll(el => el.props?.['aria-label'] === label)[0];
const ev = (x, y, pointerId = 42) => ({ button: 0, pointerId, clientX: x, clientY: y, preventDefault: () => { }, stopPropagation: () => { } });
const item = { component_id: 'i1', x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36 };

for (const [zx, rect] of [[1, mkRect(480, 320)], [2, mkRect(960, 640)], [0.5, mkRect(240, 160)]]) {
  await ok(`drag zoom${zx}: grab world(144,98) -> target(240,160) => corner 216,142`, async () => {
    const moves = [];
    const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) }, rect);
    const world = (wx, wz) => ({ x: wx * rect.width / 480, y: wz * rect.height / 320 });
    const g = world(144, 98);
    await act(async () => { itemOf(c).props.onPointerDown(ev(g.x, g.y)); });
    const t1 = world(200, 140), t2 = world(220, 150), t3 = world(240, 160);
    for (const t of [t1, t2, t3]) await act(async () => { canvasOf(c).props.onPointerMove(ev(t.x, t.y)); });
    assert.equal(moves.length, 0, 'no commit before drop');
    await act(async () => { canvasOf(c).props.onPointerUp(ev(t3.x, t3.y)); });
    assert.equal(moves.length, 1, 'exactly one commit');
    assert.equal(moves[0][0], 0);
    assert.deepEqual(moves[0][1], { x_inches: 216, z_inches: 142 });
  });
}

await ok('cancel + wrong pointer + repeated up -> no/exactly-once commit', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160, 99)); }); // wrong pointer
  await act(async () => { canvasOf(c).props.onPointerCancel({ pointerId: 42 }); });
  assert.equal(moves.length, 0);
  // second gesture commits exactly once even with repeated up
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 1);
});

await ok('reorder resolves new index by canonical id; delete cancels', async () => {
  const items = [
    { component_id: 'i0', x_inches: 10, z_inches: 10, length_inches: 24, width_inches: 24 },
    { ...item }, // i1 at index 1
  ];
  let cur = items;
  const moves = [];
  const c = await mount({ items: cur, onMoveItem: (i, p) => moves.push([i, p]) });
  const it1 = c.root.findAll(el => el.props?.['aria-label'] === 'Move Foundation 2')[0];
  await act(async () => { it1.props.onPointerDown(ev(144, 98)); });
  // reorder: i1 moves to index 0 during gesture (metadata-only reorder keeps drag)
  cur = [cur[1], cur[0]];
  await act(async () => { c.update(React.createElement(Panel, { items: cur, onMoveItem: (i, p) => moves.push([i, p]) })); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 1);
  assert.equal(moves[0][0], 0, 'committed on CURRENT index');
  // delete during gesture -> cancel
  const moves2 = [];
  const c2 = await mount({ items: cur, onMoveItem: (i, p) => moves2.push([i, p]) });
  const it2 = c2.root.findAll(el => el.props?.['aria-label'] === 'Move Foundation 1')[0];
  await act(async () => { it2.props.onPointerDown(ev(144, 98)); });
  await act(async () => { c2.update(React.createElement(Panel, { items: [cur[1]], onMoveItem: (i, p) => moves2.push([i, p]) })); });
  await act(async () => { canvasOf(c2).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves2.length, 0, 'deleted item -> no commit');
});

await ok('authoritative mid-drag change cancels commit', async () => {
  const moves = [];
  let cur = [{ ...item }];
  const c = await mount({ items: cur, onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  cur = [{ ...item, x_inches: 999 }];
  await act(async () => { c.update(React.createElement(Panel, { items: cur, onMoveItem: (i, p) => moves.push([i, p]) })); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 0, 'authoritative change cancels');
});

await ok('keyboard: arrows 1in, Shift 12in, one commit each; readonly/invalid safe', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  const it = itemOf(c);
  assert.equal(it.props.role, 'button'); assert.equal(it.props.tabIndex, 0);
  await act(async () => { it.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => { }, stopPropagation: () => { } }); });
  await act(async () => { it.props.onKeyDown({ key: 'ArrowDown', shiftKey: true, preventDefault: () => { }, stopPropagation: () => { } }); });
  await act(async () => { it.props.onKeyDown({ key: 'ArrowLeft', ctrlKey: true, preventDefault: () => { }, stopPropagation: () => { } }); });
  assert.deepEqual(moves.map(m => m[1]), [{ x_inches: 121, z_inches: 80 }, { x_inches: 120, z_inches: 92 }]);
  // readonly
  const c2 = await mount({ items: [{ ...item }] });
  assert.equal(itemOf(c2, 'Move Foundation 1'), undefined, 'readonly has no move affordance');
  // invalid -> note + non-draggable
  const c3 = await mount({ items: [{ component_id: 'b1', x_inches: 'bad', z_inches: 5, length_inches: 0, width_inches: 10 }], onMoveItem: () => { } });
  const notes = JSON.stringify(c3.root.findAll(el => el.type === 'p').map(p => p.children));
  assert.ok(notes.includes('needs valid dimensions/coordinates'), 'invalid note shown');
  assert.equal(c3.root.findAll(el => el.props?.role === 'button').length, 0, 'invalid not draggable');
});

await ok('no drag without move -> no callback; props immutability', async () => {
  const moves = [];
  const orig = { ...item };
  const c = await mount({ items: [orig], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(144, 98)); }); // zero movement
  assert.equal(moves.length, 0, 'no commit when unchanged');
  assert.deepEqual(orig, item, 'input untouched');
});

await ok('id-less legacy index drag works; count change cancels', async () => {
  const moves = [];
  const idless = { x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36 };
  const c = await mount({ items: [idless], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 1, 'id-less row drags via index identity');
  assert.deepEqual(moves[0][1], { x_inches: 216, z_inches: 142 });
  const moves2 = [];
  const c2 = await mount({ items: [idless], onMoveItem: (i, p) => moves2.push([i, p]) });
  await act(async () => { itemOf(c2).props.onPointerDown(ev(144, 98)); });
  await act(async () => { c2.update(React.createElement(Panel, { items: [idless, { component_id: 'x', x_inches: 0, z_inches: 0, length_inches: 10, width_inches: 10 }], onMoveItem: (i, p) => moves2.push([i, p]) })); });
  await act(async () => { canvasOf(c2).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves2.length, 0, 'length change cancels index-identity drag');
});

await ok("canonical id 'idx-custom' and numeric legacy id 42 resolve", async () => {
  const moves = [];
  const c = await mount({ items: [{ component_id: 'idx-custom', x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36 }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 1, 'idx- canonical id not misclassified');
  const moves2 = [];
  const c2 = await mount({ items: [{ id: 42, x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36 }], onMoveItem: (i, p) => moves2.push([i, p]) });
  await act(async () => { itemOf(c2).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c2).props.onPointerMove(ev(240, 160)); });
  await act(async () => { c2.update(React.createElement(Panel, { items: [{ component_id: 'a', x_inches: 5, z_inches: 5, length_inches: 10, width_inches: 10 }, { id: 42, x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36 }], onMoveItem: (i, p) => moves2.push([i, p]) })); });
  await act(async () => { canvasOf(c2).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves2.length, 1); assert.equal(moves2[0][0], 1, 'numeric legacy id resolves reordered index');
});

await ok('wrong-pointer cancel/lostcapture ignored; second down ignored; primary continues', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerCancel({ pointerId: 99 }); });
  await act(async () => { canvasOf(c).props.onLostPointerCapture({ pointerId: 99 }); });
  await act(async () => { itemOf(c).props.onPointerDown({ ...ev(200, 120), pointerId: 99, isPrimary: true }); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 1, 'primary drag survived foreign cancel/second down');
  assert.deepEqual(moves[0][1], { x_inches: 216, z_inches: 142 });
});

await ok('callback removed mid-gesture: no throw, no write', async () => {
  const c = await mount({ items: [{ ...item }], onMoveItem: () => {} });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { c.update(React.createElement(Panel, { items: [{ ...item }] })); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
});

await ok('release point used for final corner; stationary no commit', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(200, 140)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.deepEqual(moves[0][1], { x_inches: 216, z_inches: 142 }, 'final corner from release point');
  const moves2 = [];
  const frac = { component_id: 'f1', x_inches: 120.4, z_inches: 80.2, length_inches: 48, width_inches: 36 };
  const c2 = await mount({ items: [frac], onMoveItem: (i, p) => moves2.push([i, p]) });
  await act(async () => { itemOf(c2).props.onPointerDown(ev(144.4, 98.2)); });
  await act(async () => { canvasOf(c2).props.onPointerMove(ev(144.4, 98.2)); });
  await act(async () => { canvasOf(c2).props.onPointerUp(ev(144.4, 98.2)); });
  assert.equal(moves2.length, 0, 'raw-unchanged fractional corner does not commit');
});

await ok('authoritative invalid-coords + type change cancel (fingerprint)', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { c.update(React.createElement(Panel, { items: [{ ...item, x_inches: 'bad' }], onMoveItem: (i, p) => moves.push([i, p]) })); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 0, 'valid->invalid coordinate change cancels');
  const moves2 = [];
  const c2 = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves2.push([i, p]) });
  await act(async () => { itemOf(c2).props.onPointerDown(ev(144, 98)); });
  await act(async () => { c2.update(React.createElement(Panel, { items: [{ ...item, foundation_type: 'pillar', diameter: 24 }], onMoveItem: (i, p) => moves2.push([i, p]) })); });
  await act(async () => { canvasOf(c2).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves2.length, 0, 'foundation_type change cancels');
});

await ok('stale handler after unmount cannot commit', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  const canvasProps = canvasOf(c).props;
  await act(async () => { c.unmount(); });
  canvasProps.onPointerUp(ev(240, 160));
  assert.equal(moves.length, 0, 'unmounted gesture cannot commit');
});

await ok('capture throw handled safely (no crash, no commit)', async () => {
  const moves = [];
  const throwingMock = () => ({ getBoundingClientRect: () => mkRect(480, 320), setPointerCapture: () => { throw new Error('nope'); }, releasePointerCapture: () => { } });
  let c;
  await act(async () => { c = create(React.createElement(Panel, { items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) }), { createNodeMock: throwingMock }); });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(240, 160)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(240, 160)); });
  assert.equal(moves.length, 0, 'capture failure aborts gesture cleanly');
});

await ok('style: 48x36 -> 10%/11.25%; pillar 24 -> 5%/7.5%', async () => {
  const c = await mount({ items: [{ ...item }], onMoveItem: () => {} });
  const st = itemOf(c).props.style;
  assert.equal(st.width, '10%'); assert.equal(st.height, '11.25%');
  const c2 = await mount({ items: [{ component_id: 'p1', x_inches: 0, z_inches: 0, foundation_type: 'pillar', diameter: 24 }], onMoveItem: () => {} });
  const st2 = itemOf(c2).props.style;
  assert.equal(st2.width, '5%'); assert.equal(st2.height, '7.5%');
});


await ok('fingerprint valid-bit: valid(0,0) -> invalid(bad,0) cancels', async () => {
  const moves = [];
  const zeroItem = { component_id: 'z1', x_inches: 0, z_inches: 0, length_inches: 48, width_inches: 36 };
  const c = await mount({ items: [zeroItem], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(24, 18)); }); // grab inside 0,0 item
  await act(async () => { c.update(React.createElement(Panel, { items: [{ ...zeroItem, x_inches: 'bad' }], onMoveItem: (i, p) => moves.push([i, p]) })); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(120, 80)); });
  assert.equal(moves.length, 0, 'valid(0,0)->invalid coords cancels without valid-bit false negative');
});

await ok('sub-inch wiggle rounding to same corner: zero callbacks', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  await act(async () => { itemOf(c).props.onPointerDown(ev(144, 98)); });
  await act(async () => { canvasOf(c).props.onPointerMove(ev(144.3, 98.2)); });
  await act(async () => { canvasOf(c).props.onPointerUp(ev(144.3, 98.2)); });
  assert.equal(moves.length, 0, 'rounded-to-same corner emits no commit');
});

await ok('stale keyboard handler after unmount: zero callbacks', async () => {
  const moves = [];
  const c = await mount({ items: [{ ...item }], onMoveItem: (i, p) => moves.push([i, p]) });
  const onKeyDown = itemOf(c).props.onKeyDown;
  await act(async () => { c.unmount(); });
  onKeyDown({ key: 'ArrowRight', preventDefault: () => { }, stopPropagation: () => { } });
  assert.equal(moves.length, 0, 'stale keydown cannot commit');
});

console.log(`PASS layout passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
