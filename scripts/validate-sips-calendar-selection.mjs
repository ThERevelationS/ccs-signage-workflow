import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { format } from 'date-fns';

// Exercise actual board Calendar handlers in isolation. No network or live
// Work Orders are used. Authenticated browser acceptance remains separate.
const source = readFileSync(new URL('../src/pages/SIPs.jsx', import.meta.url), 'utf8');
const lines = source.split('\n');
const pickers = lines
  .map((line, index) => line.includes('selected={parseLocalDate(wo.sip_revisit_date)}') ? index : -1)
  .filter(index => index >= 0);
assert.equal(pickers.length, 4, 'SIPS should have exactly four board Revisit calendars');

let passed = 0;
const check = (description, run) => {
  run();
  passed++;
  console.log('PASS ' + description);
};

const locations = ['active mobile', 'active desktop', 'Revisit Later mobile', 'Revisit Later desktop'];

for (const [index, pickerLine] of pickers.entries()) {
  const location = locations[index];
  const handlerText = lines.slice(pickerLine + 2, pickerLine + 7).join('\n').trim();
  assert.ok(handlerText.startsWith('onSelect={(date) => {'), location + ' handler is present');
  assert.ok(handlerText.endsWith('}}'), location + ' handler closes');
  const handlerExpression = handlerText
    .replace(/^onSelect=\{/, '')
    .replace(/\}$/, '');

  const setup = () => {
    const calls = [];
    const closes = [];
    const handler = vm.runInNewContext('(' + handlerExpression + ')', {
      wo: { id: 'synthetic-order' },
      format,
      updateWorkOrder: (...args) => calls.push(args),
      setOpenDatePopover: (...args) => closes.push(args),
    });
    return { handler, calls, closes };
  };

  check(location + ': selected day cannot be cleared through a second click', () => {
    assert.match(lines[pickerLine - 1], /\brequired\b/, 'DayPicker requires a selected day');
    const { handler, calls, closes } = setup();
    handler(new Date(2099, 10, 3));
    assert.deepEqual(calls, [['synthetic-order', 'sip_revisit_date', '2099-11-03']]);
    assert.deepEqual(closes, [[null]]);
  });

  check(location + ': empty calendar selection never writes or closes', () => {
    const { handler, calls, closes } = setup();
    handler(undefined);
    handler(null);
    assert.equal(calls.length, 0);
    assert.equal(closes.length, 0);
  });

  check(location + ': selecting a new date only saves the local calendar date', () => {
    const { handler, calls, closes } = setup();
    handler(new Date(2099, 0, 2, 23, 30));
    assert.deepEqual(calls, [['synthetic-order', 'sip_revisit_date', '2099-01-02']]);
    assert.deepEqual(closes, [[null]]);
    assert.match(lines[pickerLine + 1], /disabled=\{\{ before: addDays\(today, 1\) \}\}/);
  });

  check(location + ': explicit clear still opens confirmation', () => {
    assert.ok(
      lines.slice(pickerLine + 7, pickerLine + 25).some(line => line.includes('requestClearRevisit(wo)')),
      location + ' has the explicit Clear Revisit route',
    );
  });

  check(location + ': date trigger shows saving feedback and cannot reopen during save', () => {
    const preceding = lines.slice(Math.max(0, pickerLine - 35), pickerLine).join('\n');
    const triggerIndex = preceding.lastIndexOf('<PopoverTrigger asChild');
    assert.ok(triggerIndex >= 0, location + ' Revisit trigger is present');
    const trigger = preceding.slice(triggerIndex);
    assert.match(trigger, /disabled=\{!isRegistered \|\| savingRevisitIds\.has\(wo\.id\)\}/);
    assert.match(trigger, /disabled=\{savingRevisitIds\.has\(wo\.id\)\}/);
    assert.match(trigger, /aria-busy=\{savingRevisitIds\.has\(wo\.id\)\}/);
    assert.match(trigger, /Saving/, 'Saving status is shown while the date field is locked');
  });
}

console.log(passed + '/' + passed + ' SIPS calendar-selection regression checks passed');
