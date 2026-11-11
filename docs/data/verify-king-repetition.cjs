const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex'), copy = x => JSON.parse(JSON.stringify(x));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'king-repetition-0.6.113.json')));
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../index.html'), 'utf8');
assert.equal(hash(source), data.sourceSHA256, '请传入报告指定的0.6.113源码');
const referenceBytes = fs.readFileSync(path.join(__dirname, 'king-mobility-coherence-0.6.113.json'));
assert.equal(hash(referenceBytes), data.referenceSHA256); const reference = JSON.parse(referenceBytes);
const scripts = html => [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]), sources = {baseline: source}, models = {};
for (const trial of data.trials.filter(t => t.patches)) {
  let html = source;
  for (const p of trial.patches) {assert.equal(html.split(p.before).length, 2); html = html.replace(p.before, p.after);}
  assert.equal(hash(html), trial.plan.sourceSHA256.candidate); sources[trial.candidate] = html;
  assert.equal(scripts(source)[0], scripts(html)[0]); assert.equal(scripts(source)[2], scripts(html)[2]);
  assert.equal(source.match(/<style>([\s\S]*?)<\/style>/)[1], html.match(/<style>([\s\S]*?)<\/style>/)[1]);
}
for (const [name, html] of Object.entries(sources)) {
  const box = vm.createContext({}), debug = html.replace('return {actions,choices,twoRoundCapturePlan', 'return {debug:{threatCost,kingMobilityCost},actions,choices,twoRoundCapturePlan');
  assert.notEqual(html, debug); for (const script of scripts(debug).slice(0, 2)) vm.runInContext(script, box);
  models[name] = {E: box.Yiwu, C: box.YiwuComputer};
}
const {E, C} = models.baseline, replay = commands => {let s; for (const [op, ...args] of commands) {if (op === 'create') s = E.create(...args); else E[op](s, ...args);} return s;};
function nearChoices(s, C) {
  const ranked = copy(C.rankedActions(s)), near = ranked.filter(a => Math.round(ranked[0].score * 1e9) - Math.round(a.score * 1e9) <= 1200000000).slice(0, 3);
  return near.map(action => {
    const next = copy(s); E[action.type](next, action.id, ...(action.type === 'rest' ? [action.card] : [action.x, action.y]));
    if (next.phase !== 'board') return {action, phase: next.phase, winner: next.winner};
    const king = next.pieces.find(p => p.side === s.turn && p.kind === 'king'), risk = C.debug.threatCost(next, king);
    return {action, phase: 'board', certainLoss: C.kingLostNext(next, s.turn), risk, mobility: C.debug.kingMobilityCost(next, king, risk)};
  });
}
const audit = {sourceSHA256: hash(source), referenceSHA256: hash(referenceBytes), sampling: data.audit.sampling, games: 0, boardStates: 0, sampled: 0, mixedNear: 0, witnesses: [], queriesUnchanged: true};
for (const [runIndex, run] of reference.runs.entries()) {
  if (run.input.models.red !== 'baseline' || run.input.models.black !== 'baseline') continue;
  let s;
  for (const [index, [op, ...args]] of run.commands.entries()) {
    if (s?.phase === 'board') {
      audit.boardStates++; const king = s.pieces.find(p => p.side === s.turn && p.kind === 'king');
      if (s.ply % 8 === 0 || king.hp <= 3 || C.debug.threatCost(s, king)) {
        audit.sampled++; const before = JSON.stringify(s), choices = nearChoices(s, C), quiet = choices.filter(p => p.phase === 'board');
        if (quiet.length !== choices.length) audit.mixedNear++;
        if (quiet.some(p => p.certainLoss) && quiet.some(p => !p.certainLoss) || quiet.some(p => p.risk === 0 && p.mobility === 0) && quiet.some(p => p.risk > 0 || p.mobility > 0)) audit.witnesses.push({runIndex, index, ply: s.ply + 1, scenario: s.scenario, side: s.turn, kingHP: king.hp, allBoard: quiet.length === choices.length, choices});
        assert.equal(JSON.stringify(s), before);
      }
    }
    if (op === 'create') s = E.create(...args); else E[op](s, ...args);
  }
  assert.equal(s.phase, 'ended'); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); audit.games++;
}
assert.deepEqual(audit, data.audit);
const witnessRows = [];
for (const row of audit.witnesses.filter(r => r.allBoard)) {
  const s = replay(reference.runs[row.runIndex].commands.slice(0, row.index)), before = JSON.stringify(s), states = {};
  for (const [name, {C}] of Object.entries(models)) states[name] = nearChoices(s, C);
  assert.equal(JSON.stringify(s), before); witnessRows.push({runIndex: row.runIndex, index: row.index, ply: row.ply, scenario: s.scenario, side: s.turn, states});
}
assert.deepEqual(witnessRows, data.witnessAnalysis.rows);
const safePool = rows => rows.every(r => r.phase === 'board' && !r.risk && !r.mobility && !r.certainLoss);
const witnessSummary = Object.fromEntries(Object.keys(models).map(name => [name, {allSafePools: witnessRows.filter(row => safePool(row.states[name])).length, remainingPools: witnessRows.filter(row => !safePool(row.states[name])).map(row => ({runIndex: row.runIndex, ply: row.ply}))}]));
assert.deepEqual(witnessSummary, data.witnessAnalysis.summary);
const targeted = {};
for (const [name, html] of Object.entries(sources)) {
  const logs = [], testRequire = name => {
    if (name === 'node:fs') return {readFileSync(file) {assert.equal(file, 'source'); return html;}};
    if (name === './computer-king-repetition-fixture.json') return copy(data.targeted.fixture);
    assert(['node:path', 'node:vm', 'node:assert/strict'].includes(name)); return require(name);
  };
  let failed = false;
  try {vm.runInNewContext(data.targeted.script, {require: testRequire, process: {argv: ['node', 'test', 'source']}, __dirname, console: {log: text => logs.push(text)}}, {timeout: 120000});}
  catch (error) {if (name !== 'baseline' || error.code !== 'ERR_ASSERTION') throw error; failed = true;}
  if (name === 'baseline') assert(failed); else {assert(!failed); targeted[name] = JSON.parse(logs.at(-1)); assert.equal(targeted[name].choices, 60);}
}
const known = reference.runs.filter(r => r.input.group === 'known' && r.input.models.red === 'baseline').sort((a, b) => a.input.priorIndex - b.input.priorIndex);
assert.deepEqual(known.map(r => r.plies), [166, 318, 478, 622]);
const excluded = new Set([...reference.plan.excludedSeeds, ...reference.plan.inputs.filter(i => i.group !== 'known').flatMap(i => [i.seedA, i.seedB])]); assert.equal(excluded.size, 1860);
const pairs = [['default', 'default'], ['spread', 'defense'], ['attack', 'spread'], ['mixed', 'defense']];
function random(seed) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
function setup(s, side, style, variant) {
  if (style === 'default') {E.auto(s, side, true); return;}
  const pieces = s.pieces.filter(p => p.side === side).sort((a, b) => side === 'red' ? a.x - b.x : b.x - a.x), kinds = style === 'defense' ? ['pawn', 'guard', 'elephant', 'horse', 'cannon', 'rook', 'king'] : ['rook', 'horse', 'cannon', 'pawn', 'guard', 'elephant', 'king'];
  let order = pieces.filter(p => p.kind !== 'king').sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  if (style === 'mixed') order = ['rook', 'pawn', 'guard', 'horse', 'cannon', 'elephant'].map(kind => pieces.find(p => p.kind === kind));
  for (const [i, p] of order.entries()) {
    if (!s.budget[side]) break; const cards = Object.keys(E.CARDS).filter(id => E.CARDS[id].kind === p.kind);
    for (const index of style === 'spread' ? [(i + variant) % 3] : [[0, 1], [0, 2], [1, 2]][variant]) if (s.budget[side]) E.learn(s, p.id, cards[index]);
  }
}
function summarize(runs) {
  const out = {};
  for (const difficulty of [...new Set(runs.map(r => r.input.difficulty || 'standard'))]) for (const mode of ['quick', 'full']) {
    const rows = runs.filter(r => r.input.group !== 'known' && r.input.scenario === mode && (r.input.difficulty || 'standard') === difficulty), direct = rows.filter(r => r.input.models.red !== r.input.models.black), points = direct.map(r => r.winner === 'draw' ? .5 : r.input.models[r.winner] === 'candidate' ? 1 : 0);
    const row = {direct: {games: points.length, wins: points.filter(p => p === 1).length, draws: points.filter(p => p === .5).length, losses: points.filter(p => p === 0).length, points: points.reduce((a, b) => a + b, 0)}};
    for (const model of ['baseline', 'candidate']) {
      const self = rows.filter(r => r.input.models.red === model && r.input.models.black === model), plies = self.map(r => r.plies).sort((a, b) => a - b);
      row[model] = {games: self.length, meanPlies: plies.reduce((a, b) => a + b, 0) / self.length, medianPlies: (plies[(plies.length - 1) >> 1] + plies[plies.length >> 1]) / 2, maxPlies: plies.at(-1), draws: self.filter(r => r.winner === 'draw').length, singleDamageWins: self.filter(r => r.winner !== 'draw' && Object.values(r.pieceActivity).filter(p => p.side === r.winner && p.damage > 0).length === 1).length};
    }
    row.passedGates = row.direct.points >= row.direct.games / 2 && row.candidate.meanPlies <= row.baseline.meanPlies && row.candidate.maxPlies <= row.baseline.maxPlies; out[difficulty + '-' + mode] = row;
  }
  return out;
}
const totals = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
for (const trial of data.trials) {
  const plan = trial.plan, isFollowup = trial.name === 'followup';
  assert.equal(hash(trial.driver), plan.driverSHA256); assert.equal(plan.sourceSHA256.baseline, hash(source)); assert.equal(plan.sourceSHA256.candidate, hash(sources[trial.candidate]));
  assert.equal(plan.seedLabel, 'yiwu-king-repeat-' + ({broad: 'relief', safe: 'safe', followup: 'safe-followup'}[trial.name]) + '-0.6.113:20261112');
  assert.equal(plan.priorSeedsChecked, excluded.size); assert.deepEqual(plan.excludedSeeds, [...excluded].sort((a, b) => a - b));
  const inputs = [], seed = (...parts) => crypto.createHash('sha256').update([plan.seedLabel, ...parts].join(':')).digest().readUInt32LE(0);
  if (!isFollowup) for (const [priorIndex, run] of known.entries()) for (const model of ['baseline', 'candidate']) inputs.push({...run.input, group: 'known', priorIndex, models: {red: model, black: model}});
  for (const difficulty of isFollowup ? ['standard', 'practice'] : ['standard']) for (const group of ['batch1', 'batch2']) for (const scenario of ['quick', 'full']) for (const [replicate, [style, comparator]] of pairs.entries()) for (const [red, black] of [['baseline', 'baseline'], ['candidate', 'baseline'], ['baseline', 'candidate'], ['candidate', 'candidate']]) {
    const prefix = isFollowup ? [difficulty] : [];
    inputs.push({...isFollowup ? {difficulty} : {}, group, scenario, replicate, style, comparator, aVariant: style === 'default' ? 0 : replicate % 3, bVariant: comparator === 'default' ? 0 : replicate % 3, aSide: 'red', seedA: seed(...prefix, group, scenario, replicate, 'red'), seedB: seed(...prefix, group, scenario, replicate, 'black'), models: {red, black}});
  }
  assert.deepEqual(plan.inputs, inputs); assert.equal(inputs.length, isFollowup ? 128 : 72); assert.equal(trial.runs.length, inputs.length);
  const fresh = new Set(inputs.filter(i => i.group !== 'known').flatMap(i => [i.seedA, i.seedB]));
  assert.equal(fresh.size, isFollowup ? 64 : 32); assert([...fresh].every(s => !excluded.has(s))); assert.equal(plan.freshSeeds, fresh.size); assert.equal(plan.freshRoots, fresh.size / 2); for (const s of fresh) excluded.add(s);
  assert.deepEqual(plan.limits, {plies: 2000, steps: 14000});
  assert.deepEqual(plan.acceptance, isFollowup ? {eachDifficultyAndModeDirectScoreAtLeastHalf: true, eachDifficultyAndModeSelfPlayMeanNotLonger: true, eachDifficultyAndModeSelfPlayMaximumNotLonger: true} : reference.plan.acceptance);
  assert.equal(trial.reports.length, 4); assert(trial.reports.every(r => r.completed && !r.errors.length && r.games === inputs.length / 4));
  const remaining = new Set(inputs.map(i => JSON.stringify(i))), counts = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
  for (const run of trial.runs) {
    const {input} = run, difficulty = input.difficulty || 'standard'; assert(remaining.delete(JSON.stringify(input)));
    if (input.group === 'known' && input.models.red === 'baseline') {assert.deepEqual(run.commands, known[input.priorIndex].commands); assert.equal(run.terminalSHA256, known[input.priorIndex].terminalSHA256);}
    const expected = E.create(input.scenario); setup(expected, input.aSide, input.style, input.aVariant); setup(expected, E.OTHER[input.aSide], input.comparator, input.bVariant);
    assert.equal(expected.budget.red, 0); assert.equal(expected.budget.black, 0); assert(expected.pieces.every(p => p.hp === 18 && p.learned.length <= 2)); E.start(expected);
    const rng = {[input.aSide]: random(input.seedA), [E.OTHER[input.aSide]]: random(input.seedB)}, controller = side => models[input.models[side] === 'baseline' ? 'baseline' : trial.candidate].C;
    const stats = {moves: 0, rests: 0, passes: 0, battles: 0, rounds: 0, retreats: 0, reversals: 0}, last = new Map(); let s, activity;
    for (const [op, ...args] of run.commands) {
      counts.commands++; if (op === 'create') {assert(!s); s = E.create(...args); continue;}
      if (op === 'start') activity = Object.fromEntries(s.pieces.map(p => [p.id, {side: p.side, kind: p.kind, cards: Array.from(p.learned), moves: 0, rests: 0, attacks: 0, defenses: 0, damage: 0, captures: 0, cardUses: 0}]));
      const before = JSON.stringify(s);
      if (['pass', 'rest', 'move'].includes(op)) {
        assert.equal(s.phase, 'board'); const action = controller(s.turn).board(s, rng[s.turn], difficulty); counts.boardChoices++;
        assert.deepEqual([action.type, ...(action.type === 'move' ? [action.id, action.x, action.y] : action.type === 'rest' ? [action.id, action.card] : [])], [op, ...args]);
        if (op === 'pass') stats.passes++; else if (op === 'rest') {stats.rests++; activity[args[0]].rests++;} else {
          const p = E.get(s, args[0]), target = E.at(s, args[1], args[2]);
          if (target) {stats.battles++; activity[p.id].attacks++; activity[target.id].defenses++; last.delete(p.id);} else {stats.moves++; activity[p.id].moves++; const previous = last.get(p.id); if (previous && previous[0] === args[1] && previous[1] === args[2]) stats.reversals++; last.set(p.id, [p.x, p.y]);}
        }
      }
      if (op === 'retreat' || op === 'resolve') {
        assert.equal(s.phase, 'duel'); const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), aId = controller(a.side).combat(s, a.side, rng[a.side], difficulty); counts.combatChoices++;
        if (op === 'retreat') {assert.equal(aId, 'retreat'); stats.retreats++;} else {
          const dId = controller(d.side).combat(s, d.side, rng[d.side], difficulty); counts.combatChoices++; assert.deepEqual([aId, dId], args); stats.rounds++;
          const r = E.roundDamage(s.duel, ...args); activity[a.id].damage += Math.min(d.hp, r.toD); activity[d.id].damage += Math.min(a.hp, r.toA);
          if (r.toD >= d.hp) activity[a.id].captures++; if (r.toA >= a.hp) activity[d.id].captures++; if (E.CARDS[aId]) activity[a.id].cardUses++; if (E.CARDS[dId]) activity[d.id].cardUses++;
        }
      }
      assert.equal(JSON.stringify(s), before); E[op](s, ...args); if (op === 'start') assert.equal(JSON.stringify(s), JSON.stringify(expected));
    }
    assert.equal(s.phase, 'ended'); assert(s.ply < plan.limits.plies && stats.moves + stats.rests + stats.passes + stats.battles + stats.rounds + stats.retreats < plan.limits.steps);
    assert.equal(s.ply, run.plies); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); assert.deepEqual(activity, run.pieceActivity);
    for (const [key, value] of Object.entries(stats)) assert.equal(value, run[key]); counts.games++;
    if (counts.games % 12 === 0) console.log(JSON.stringify({trial: trial.name, ...counts}));
  }
  assert.equal(remaining.size, 0); for (const [key, value] of Object.entries(counts)) {assert.equal(value, trial.verification[key]); totals[key] += value;}
  assert.deepEqual(summarize(trial.runs), trial.summary);
  if (trial.regressions) {assert.equal(trial.regressions.rows.length, 42); assert(trial.regressions.rows.every(r => r.passed && r.status === 0)); assert.deepEqual(Object.keys(trial.regressions.logs), trial.regressions.rows.map(r => r.name));}
}
assert.equal(totals.games, 272); assert.equal(data.adopted, false);
assert(!data.trials[0].summary['standard-quick'].passedGates); assert(Object.values(data.trials[1].summary).every(r => r.passedGates)); assert(!data.trials[2].summary['practice-quick'].passedGates && !data.trials[2].summary['practice-full'].passedGates);
assert.equal(data.browserChecks.length, 6); assert(data.browserChecks.every(r => !r.horizontalOverflow && r.refreshUnchanged && r.naturalScroll && !r.errors.length));
for (const [name, rows] of Object.entries(data.performance.samples)) {assert.equal(rows.length, 120); assert(Math.abs(rows.reduce((n, r) => n + r.ms, 0) / rows.length - data.performance.summary[name].meanMs) < 1e-8);}
console.log(JSON.stringify({...totals, auditedStates: audit.sampled, witnessSummary, targeted, adopted: data.adopted}, null, 2));
