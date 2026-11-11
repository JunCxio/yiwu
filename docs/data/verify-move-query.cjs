const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'move-query-0.6.110.json')));
const sourceFile = process.argv[2] || path.join(root, 'index.html');
const source = fs.readFileSync(sourceFile, 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(hash(source), data.releaseSHA256, '请传入报告指定的0.6.110源码');
assert.equal(source.split(data.patch.after).length, 2);
const candidate = source.replaceAll('0.6.110', '0.6.109').replace('走法查询提速', '末轮蓄势止损');
const baseline = candidate.replace(data.patch.after, data.patch.before);
assert.equal(hash(candidate), data.verification.sourceSHA256.candidate);
assert.equal(hash(baseline), data.verification.sourceSHA256.baseline);
function engine(html) {
  const box = vm.createContext({});
  for (const match of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(match[1], box);
  return {E: box.Yiwu, C: box.YiwuComputer};
}
function random(seed) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
const {E, C} = engine(source), old = engine(baseline);
assert.equal(hash(fs.readFileSync(path.join(root, 'tests/moves.cjs'))), data.testSHA256['moves.cjs']);
const moves = execFileSync(process.execPath, [path.join(root, 'tests/moves.cjs'), sourceFile], {encoding: 'utf8'});
assert(moves.includes('8151'));
for (const benchmark of [data.nodeBenchmark, data.browserBenchmark]) {
  assert.deepEqual(benchmark.sourceSHA256, data.verification.sourceSHA256);
  assert.equal(benchmark.timings?.length || benchmark.times.length, 192);
  const times = benchmark.timings || benchmark.times;
  const median = xs => {xs.sort((a, b) => a - b); return (xs[(xs.length - 1) >> 1] + xs[xs.length >> 1]) / 2;};
  for (const item of benchmark.cases) {
    for (const model of ['baseline', 'candidate']) {
      const rows = times.filter(t => t.name === item.name && t.model === model);
      assert.equal(rows.length, 16);
      assert.equal(new Set(rows.map(t => t.round)).size, 16);
      assert(rows.every(t => Number.isFinite(t.ms) && t.ms >= 0));
      assert.equal(median(rows.map(t => t.ms)), item[model]);
    }
    assert.equal(1 - item.candidate / item.baseline, item.reduction);
  }
}
let sortedQueries = 0;
for (const item of data.cases) {
  const before = JSON.stringify(item.state);
  assert.equal(JSON.stringify(old.C.rankedActions(item.state)), JSON.stringify(item.ranked));
  assert.equal(JSON.stringify(C.rankedActions(item.state)), JSON.stringify(item.ranked));
  for (const difficulty of ['practice', 'standard']) for (const roll of [0, .2, .5, .8, .999999]) assert.equal(JSON.stringify(C.board(item.state, () => roll, difficulty)), JSON.stringify(old.C.board(item.state, () => roll, difficulty)));
  assert.equal(JSON.stringify(item.state), before);
  sortedQueries++;
}
const reference = fs.readFileSync(path.join(__dirname, data.reference.path));
assert.equal(hash(reference), data.reference.sha256);
const reports = JSON.parse(reference).reports;
const totals = {games: 0, commands: 0, sampledStates: 0, moveQueries: 0}, decisions = [];
for (const report of reports) for (const run of report.runs) {
  let s, board = 0, combat = 0;
  const chosen = data.verification.decisions.some(item => JSON.stringify(item.input) === JSON.stringify(run.input) && item.terminalSHA256 === run.terminalSHA256);
  const rng = {[run.input.aSide]: random(run.input.seedA), [E.OTHER[run.input.aSide]]: random(run.input.seedB)};
  for (const [index, command] of run.commands.entries()) {
    const [op, ...args] = command;
    if (s?.phase === 'board' && index % 17 === 0) {
      const before = JSON.stringify(s);
      for (const p of s.pieces) {assert.equal(JSON.stringify(E.moves(s, p)), JSON.stringify(old.E.moves(s, p))); totals.moveQueries++;}
      assert.equal(JSON.stringify(s), before); totals.sampledStates++;
    }
    if (chosen && s?.phase === 'board') {
      const before = JSON.stringify(s), action = C.board(s, rng[s.turn], 'standard');
      assert.deepEqual(action.type === 'pass' ? ['pass'] : action.type === 'rest' ? ['rest', action.id, action.card] : ['move', action.id, action.x, action.y], command);
      assert.equal(JSON.stringify(s), before); board++;
    } else if (chosen && s?.phase === 'duel') {
      const before = JSON.stringify(s), a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), id = C.combat(s, a.side, rng[a.side], 'standard');
      assert.deepEqual(id === 'retreat' ? ['retreat'] : ['resolve', id, C.combat(s, d.side, rng[d.side], 'standard')], command);
      assert.equal(JSON.stringify(s), before); combat++;
    }
    if (op === 'create') s = E.create(...args); else E[op](s, ...args);
    totals.commands++;
  }
  assert.equal(s.phase, 'ended'); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256);
  totals.games++;
  if (chosen) decisions.push({input: run.input, board, combat, commands: run.commands.length, terminalSHA256: run.terminalSHA256});
}
assert.deepEqual(decisions, data.verification.decisions);
assert.equal(decisions.length, 8);
for (const [key, value] of Object.entries({...totals, sortedQueries})) assert.equal(value, data.verification[key]);
for (const [name, expected] of Object.entries(data.testSHA256)) assert.equal(hash(fs.readFileSync(path.join(root, 'tests', name))), expected);
assert.equal(data.tests.length, 39); assert(data.tests.every(test => test.status === 0));
console.log(JSON.stringify({...totals, sortedQueries, decisionGames: decisions.length, boardDecisions: decisions.reduce((n, r) => n + r.board, 0), combatDecisions: decisions.reduce((n, r) => n + r.combat, 0), rawTimingArithmeticVerified: true, sourceAndTestFilesVerified: true}));
