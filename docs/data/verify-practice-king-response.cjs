const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex'), copy = value => JSON.parse(JSON.stringify(value));
const data = require('./practice-king-response-0.6.113.json'), originals = require('./practice-single-rook-0.6.113.json');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../index.html'), 'utf8'); assert.equal(hash(source), data.sourceSHA256); assert.equal(data.sourceSHA256, originals.sourceSHA256);
const box = vm.createContext({}); for (const m of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(m[1], box);
const E = box.Yiwu, C = box.YiwuComputer, random = seed => () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
assert.deepEqual(data.referenceInput, originals.referenceInput); assert.equal(data.completed, true); assert.deepEqual(data.errors, []);
const reference = originals.runs[0], inputs = [{type: 'control'}, {type: 'king-standard'}];
for (const commandIndex of [86, 95, 103]) {
  let s;
  for (const [i, [op, ...args]] of reference.commands.entries()) {
    if (op === 'create') s = E.create(...args);
    else if (i === commandIndex) {
      assert.equal(op, 'resolve'); assert.equal(s.duel.d, 'red_king_0');
      for (const id of C.choices(s, E.get(s, s.duel.d), s.duel)) if (id !== args[1]) inputs.push({type: 'single-defense', commandIndex, id});
      break;
    } else E[op](s, ...args);
  }
}
assert.deepEqual(data.inputs, inputs); assert.equal(inputs.length, 11); assert.equal(data.runs.length, inputs.length);
const totals = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0, auditedRounds: 0};
for (const [index, run] of data.runs.entries()) {
  const {input} = run; assert.deepEqual(input, inputs[index]);
  const rng = {[data.referenceInput.aSide]: random(data.referenceInput.seedA), [E.OTHER[data.referenceInput.aSide]]: random(data.referenceInput.seedB)};
  let s, activity, changed = 0, replaced = false, steps = 0, initialHP;
  for (const [commandIndex, [op, ...args]] of run.commands.entries()) {
    totals.commands++; if (op === 'create') {assert(!s); assert.equal(commandIndex, 0); assert.deepEqual([op, ...args], reference.commands[0]); s = E.create(...args); continue;}
    const before = JSON.stringify(s);
    if (s.phase === 'board') {
      assert(['move', 'rest', 'pass'].includes(op)); const action = C.board(s, rng[s.turn], 'practice'); totals.boardChoices++; steps++;
      assert.deepEqual(copy([action.type, ...(action.type === 'move' ? [action.id, action.x, action.y] : action.type === 'rest' ? [action.id, action.card] : [])]), [op, ...args]);
      if (op === 'move' && E.at(s, args[1], args[2])) activity[args[0]].attacks++;
    } else if (s.phase === 'duel') {
      assert(['resolve', 'retreat'].includes(op)); const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), aId = C.combat(s, a.side, rng[a.side], 'practice'); totals.combatChoices++; steps++;
      if (op === 'retreat') assert.equal(aId, 'retreat');
      else {
        const roll = rng[d.side](), ordinary = C.combat(s, d.side, () => roll, 'practice'); let dId = ordinary; totals.combatChoices++;
        if (input.type === 'king-standard' && d.id === 'red_king_0') dId = C.combat(s, d.side, () => roll, 'standard');
        if (input.type === 'single-defense' && commandIndex === input.commandIndex) {assert.equal(d.id, 'red_king_0'); dId = input.id; replaced = true;}
        if (dId !== ordinary) changed++; assert.deepEqual([aId, dId], args);
        const damage = E.roundDamage(s.duel, ...args); activity[a.id].damage += Math.min(d.hp, damage.toD); activity[d.id].damage += Math.min(a.hp, damage.toA);
        if (damage.toD >= d.hp) activity[a.id].captures++; if (damage.toA >= a.hp) activity[d.id].captures++;
      }
    } else {assert.equal(s.phase, 'setup'); assert(['learn', 'start'].includes(op)); assert.deepEqual([op, ...args], reference.commands[commandIndex]);}
    assert.equal(JSON.stringify(s), before); E[op](s, ...args);
    if (op === 'start') {
      assert.equal(s.budget.red, 0); assert.equal(s.budget.black, 0); assert(s.pieces.every(p => p.hp === 18 && p.learned.length <= 2));
      initialHP = s.pieces.reduce((n, p) => n + p.hp, 0); activity = Object.fromEntries(s.pieces.map(p => [p.id, {damage: 0, attacks: 0, captures: 0}]));
    }
  }
  assert.equal(s.phase, 'ended'); assert.equal(s.ply, run.plies); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256);
  assert.deepEqual(activity, run.activity); assert.equal(changed, run.changes); assert.equal(steps, run.steps); assert(s.ply < originals.limits.plies && steps < originals.limits.steps);
  assert.equal(Object.values(activity).reduce((n, p) => n + p.damage, 0), initialHP - s.pieces.reduce((n, p) => n + p.hp, 0));
  if (input.type === 'control') {assert.deepEqual(run.commands, reference.commands); assert.equal(run.terminalSHA256, reference.terminalSHA256);}
  if (input.type === 'single-defense') {assert(replaced); assert.equal(changed, 1); assert.deepEqual(run.commands.slice(0, input.commandIndex), reference.commands.slice(0, input.commandIndex));}
  totals.games++;
}
assert.equal(data.combatAudit.length, 2);
for (const [runIndex, run] of originals.runs.entries()) {
  let s; const rounds = [];
  for (const [commandIndex, [op, ...args]] of run.commands.entries()) {
    if (op === 'create') {s = E.create(...args); continue;}
    if (op === 'resolve') {
      const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), before = JSON.stringify(s); assert.equal(d.id, 'red_king_0');
      const attacker = C.practicePlan(s, a.side), practice = C.practicePlan(s, d.side), standard = C.combatPlan(s, d.side);
      const rows = C.choices(s, d, s.duel).map(id => {
        const outcomes = C.choices(s, a, s.duel).map(other => {
          const damage = E.roundDamage(s.duel, other, id), next = JSON.parse(before); E.resolve(next, other, id);
          return {other, toA: damage.toA, toD: damage.toD, forceAfterA: damage.forceAfterA, forceAfterD: damage.forceAfterD, winner: next.winner || null, phase: next.phase,
            nextForcedLoss: next.phase === 'duel' && C.twoRoundWinningChoices(next, a.side).length > 0};
        });
        return {id, practiceWeight: practice.find(x => x.id === id)?.weight || 0, standardWeight: standard.find(x => x.id === id)?.weight || 0, outcomes,
          expectedDamage: attacker.reduce((n, x) => n + x.weight * outcomes.find(o => o.other === x.id).toD, 0),
          lossProbability: attacker.reduce((n, x) => n + x.weight * Number(outcomes.find(o => o.other === x.id).winner === a.side), 0), worstDamage: Math.max(...outcomes.map(o => o.toD))};
      });
      assert.equal(JSON.stringify(s), before); totals.auditedRounds++;
      rounds.push({commandIndex, ply: s.ply, round: s.duel.round, hpA: a.hp, hpD: d.hp, forceA: s.duel.forceA, forceD: s.duel.forceD, actual: args, actualDamage: E.roundDamage(s.duel, ...args), practice, standard, rows});
    }
    E[op](s, ...args);
  }
  assert.deepEqual(copy({runIndex, plies: s.ply, winner: s.winner, rounds}), data.combatAudit[runIndex]); assert.equal(hash(JSON.stringify(s)), run.terminalSHA256);
}
assert.equal(totals.games, 11); assert.equal(totals.commands, 2948); assert.equal(totals.auditedRounds, 15);
console.log(JSON.stringify({...totals, allChoicesRecomputed: true, originalControlReproduced: true, singleChoicePrefixesMatch: true, inputQueriesUnchanged: true, allTerminalHashesMatch: true}, null, 2));
