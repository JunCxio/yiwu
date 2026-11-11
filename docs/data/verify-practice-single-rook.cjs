const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex'), data = JSON.parse(fs.readFileSync(path.join(__dirname, 'practice-single-rook-0.6.113.json')));
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../index.html'), 'utf8'); assert.equal(hash(source), data.sourceSHA256);
const reference = JSON.parse(fs.readFileSync(path.join(__dirname, 'king-repetition-0.6.113.json'))).trials.find(t => t.name === 'followup').runs.find(r => JSON.stringify(r.input) === JSON.stringify(data.referenceInput));
assert(reference); assert.equal(reference.plies, 80); assert.equal(reference.winner, 'black');
const box = vm.createContext({}); for (const m of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(m[1], box);
const E = box.Yiwu, C = box.YiwuComputer, random = seed => () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;}, totals = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
assert.equal(data.runs.length, 2); assert.deepEqual(data.limits, {plies: 2000, steps: 14000});
for (const [index, run] of data.runs.entries()) {
  const {input} = run, {transfer, ...initial} = input; assert.deepEqual(initial, data.referenceInput);
  assert.deepEqual(transfer, index ? {from: 'black_rook_3', card: 'rook_lock', to: 'black_guard_1', received: 'guard_palace'} : null);
  let expected; for (const [op, ...args] of reference.commands) {if (op === 'start') break; if (op === 'create') expected = E.create(...args); else E[op](expected, ...args);}
  if (transfer) {E.learn(expected, transfer.from, transfer.card); E.learn(expected, transfer.to, transfer.received);}
  assert.equal(expected.budget.red, 0); assert.equal(expected.budget.black, 0); assert(expected.pieces.every(p => p.hp === 18 && p.learned.length <= 2)); E.start(expected);
  const rng = {[input.aSide]: random(input.seedA), [E.OTHER[input.aSide]]: random(input.seedB)}, stats = {moves: 0, rests: 0, passes: 0, battles: 0, rounds: 0, retreats: 0, reversals: 0}, last = new Map(), contexts = []; let s, activity;
  for (const [op, ...args] of run.commands) {
    totals.commands++; if (op === 'create') {assert(!s); s = E.create(...args); continue;}
    if (op === 'start') activity = Object.fromEntries(s.pieces.map(p => [p.id, {side: p.side, kind: p.kind, cards: Array.from(p.learned), moves: 0, rests: 0, attacks: 0, defenses: 0, damage: 0, captures: 0, cardUses: 0}]));
    const before = JSON.stringify(s);
    if (['pass', 'rest', 'move'].includes(op)) {
      assert.equal(s.phase, 'board'); const action = C.board(s, rng[s.turn], 'practice'); totals.boardChoices++;
      assert.deepEqual([action.type, ...(action.type === 'move' ? [action.id, action.x, action.y] : action.type === 'rest' ? [action.id, action.card] : [])], [op, ...args]);
      if (op === 'pass') stats.passes++; else if (op === 'rest') {stats.rests++; activity[args[0]].rests++;} else {
        const p = E.get(s, args[0]), target = E.at(s, args[1], args[2]);
        if (target) {stats.battles++; activity[p.id].attacks++; activity[target.id].defenses++; last.delete(p.id); const ctx = E.context(s, p, target); contexts.push({ply: s.ply + 1, attacker: p.id, defender: target.id, powerA: E.power(ctx, true), powerD: E.power(ctx, false), supportA: Array.from(ctx.supportA), supportD: Array.from(ctx.supportD)});}
        else {stats.moves++; activity[p.id].moves++; const previous = last.get(p.id); if (previous && previous[0] === args[1] && previous[1] === args[2]) stats.reversals++; last.set(p.id, [p.x, p.y]);}
      }
    }
    if (op === 'retreat' || op === 'resolve') {
      assert.equal(s.phase, 'duel'); const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), aId = C.combat(s, a.side, rng[a.side], 'practice'); totals.combatChoices++;
      if (op === 'retreat') {assert.equal(aId, 'retreat'); stats.retreats++;} else {
        const dId = C.combat(s, d.side, rng[d.side], 'practice'); totals.combatChoices++; assert.deepEqual([aId, dId], args); stats.rounds++;
        const r = E.roundDamage(s.duel, ...args); activity[a.id].damage += Math.min(d.hp, r.toD); activity[d.id].damage += Math.min(a.hp, r.toA);
        if (r.toD >= d.hp) activity[a.id].captures++; if (r.toA >= a.hp) activity[d.id].captures++; if (E.CARDS[aId]) activity[a.id].cardUses++; if (E.CARDS[dId]) activity[d.id].cardUses++;
      }
    }
    assert.equal(JSON.stringify(s), before); E[op](s, ...args); if (op === 'start') assert.equal(JSON.stringify(s), JSON.stringify(expected));
  }
  assert.equal(s.phase, 'ended'); assert.equal(s.ply, run.plies); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256);
  assert(s.ply < data.limits.plies && stats.moves + stats.rests + stats.passes + stats.battles + stats.rounds + stats.retreats < data.limits.steps);
  assert.deepEqual(activity, run.pieceActivity); assert.deepEqual(contexts, run.contexts); for (const [key, value] of Object.entries(stats)) assert.equal(value, run[key]);
  if (!index) {assert.deepEqual(run.commands, reference.commands); assert.equal(run.terminalSHA256, reference.terminalSHA256);}
  const attackers = Object.entries(activity).filter(([id, p]) => p.side === 'black' && (p.damage || p.attacks)); assert.deepEqual(attackers.map(([id]) => id), ['black_rook_3']);
  assert.equal(activity.black_rook_3.damage, 18); assert(contexts.every(ctx => ctx.attacker === 'black_rook_3' && ctx.defender === 'red_king_0' && !ctx.supportA.length && ctx.powerA === 3 && ctx.powerD >= 4));
  if (index) {assert.equal(s.ply, 82); assert.equal(s.winner, 'black'); assert.equal(activity.black_rook_3.cards.length, 0); assert.equal(activity.black_rook_3.cardUses, 0);}
  totals.games++;
}
console.log(JSON.stringify({...totals, equalBudget: true, originalControlReproduced: true, transferredRookUntrained: true, allInputsUnchanged: true, allTerminalHashesMatch: true}, null, 2));
