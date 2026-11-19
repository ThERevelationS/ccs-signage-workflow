
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
  const it = itemOf(c);
  await act(async () => { c.unmount(); });
  it.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => { } });
  assert.equal(moves.length, 0, 'stale keydown cannot commit');
});
