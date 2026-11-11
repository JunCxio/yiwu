const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'king-pressure-trial-0.6.109.json')));
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../index.html'), 'utf8');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
assert.equal(hash(source), data.sourceSHA256, '请传入报告指定的0.6.109源码文件');
function engine(html) {
  const box = vm.createContext({});
  for (const match of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(match[1], box);
  return {E: box.Yiwu, C: box.YiwuComputer};
}
function random(seed) {
  return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
}
function setup(E, s, side, style, variant) {
  if (style === 'default') {E.auto(s, side, true); return;}
  const pieces = s.pieces.filter(p => p.side === side).sort((a, b) => side === 'red' ? a.x - b.x : b.x - a.x);
  const kinds = style === 'defense' ? ['pawn', 'guard', 'elephant', 'horse', 'cannon', 'rook', 'king'] : ['rook', 'horse', 'cannon', 'pawn', 'guard', 'elephant', 'king'];
  let order = pieces.filter(p => p.kind !== 'king').sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  if (style === 'mixed') order = ['rook', 'pawn', 'guard', 'horse', 'cannon', 'elephant'].map(kind => pieces.find(p => p.kind === kind));
  for (const [i, p] of order.entries()) {
    if (!s.budget[side]) break;
    const cards = Object.keys(E.CARDS).filter(id => E.CARDS[id].kind === p.kind);
    for (const index of style === 'spread' ? [(i + variant) % 3] : [[0, 1], [0, 2], [1, 2]][variant]) if (s.budget[side]) E.learn(s, p.id, cards[index]);
  }
}
const totals = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
for (const trial of data.trials) {
  const {offset, removed, inserted} = trial.patch;
  assert.equal(source.slice(offset, offset + removed.length), removed);
  const candidate = source.slice(0, offset) + inserted + source.slice(offset + removed.length);
  assert.equal(hash(candidate), trial.plan.sourceSHA256.candidate);
  const models = {baseline: engine(source), candidate: engine(candidate)}, {E} = models.baseline;
  const remaining = new Set(trial.plan.inputs.map(input => JSON.stringify(input)));
  const counts = {...totals};
  for (const run of trial.runs) {
    const {input} = run; assert(remaining.delete(JSON.stringify(input)), '重复或未计划的起点');
    const expected = E.create(input.scenario);
    setup(E, expected, input.aSide, input.style, input.aVariant);
    setup(E, expected, E.OTHER[input.aSide], input.comparator, input.bVariant);
    assert.equal(expected.budget.red, 0); assert.equal(expected.budget.black, 0);
    assert(expected.pieces.every(p => p.hp === 18 && p.learned.length <= 2)); E.start(expected);
    const rng = {[input.aSide]: random(input.seedA), [E.OTHER[input.aSide]]: random(input.seedB)};
    const controller = side => models[input.models[side]].C;
    const stats = {moves: 0, rests: 0, passes: 0, battles: 0, rounds: 0, retreats: 0, reversals: 0}, last = new Map();
    let s, activity;
    for (const [op, ...args] of run.commands) {
      totals.commands++;
      if (op === 'create') {assert(!s); s = E.create(...args); continue;}
      if (op === 'start') activity = Object.fromEntries(s.pieces.map(p => [p.id, {side: p.side, kind: p.kind, cards: Array.from(p.learned), moves: 0, rests: 0, attacks: 0, defenses: 0, damage: 0, captures: 0, cardUses: 0}]));
      if (['pass', 'rest', 'move'].includes(op)) {
        assert.equal(s.phase, 'board'); const before = JSON.stringify(s);
        const action = controller(s.turn).board(s, rng[s.turn], 'standard'); totals.boardChoices++;
        assert.equal(JSON.stringify(s), before);
        assert.deepEqual([action.type, ...(action.type === 'move' ? [action.id, action.x, action.y] : action.type === 'rest' ? [action.id, action.card] : [])], [op, ...args]);
        if (op === 'pass') stats.passes++;
        else if (op === 'rest') {stats.rests++; activity[args[0]].rests++;}
        else {
          const p = E.get(s, args[0]), target = E.at(s, args[1], args[2]);
          if (target) {stats.battles++; activity[p.id].attacks++; activity[target.id].defenses++; last.delete(p.id);}
          else {stats.moves++; activity[p.id].moves++; const prior = last.get(p.id); if (prior && prior[0] === args[1] && prior[1] === args[2]) stats.reversals++; last.set(p.id, [p.x, p.y]);}
        }
      }
      if (op === 'retreat' || op === 'resolve') {
        assert.equal(s.phase, 'duel'); const before = JSON.stringify(s);
        const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), aId = controller(a.side).combat(s, a.side, rng[a.side], 'standard'); totals.combatChoices++;
        if (op === 'retreat') {assert.equal(aId, 'retreat'); stats.retreats++;}
        else {
          const dId = controller(d.side).combat(s, d.side, rng[d.side], 'standard'); totals.combatChoices++;
          assert.deepEqual([aId, dId], args); stats.rounds++; const r = E.roundDamage(s.duel, ...args);
          activity[a.id].damage += Math.min(d.hp, r.toD); activity[d.id].damage += Math.min(a.hp, r.toA);
          if (r.toD >= d.hp) activity[a.id].captures++; if (r.toA >= a.hp) activity[d.id].captures++;
          if (E.CARDS[aId]) activity[a.id].cardUses++; if (E.CARDS[dId]) activity[d.id].cardUses++;
        }
        assert.equal(JSON.stringify(s), before);
      }
      E[op](s, ...args);
      if (op === 'start') assert.equal(JSON.stringify(s), JSON.stringify(expected));
    }
    assert.equal(s.phase, 'ended'); assert.equal(s.ply, run.plies); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason);
    assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); assert.deepEqual(activity, run.pieceActivity);
    for (const [key, value] of Object.entries(stats)) assert.equal(value, run[key]); totals.games++;
    if (totals.games % 12 === 0) console.log(JSON.stringify(totals));
  }
  assert.equal(remaining.size, 0);
  for (const key of Object.keys(totals)) assert.equal(totals[key] - counts[key], trial.verification[key]);
  for (const mode of ['quick', 'full']) {
    const rows = trial.runs.filter(r => r.input.group !== 'known' && r.input.scenario === mode), summary = trial.summary.summary[mode];
    const direct = rows.filter(r => r.input.models.red !== r.input.models.black);
    const points = direct.map(r => r.winner === 'draw' ? .5 : r.input.models[r.winner] === 'candidate' ? 1 : 0);
    assert.deepEqual(summary.direct, {games: points.length, wins: points.filter(n => n === 1).length, draws: points.filter(n => n === .5).length, losses: points.filter(n => n === 0).length, points: points.reduce((a, b) => a + b, 0)});
    for (const model of ['baseline', 'candidate']) {
      const self = rows.filter(r => r.input.models.red === model && r.input.models.black === model), plies = self.map(r => r.plies).sort((a, b) => a - b), total = plies.reduce((a, b) => a + b, 0);
      assert.deepEqual(summary[model + 'Self'], {games: self.length, totalPlies: total, meanPlies: total / self.length, medianPlies: (plies[(plies.length - 1) >> 1] + plies[plies.length >> 1]) / 2, maxPlies: plies.at(-1), draws: self.filter(r => r.winner === 'draw').length, over200: plies.filter(p => p > 200).length, singleDamageWins: self.filter(r => r.winner !== 'draw' && Object.values(r.pieceActivity).filter(p => p.side === r.winner && p.damage > 0).length === 1).length});
    }
  }
}
assert.equal(totals.games, 144);
console.log(JSON.stringify({...totals, allChoicesRecomputed: true, allTerminalHashesMatch: true, allPieceActivityMatches: true}));
