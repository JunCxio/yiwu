const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2).map(m => m[1]);
const helper = scripts[1].includes('function cardReplacements(') ? 'cardReplacements' : 'endingCardReplacements';
const pattern = new RegExp('  function ' + helper + '\\(s,side,ids\\)\\{[\\s\\S]*?\\n  \\}');
function engine(spare = true) {
  const box = vm.createContext({}); vm.runInContext(scripts[0], box);
  const code = spare ? scripts[1] : scripts[1].replace(pattern, '  function ' + helper + '(){return new Map();}');
  vm.runInContext(code.replace('return {actions,', 'return {cardReplacements:' + helper + ',actions,'), box);
  return {E: box.Yiwu, C: box.YiwuComputer};
}
const {E, C} = engine(), raw = engine(false).C;
const fixtures = require('./computer-continuing-cards-fixture.json');
const copy = x => JSON.parse(JSON.stringify(x));
let states = 0, branches = 0;
for (const fixture of fixtures) for (const rotated of [false, true]) {
  let s;
  for (const [op, ...args] of fixture.commands) {if (op === 'create') s = E.create(...args); else E[op](s, ...args);}
  if (rotated) {
    s.turn = E.OTHER[s.turn];
    for (const p of s.pieces) {p.side = E.OTHER[p.side]; p.x = 8 - p.x; p.y = 9 - p.y;}
    s.repetitions = Object.fromEntries(Object.entries(s.repetitions).map(([key, count]) => {const [turn, pieces] = JSON.parse(key); return [JSON.stringify([E.OTHER[turn], pieces.map(([id, x, y, ...rest]) => [id, 8 - x, 9 - y, ...rest])]), count];}));
  }
  const side = rotated ? E.OTHER[fixture.side] : fixture.side, isA = E.get(s, s.duel.a).side === side;
  const mine = E.get(s, isA ? s.duel.a : s.duel.d), enemy = E.get(s, isA ? s.duel.d : s.duel.a), before = JSON.stringify(s);
  assert.equal(s.phase, 'duel'); assert(s.duel.round < 6);
  for (const reply of C.choices(s, enemy, s.duel)) {
    const b = copy(s), c = copy(s);
    E.resolve(b, isA ? fixture.base : reply, isA ? reply : fixture.base);
    E.resolve(c, isA ? fixture.id : reply, isA ? reply : fixture.id);
    assert.equal(b.phase, 'duel'); assert.equal(c.phase, 'duel');
    assert(!E.get(b, mine.id).exhausted.includes(fixture.id));
    assert(E.get(c, mine.id).exhausted.includes(fixture.id));
    E.get(c, mine.id).exhausted = E.get(c, mine.id).exhausted.filter(id => id !== fixture.id);
    for (const key of [isA ? 'aName' : 'dName', isA ? 'gainA' : 'gainD']) c.duel.history.at(-1)[key] = b.duel.history.at(-1)[key];
    assert.deepEqual(c, b); branches++;
  }
  const unspared = copy(raw.combatPlan(s, side)), plan = copy(C.combatPlan(s, side));
  const weight = unspared.find(p => p.id === fixture.id)?.weight;
  assert(weight > 0, '原策略必须实际保留无效耗牌概率');
  assert(!plan.some(p => p.id === fixture.id), '持续武斗应省下没有实际作用的培养牌');
  assert.deepEqual(plan.map(p => p.id), unspared.filter(p => p.id !== fixture.id).map(p => p.id));
  for (const item of plan) assert(Math.abs(item.weight - unspared.find(p => p.id === item.id).weight - (item.id === fixture.base ? weight : 0)) < 1e-12);
  assert.notEqual(C.combat(s, side, () => fixture.roll), fixture.id);
  for (const type of Object.keys(E.BASE)) {
    const sum = list => list.filter(p => (E.BASE[p.id] || E.CARDS[p.id])?.type === type).reduce((n, p) => n + p.weight, 0);
    assert(Math.abs(sum(plan) - sum(unspared)) < 1e-12);
  }
  assert(C.practicePlan(s, side).some(p => p.id === fixture.id && p.weight > 0));
  assert.equal(C.cardReplacements(s, side, [fixture.id]).size, 0, '基础招式不在保留集合时不能转移概率');
  const useful = copy(s); useful.duel[isA ? 'forceA' : 'forceD'] = fixture.id === 'horse_turn' ? 1 : 0;
  assert(!C.cardReplacements(useful, side, C.choices(useful, E.get(useful, mine.id), useful.duel)).has(fixture.id), '培养牌仍能增加气势时应保留');
  const spent = copy(s); E.get(spent, mine.id).exhausted.push(fixture.id);
  assert(!C.combatPlan(spent, side).some(p => p.id === fixture.id));
  assert.equal(JSON.stringify(s), before); states++;
}
console.log(JSON.stringify({states, actualBranches: branches, weightsTransferredOnly: true, inputUnchanged: true}));
