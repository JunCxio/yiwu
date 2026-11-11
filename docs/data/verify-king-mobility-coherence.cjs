const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'king-mobility-coherence-0.6.113.json')));
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../index.html'), 'utf8');
assert.equal(hash(source), data.sourceSHA256, '请传入报告指定的0.6.113源码');
const referenceBytes = fs.readFileSync(path.join(__dirname, 'long-game-trial-0.6.113.json'));
assert.equal(hash(referenceBytes), data.referenceSHA256);
const reference = JSON.parse(referenceBytes), prior = reference.trials[0];
assert.equal(reference.sourceSHA256, data.sourceSHA256);
function apply(html, patch) {assert.equal(html.split(patch.before).length, 2); return html.replace(patch.before, patch.after);}
const boardOnly = apply(source, {before: prior.patch.removed, after: prior.patch.inserted});
assert.equal(hash(boardOnly), prior.plan.sourceSHA256.candidate);
const candidate = apply(boardOnly, data.phasePatch);
assert.equal(hash(candidate), data.plan.sourceSHA256.candidate);
const scripts = html => [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts(source)[0], scripts(candidate)[0]); assert.equal(scripts(source)[2], scripts(candidate)[2]);
assert.equal(source.match(/<style>([\s\S]*?)<\/style>/)[1], candidate.match(/<style>([\s\S]*?)<\/style>/)[1]);
function engine(html) {
  const box = vm.createContext({});
  const debug = html.replace('return {actions,choices,twoRoundCapturePlan', 'return {debug:{position,kingMobilityCost,threatCost},actions,choices,twoRoundCapturePlan');
  assert.notEqual(html, debug);
  for (const script of scripts(debug).slice(0, 2)) vm.runInContext(script, box);
  return {E: box.Yiwu, C: box.YiwuComputer};
}
const copy = x => JSON.parse(JSON.stringify(x)), models = {baseline: engine(source), candidate: engine(candidate)}, old = engine(boardOnly).C, {E} = models.baseline, fixed = models.candidate.C;
const audit = {sourceSHA256: hash(source), boardOnlySHA256: hash(boardOnly), unifiedSHA256: hash(candidate), games: 0, eligible: 0, divergent: [], coherent: 0, errors: []};
for (const [runIndex, run] of prior.runs.entries()) {
  let s;
  for (const [index, [op, ...args]] of run.commands.entries()) {
    if (s?.phase === 'duel') {
      const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d);
      if (a.kind !== 'king' && d.kind !== 'king' && d.hp <= (s.duel.round === 1 ? 3 : 2)) {
        audit.eligible++; const before = JSON.stringify(s), board = {...s, phase: 'board', duel: null};
        const oldBase = old.debug.position(s, a.side), boardBase = old.debug.position(board, a.side), fixedBase = fixed.debug.position(s, a.side);
        assert.equal(fixedBase, fixed.debug.position(board, a.side)); audit.coherent++;
        if (Math.abs(oldBase - boardBase) > 1e-9) {
          const originalPlan = copy(old.twoRoundCapturePlan(s)), fixedPlan = copy(fixed.twoRoundCapturePlan(s));
          assert.deepEqual(originalPlan.map(p => [p.id, p.rounds]), fixedPlan.map(p => [p.id, p.rounds]));
          for (const p of originalPlan) assert(Math.abs(p.score - fixedPlan.find(q => q.id === p.id).score - (boardBase - oldBase)) < 1e-8);
          const row = {runIndex, index, ply: s.ply + 1, round: s.duel.round, scenario: s.scenario, actor: a.id, target: d.id, oldBase, boardBase, fixedBase, originalPlan, fixedPlan};
          if (s.duel.round === 1 && originalPlan.length) {
            row.oldBest = copy(old.rankedActions(board)[0]); row.fixedBest = copy(fixed.rankedActions(board)[0]);
            const identity = a => JSON.stringify([a.type, a.id, a.x, a.y, a.card]); row.topChanged = identity(row.oldBest) !== identity(row.fixedBest);
          }
          audit.divergent.push(row);
        }
        assert.equal(JSON.stringify(s), before);
      }
    }
    if (op === 'create') s = E.create(...args); else E[op](s, ...args);
  }
  assert.equal(s.phase, 'ended'); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); audit.games++;
}
assert.deepEqual(audit, data.phaseAudit);
const regressionModels = {baseline: models.baseline.C, boardOnly: old, unified: fixed};
function attackers(s, king) {return s.pieces.filter(p => p.side !== king.side && E.canMove(s, p, king.x, king.y) && !models.baseline.C.battleOutlook(s, E.context(s, p, king)).counters.length);}
function safeExits(s, king) {
  return E.moves(s, king).filter(m => !E.at(s, m.x, m.y)).filter(m => {
    const next = copy(s); next.turn = king.side; E.move(next, king.id, m.x, m.y);
    return next.phase === 'ended' ? next.winner !== E.OTHER[king.side] : !attackers(next, E.get(next, king.id)).length;
  });
}
function pressures(s, king) {
  const out = [];
  for (const p of s.pieces.filter(p => p.side !== king.side)) for (const m of E.moves(s, p).filter(m => !E.at(s, m.x, m.y))) {
    const next = copy(s); E.move(next, p.id, m.x, m.y); if (next.phase !== 'board') continue;
    const defender = E.get(next, king.id), threats = attackers(next, defender);
    if (threats.length && !safeExits(next, defender).length) out.push({type: 'move', id: p.id, ...m, attackers: threats.map(p => p.id)});
  }
  return out;
}
const defenseRows = [];
for (const [index, row] of data.regressionAnalysis.fixture.cases.entries()) {
  let s; for (const [op, ...args] of row.commands) {if (op === 'create') s = E.create(...args); else E[op](s, ...args);}
  const side = s.turn, states = {};
  for (const [name, C] of Object.entries(regressionModels)) {
    const before = JSON.stringify(s), action = copy(C.rankedActions(s)[0]), next = copy(s); E.move(next, action.id, action.x, action.y); assert.equal(next.phase, 'board');
    const king = next.pieces.find(p => p.side === side && p.kind === 'king'), enemyKing = next.pieces.find(p => p.side !== side && p.kind === 'king'), cost = p => C.debug.kingMobilityCost(next, p, C.debug.threatCost(next, p));
    const selections = [];
    for (const difficulty of ['standard', 'practice']) for (const roll of [0, .25, .5, .75, .999999]) {
      const chosen = copy(C.board(s, () => roll, difficulty)), after = copy(s);
      if (chosen.type === 'rest') E.rest(after, chosen.id, chosen.card); else E.move(after, chosen.id, chosen.x, chosen.y);
      selections.push({difficulty, roll, action: chosen, phase: after.phase, responses: after.phase === 'board' ? pressures(after, after.pieces.find(p => p.side === side && p.kind === 'king')) : []});
    }
    states[name] = {action, responses: pressures(next, king), ownMobilityCost: cost(king), enemyMobilityCost: cost(enemyKing), selections}; assert.equal(JSON.stringify(s), before);
  }
  defenseRows.push({index, ply: s.ply + 1, side, states});
}
assert.deepEqual(defenseRows, data.regressionAnalysis.rows);
assert(defenseRows.every(r => !r.states.baseline.responses.length && r.states.baseline.selections.every(p => !p.responses.length)));
assert(defenseRows.some(r => r.states.unified.selections.some(p => p.responses.length)));
assert(data.regressionAnalysis.targeted.filter(r => r.source === 'baseline').every(r => r.passed));
assert(data.regressionAnalysis.targeted.filter(r => r.source !== 'baseline').every(r => !r.passed));
const known = prior.runs.filter(r => r.input.group === 'known' && r.input.models.red === 'baseline').sort((a, b) => a.input.priorIndex - b.input.priorIndex);
assert.deepEqual(known.map(r => r.plies), [166, 318, 478, 622]);
const excluded = new Set([...prior.plan.excludedSeeds, ...prior.plan.inputs.filter(i => i.group !== 'known').flatMap(i => [i.seedA, i.seedB])]);
assert.equal(excluded.size, 1828); assert.equal(data.plan.priorSeedsChecked, excluded.size); assert.deepEqual(data.plan.excludedSeeds, [...excluded].sort((a, b) => a - b));
assert.equal(data.plan.seedLabel, 'yiwu-king-mobility-coherence-0.6.113:20261112');
const inputs = [], pairs = [['default', 'default'], ['spread', 'defense'], ['attack', 'spread'], ['mixed', 'defense']];
const seed = (group, scenario, replicate, side) => crypto.createHash('sha256').update(`${data.plan.seedLabel}:${group}:${scenario}:${replicate}:${side}`).digest().readUInt32LE(0);
for (const [priorIndex, run] of known.entries()) for (const model of ['baseline', 'candidate']) inputs.push({...run.input, group: 'known', priorIndex, models: {red: model, black: model}});
for (const group of ['batch1', 'batch2']) for (const scenario of ['quick', 'full']) for (const [replicate, [style, comparator]] of pairs.entries()) for (const [red, black] of [['baseline', 'baseline'], ['candidate', 'baseline'], ['baseline', 'candidate'], ['candidate', 'candidate']]) inputs.push({group, scenario, replicate, style, comparator, aVariant: style === 'default' ? 0 : replicate % 3, bVariant: comparator === 'default' ? 0 : replicate % 3, aSide: 'red', seedA: seed(group, scenario, replicate, 'red'), seedB: seed(group, scenario, replicate, 'black'), models: {red, black}});
assert.deepEqual(inputs, data.plan.inputs); assert.equal(inputs.length, 72); assert.equal(data.runs.length, 72);
const fresh = new Set(inputs.filter(i => i.group !== 'known').flatMap(i => [i.seedA, i.seedB]));
assert.equal(fresh.size, 32); assert([...fresh].every(s => !excluded.has(s))); assert.equal(data.plan.freshSeeds, 32); assert.equal(data.plan.freshRoots, 16);
assert.deepEqual(data.plan.limits, {plies: 2000, steps: 14000}); assert.deepEqual(data.plan.acceptance, prior.plan.acceptance);
function random(seed) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
function setup(s, side, style, variant) {
  if (style === 'default') {E.auto(s, side, true); return;}
  const pieces = s.pieces.filter(p => p.side === side).sort((a, b) => side === 'red' ? a.x - b.x : b.x - a.x), kinds = style === 'defense' ? ['pawn', 'guard', 'elephant', 'horse', 'cannon', 'rook', 'king'] : ['rook', 'horse', 'cannon', 'pawn', 'guard', 'elephant', 'king'];
  let order = pieces.filter(p => p.kind !== 'king').sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  if (style === 'mixed') order = ['rook', 'pawn', 'guard', 'horse', 'cannon', 'elephant'].map(kind => pieces.find(p => p.kind === kind));
  for (const [i, p] of order.entries()) {
    if (!s.budget[side]) break;
    const cards = Object.keys(E.CARDS).filter(id => E.CARDS[id].kind === p.kind);
    for (const index of style === 'spread' ? [(i + variant) % 3] : [[0, 1], [0, 2], [1, 2]][variant]) if (s.budget[side]) E.learn(s, p.id, cards[index]);
  }
}
const totals = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0}, remaining = new Set(inputs.map(i => JSON.stringify(i)));
for (const run of data.runs) {
  const {input} = run; assert(remaining.delete(JSON.stringify(input)));
  if (input.group === 'known' && input.models.red === 'baseline') {assert.deepEqual(run.commands, known[input.priorIndex].commands); assert.equal(run.terminalSHA256, known[input.priorIndex].terminalSHA256);}
  const expected = E.create(input.scenario); setup(expected, input.aSide, input.style, input.aVariant); setup(expected, E.OTHER[input.aSide], input.comparator, input.bVariant);
  assert.equal(expected.budget.red, 0); assert.equal(expected.budget.black, 0); assert(expected.pieces.every(p => p.learned.length <= 2 && p.hp === 18)); E.start(expected);
  const rng = {[input.aSide]: random(input.seedA), [E.OTHER[input.aSide]]: random(input.seedB)}, controller = side => models[input.models[side]].C;
  const stats = {moves: 0, rests: 0, passes: 0, battles: 0, rounds: 0, retreats: 0, reversals: 0}, last = new Map(); let s, activity;
  for (const [op, ...args] of run.commands) {
    totals.commands++;
    if (op === 'create') {assert(!s); s = E.create(...args); continue;}
    if (op === 'start') activity = Object.fromEntries(s.pieces.map(p => [p.id, {side: p.side, kind: p.kind, cards: Array.from(p.learned), moves: 0, rests: 0, attacks: 0, defenses: 0, damage: 0, captures: 0, cardUses: 0}]));
    const before = JSON.stringify(s);
    if (['pass', 'rest', 'move'].includes(op)) {
      assert.equal(s.phase, 'board'); const action = controller(s.turn).board(s, rng[s.turn], 'standard'); totals.boardChoices++;
      assert.deepEqual([action.type, ...(action.type === 'move' ? [action.id, action.x, action.y] : action.type === 'rest' ? [action.id, action.card] : [])], [op, ...args]);
      if (op === 'pass') stats.passes++;
      else if (op === 'rest') {stats.rests++; activity[args[0]].rests++;}
      else {
        const p = E.get(s, args[0]), target = E.at(s, args[1], args[2]);
        if (target) {stats.battles++; activity[p.id].attacks++; activity[target.id].defenses++; last.delete(p.id);}
        else {stats.moves++; activity[p.id].moves++; const previous = last.get(p.id); if (previous && previous[0] === args[1] && previous[1] === args[2]) stats.reversals++; last.set(p.id, [p.x, p.y]);}
      }
    }
    if (op === 'retreat' || op === 'resolve') {
      assert.equal(s.phase, 'duel'); const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), aId = controller(a.side).combat(s, a.side, rng[a.side], 'standard'); totals.combatChoices++;
      if (op === 'retreat') {assert.equal(aId, 'retreat'); stats.retreats++;}
      else {
        const dId = controller(d.side).combat(s, d.side, rng[d.side], 'standard'); totals.combatChoices++; assert.deepEqual([aId, dId], args); stats.rounds++;
        const r = E.roundDamage(s.duel, ...args); activity[a.id].damage += Math.min(d.hp, r.toD); activity[d.id].damage += Math.min(a.hp, r.toA);
        if (r.toD >= d.hp) activity[a.id].captures++; if (r.toA >= a.hp) activity[d.id].captures++;
        if (E.CARDS[aId]) activity[a.id].cardUses++; if (E.CARDS[dId]) activity[d.id].cardUses++;
      }
    }
    assert.equal(JSON.stringify(s), before); E[op](s, ...args); if (op === 'start') assert.equal(JSON.stringify(s), JSON.stringify(expected));
  }
  assert.equal(s.phase, 'ended'); assert(s.ply < data.plan.limits.plies); assert.equal(s.ply, run.plies); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); assert.deepEqual(activity, run.pieceActivity);
  for (const [key, value] of Object.entries(stats)) assert.equal(value, run[key]); totals.games++;
  if (totals.games % 12 === 0) console.log(JSON.stringify(totals));
}
assert.equal(remaining.size, 0);
for (const [key, value] of Object.entries(totals)) assert.equal(value, data.verification[key]);
const summary = {};
for (const mode of ['quick', 'full']) {
  const rows = data.runs.filter(r => r.input.group !== 'known' && r.input.scenario === mode), direct = rows.filter(r => r.input.models.red !== r.input.models.black), points = direct.map(r => r.winner === 'draw' ? .5 : r.input.models[r.winner] === 'candidate' ? 1 : 0);
  const out = {direct: {games: points.length, wins: points.filter(p => p === 1).length, draws: points.filter(p => p === .5).length, losses: points.filter(p => p === 0).length, points: points.reduce((a, b) => a + b, 0)}};
  for (const model of ['baseline', 'candidate']) {
    const self = rows.filter(r => r.input.models.red === model && r.input.models.black === model), plies = self.map(r => r.plies).sort((a, b) => a - b);
    out[model] = {games: self.length, meanPlies: plies.reduce((a, b) => a + b, 0) / self.length, medianPlies: (plies[(plies.length - 1) >> 1] + plies[plies.length >> 1]) / 2, maxPlies: plies.at(-1), draws: self.filter(r => r.winner === 'draw').length, singleDamageWins: self.filter(r => r.winner !== 'draw' && Object.values(r.pieceActivity).filter(p => p.side === r.winner && p.damage > 0).length === 1).length};
  }
  out.passedGates = out.direct.points >= out.direct.games / 2 && out.candidate.meanPlies <= out.baseline.meanPlies && out.candidate.maxPlies <= out.baseline.maxPlies; summary[mode] = out;
}
assert.deepEqual(summary, data.summary); assert.equal(summary.quick.passedGates, false); assert.equal(data.adopted, false);
assert.equal(data.repositoryRegressions.rows.length, 40); assert.deepEqual(data.repositoryRegressions.rows.filter(r => !r.passed).map(r => r.name), ['computer-attack-pressure.cjs', 'computer-king-coordination.cjs', 'computer-king-space.cjs']);
console.log(JSON.stringify({...totals, phaseStates: audit.eligible, divergent: audit.divergent.length, adopted: data.adopted, summary}, null, 2));
