import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = 'base44/functions/smartsheetSyncAction';
const files = [];
function walk(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p);
		else {
			files.push({
				path: p.slice(ROOT.length + 1).split('\\').join('/'),
				content: readFileSync(p, 'utf8'),
			});
		}
	}
}
walk(join(ROOT, 'base44'));

const auth = JSON.parse(
	readFileSync(join(homedir(), '.base44/auth/auth.json'), 'utf8')
);
const res = await fetch(
	'https://app.base44.com/api/apps/68dfcc5e57bbbc35387da97c/backend-functions/smartsheetSyncAction',
	{
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${auth.accessToken}`,
		},
		body: JSON.stringify({
			entry: 'base44/functions/smartsheetSyncAction/entry.ts',
			files,
			automations: [],
		}),
	}
);
console.log(res.status, await res.text());
