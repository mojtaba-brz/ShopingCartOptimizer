const fs = require('node:fs');
const engine = require('../../cartoptimizer/web/engine.js');
(async () => {
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  const results = [];
  for (const input of data) results.push(await engine.optimize(input, {timeLimit:30000, stateLimit:1000000}));
  process.stdout.write(JSON.stringify(results));
})().catch((error) => { console.error(error); process.exit(1); });
