import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/lib/escapeHtml.js';

test('escapeHtml neutralizes markup in display names', () => {
  assert.equal(
    escapeHtml(`Bob</title><script>alert("x")</script> & 'co'`),
    'Bob&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#039;co&#039;',
  );
});

test('escapeHtml handles nullish and non-string values', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});
