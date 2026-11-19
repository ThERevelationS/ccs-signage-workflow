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
