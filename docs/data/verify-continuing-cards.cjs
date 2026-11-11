const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'continuing-cards-0.6.111.json')));
const root = path.resolve(__dirname, '../..'), source = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(hash(source), data.releaseSHA256, '请传入报告指定的0.6.111源码');
assert.equal(source.split(data.patch.after).length, 2);
const candidate = source.replaceAll('0.6.111', '0.6.110').replace('持续武斗省牌', '走法查询提速');
const baseline = candidate.replace(data.patch.after, data.patch.before).replaceAll('cardReplacements(', 'endingCardReplacements(');
assert.equal(hash(baseline), data.audit.sourceSHA256);
assert.equal(hash(candidate), data.games.sourceSHA256.candidate);
assert.equal(hash(candidate), data.performance.sourceSHA256.candidate);
assert.equal(hash(baseline), data.games.sourceSHA256.baseline);
function engine(html) {const box = vm.createContext({}); for (const match of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(match[1], box); return {E: box.Yiwu, C: box.YiwuComputer};}
function random(seed) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
const models = {baseline: engine(baseline), candidate: engine(candidate)}, copy = x => JSON.parse(JSON.stringify(x));
const {E, C} = models.baseline, reference = fs.readFileSync(path.join(__dirname, data.reference.path));
assert.equal(hash(reference), data.reference.sha256);
const audit = {states: 0, candidates: 0, actualUses: 0}, totals = {historicalGames: 0, historicalCommands: 0, games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
for (const report of JSON.parse(reference).reports) for (const run of report.runs) {
  let s;
  for (const [op, ...args] of run.commands) {
    if (s?.phase === 'duel' && s.duel.round < 6) {
      audit.states++;
      const ctx = s.duel, a = E.get(s, ctx.a), d = E.get(s, ctx.d);
      for (const mine of [a, d]) {
        const isA = mine === a, ids = C.choices(s, mine, ctx), replies = C.choices(s, isA ? d : a, ctx);
        for (const id of ids.filter(id => E.CARDS[id])) {
          const base = Object.keys(E.BASE).find(base => E.BASE[base].type === E.CARDS[id].type);
          if (!ids.includes(base)) continue;
          if (replies.every(reply => {
            const b = E.roundDamage(ctx, isA ? base : reply, isA ? reply : base), c = E.roundDamage(ctx, isA ? id : reply, isA ? reply : id);
            return b.toA < a.hp && b.toD < d.hp && ['toA', 'toD', 'forceAfterA', 'forceAfterD'].every(key => b[key] === c[key]);
          })) {audit.candidates++; if (op === 'resolve' && args[isA ? 0 : 1] === id) audit.actualUses++;}
        }
      }
    }
    if (op === 'create') s = E.create(...args); else E[op](s, ...args);
    totals.historicalCommands++;
  }
  assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); totals.historicalGames++;
}
for (const [key, value] of Object.entries(audit)) assert.equal(value, data.audit[key]);
assert.equal(audit.candidates, 0);
const unique = new Set();
for (const run of data.games.runs) {
  assert(!unique.has([run.model, run.caseIndex, run.replicate].join(':'))); unique.add([run.model, run.caseIndex, run.replicate].join(':'));
  const fixture = data.probes[run.caseIndex], {E, C} = models[run.model];
  assert.deepEqual(run.commands.slice(0, fixture.commands.length), fixture.commands);
  const seeds = Object.fromEntries(['red', 'black'].map(side => [side, crypto.createHash('sha256').update('yiwu-midround-0.6.111:' + run.caseIndex + ':' + run.replicate + ':' + side).digest().readUInt32LE(0)]));
  assert.deepEqual(run.seeds, seeds); assert.equal(run.forcedFirstRoll, fixture.roll);
  const rng = Object.fromEntries(Object.entries(seeds).map(([side, seed]) => [side, random(seed)])); let s, first = null;
  const choose = side => {const id = C.combat(s, side, () => side === fixture.side && first === null ? fixture.roll : rng[side](), 'standard'); if (side === fixture.side && first === null) first = id; return id;};
  for (const [index, command] of run.commands.entries()) {
    const [op, ...args] = command;
    if (index >= fixture.commands.length) {
      const before = JSON.stringify(s); let expected;
      if (s.phase === 'board') {const action = C.board(s, rng[s.turn], 'standard'); expected = action.type === 'pass' ? ['pass'] : action.type === 'rest' ? ['rest', action.id, action.card] : ['move', action.id, action.x, action.y]; totals.boardChoices++;}
      else {assert.equal(s.phase, 'duel'); const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), id = choose(a.side); expected = id === 'retreat' ? ['retreat'] : ['resolve', id, choose(d.side)]; totals.combatChoices++;}
      assert.deepEqual(expected, command); assert.equal(JSON.stringify(s), before);
    }
    if (op === 'create') s = E.create(...args); else E[op](s, ...args); totals.commands++;
    assert(s.pieces.every(p => p.hp > 0 && p.hp <= 18 && p.exhausted.every(id => p.learned.includes(id))));
    assert.equal(new Set(s.pieces.map(p => p.x + ',' + p.y)).size, s.pieces.length);
  }
  assert.equal(first, run.first); assert(run.model === 'baseline' ? first === fixture.id : first !== fixture.id);
  assert.equal(s.phase, 'ended'); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason); assert.equal(s.ply, run.plies); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); totals.games++;
}
assert.equal(totals.games, 12); assert.equal(totals.historicalGames, 536); assert.equal(totals.historicalCommands, 168547);
for (const probe of data.probes) {
  let s; for (const [op, ...args] of probe.commands) {if (op === 'create') s = E.create(...args); else E[op](s, ...args);}
  assert.deepEqual(copy(C.combatPlan(s, probe.side)), probe.plan);
  const next = copy(models.candidate.C.combatPlan(s, probe.side)); assert(!next.some(p => p.id === probe.id));
  for (const type of Object.keys(E.BASE)) {const total = plan => plan.filter(p => (E.BASE[p.id] || E.CARDS[p.id])?.type === type).reduce((n, p) => n + p.weight, 0); assert(Math.abs(total(next) - total(probe.plan)) < 1e-12);}
}
assert.equal(data.tests.length, 40); assert(data.tests.every(test => test.status === 0));
for (const [name, expected] of Object.entries(data.files)) assert.equal(hash(fs.readFileSync(path.join(root, name))), expected, name);
console.log(JSON.stringify({...totals, audit, sourceAndFilesVerified: true, sameTypeProbabilitiesVerified: true}));
