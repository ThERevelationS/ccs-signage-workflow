import assert from 'node:assert/strict';
import { approvalWatchError, approvalWatchIndex, changeApprovalWatch, listApprovalWatches } from '../src/components/estimator/estimateApprovalWatch.js';

const estimate = { id: 'estimate-1', project_name: 'Example' };
const target = { entity: 'AllInOneEstimate', record_id: estimate.id, field: 'status' };
let watches = [{ entity: 'Other', record_id: 'x', field: 'status' }];
const calls = [];
const invoke = async (name, payload) => {
  calls.push({ name, ...payload });
  assert.equal(payload.session_token, 'current-session');
  if (payload.action === 'set_watch') watches.push(target);
  if (payload.action === 'clear_watch') watches.splice(payload.index, 1);
  return { data: { success: true, watches: [...watches] } };
};
const args = { invoke, getToken: () => 'current-session', estimate };
assert.equal(await changeApprovalWatch({ ...args, watching: false }), true);
assert.deepEqual(calls.map((c) => c.action), ['set_watch', 'list_watches']);
watches.unshift({ entity: 'Other', record_id: 'new', field: 'status' });
calls.length = 0;
assert.equal(await changeApprovalWatch({ ...args, watching: true }), false);
assert.deepEqual(calls.map((c) => c.action), ['list_watches', 'clear_watch', 'list_watches']);
assert.equal(calls[1].index, 2, 'clear uses a freshly listed index');
assert.notEqual(calls[0].request_nonce, calls[2].request_nonce, 'each read bypasses the TTL cache');
assert.equal(approvalWatchIndex(watches, estimate.id), -1);
assert.equal(approvalWatchError({ response: { status: 401 } }), 'Your session expired — sign in again.');
assert.equal(approvalWatchError(new Error('Request failed with status code 401')), 'Your session expired — sign in again.');
await assert.rejects(listApprovalWatches({ invoke, sessionToken: '' }), (error) => error.status === 401);
console.log('PASS approval watch: current token, fresh index, refresh, and friendly 401');
