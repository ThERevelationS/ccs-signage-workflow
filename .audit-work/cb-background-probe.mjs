import { writeFileSync } from 'node:fs';

await new Promise((resolve) => setTimeout(resolve, 5000));
writeFileSync('.audit-work/cb-background-probe.done', 'completed\n');
