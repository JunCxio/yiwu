const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const box = vm.createContext({});
vm.runInContext(scripts[0], box);
vm.runInContext(scripts[1], box);
const helpers = ['cardUnavailable', 'supportDetailsHTML', 'combatForecastHTML', 'combatRepliesHTML', 'combatFollowUpRisk', 'openingAdvice', 'pawnEndRankRisk', 'firstRoundLossRisk', 'previewBoardAction', 'actionOutcomeRisk', 'boardAdvice', 'challengeCombatHTML', 'previewHTML'].map(name => {
  const source = scripts[2].match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'));
  assert(source, '缺少界面函数：' + name);
  return source[0];
});
const escape = scripts[2].match(/,esc=([^\n]+);/);
assert(escape);
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc=' + escape[1] + '; let s,lesson=null,selected,preview;\n' + helpers.join('\n'), box);
const E = box.Yiwu;
const load = mode => {
  const s = E.create(mode);
  box.state = s;
  vm.runInContext('s=state', box);
  return s;
};

const conditions = [
  ['rook_crush', 'isolatedEnemy', '黑方有 1 名支援'],
  ['horse_join', 'supported', '友军须能攻击交战目标格'],
  ['cannon_screen', 'friendlyScreen', '本场未使用己方炮架'],
  ['cannon_hold', 'unsupported', '红方有 1 名支援'],
  ['pawn_rank', 'adjacent', '没有正交相邻的友军'],
  ['pawn_advance', 'crossed', '尚未过河'],
  ['guard_king', 'nearKing', '不在己方将帅周围一格内']
];
assert.deepEqual(new Set(conditions.map(c => c[1])), new Set(Object.values(E.CARDS).map(c => c.condition).filter(Boolean)));
for (const [id, condition, message] of conditions) {
  const s = load('tactics'), a = E.get(s, 'hero'), d = E.get(s, 'target');
  a.kind = E.CARDS[id].kind;
  a.learned = [id];
  E.get(s, 'wing').x = 1;
  const ctx = E.context(s, a, d);
  ctx.supportA = condition === 'unsupported' ? ['wing'] : [];
  ctx.supportD = condition === 'isolatedEnemy' ? [d.id] : [];
  if (condition === 'friendlyScreen') ctx.screen = d.id;
  const before = JSON.stringify([s, ctx]);
  assert.equal(E.availability(s, a, id, ctx), '站位条件未满足');
  assert(box.cardUnavailable(a, id, ctx).includes(message), id);
  assert.equal(JSON.stringify([s, ctx]), before);
}

{
  const s = load('tactics'), a = E.get(s, 'hero'), d = E.get(s, 'target'), ctx = E.context(s, a, d);
  a.learned = ['pawn_advance', 'pawn_grit'];
  a.exhausted = ['pawn_advance'];
  ctx.forceA = 2;
  assert.equal(box.cardUnavailable(a, 'pawn_advance', ctx), '已耗尽，需在棋盘整备');
  assert.equal(box.cardUnavailable(a, 'focus', ctx), '气势已满，请保留或释放');
  assert.equal(box.cardUnavailable(a, 'pawn_grit', ctx), '');
  assert.equal(box.cardUnavailable(a, 'strike', ctx), '');
  d.learned = ['cannon_screen'];
  assert(box.cardUnavailable(d, 'cannon_screen', ctx).includes('本子是守方'));
  a.kind = 'cannon';
  a.learned = ['cannon_screen'];
  ctx.screen = 'wing';
  assert.equal(box.cardUnavailable(a, 'cannon_screen', ctx), '');
}

{
  const s = load('support'), a = E.get(s, 'hero'), d = E.get(s, 'target');
  let h = box.supportDetailsHTML(E.context(s, a, d), false);
  assert(h.includes('1 路 6 线') && h.includes('9 路 6 线'));
  assert.equal((h.match(/<li>/g) || []).length, 2);
  s.pieces.push({id: 'blocker', side: 'red', kind: 'pawn', x: 2, y: 4, hp: 18, learned: [], exhausted: []});
  h = box.supportDetailsHTML(E.context(s, a, d), false);
  assert(!h.includes('1 路 6 线') && h.includes('9 路 6 线'));
  assert(h.includes('基础 3 + 支援 1'));
}

{
  const s = load('support'), a = E.get(s, 'hero'), d = E.get(s, 'target');
  s.pieces.push({id: 'extra', side: 'black', kind: 'rook', x: 4, y: 1, hp: 18, learned: [], exhausted: []});
  const ctx = E.context(s, a, d), before = JSON.stringify([s, ctx]);
  const h = box.supportDetailsHTML(ctx, false);
  assert.equal((h.match(/<li>/g) || []).length, 3);
  assert(h.includes('基础 3 + 支援 2') && h.includes('3 名支援，输出最多加 2'));
  assert(h.includes('5 路 9 线'));
  assert(box.supportDetailsHTML(ctx, true).includes('无支援'));
  assert.equal(JSON.stringify([s, ctx]), before);
}

function combat(kindA = 'pawn', kindD = 'cannon') {
  const s = load('tactics'), a = E.get(s, 'hero'), d = E.get(s, 'target');
  a.kind = kindA; d.kind = kindD;
  for (const p of [a, d]) p.learned = Object.keys(E.CARDS).filter(id => E.CARDS[id].kind === p.kind).slice(0, 2);
  s.duel = E.context(s, a, d); s.phase = 'duel'; return {s, a, d};
}
const range = values => {const lo = Math.min(...values), hi = Math.max(...values); return lo === hi ? String(lo) : lo + '–' + hi;};
{
  const kinds = Object.keys(E.NAMES.red);
  for (let i = 0; i < kinds.length; i++) for (const hp of [1, 6, 18]) for (const force of [0, 2]) {
    const {s, a, d} = combat(kinds[i], kinds[(i + 1) % kinds.length]); a.hp = hp; d.hp = 19 - hp;
    s.duel.forceA = force; s.duel.forceD = 2 - force;
    for (const who of [a, d]) for (const id of Object.keys(E.BASE).concat(who.learned).filter(id => !E.availability(s, who, id, s.duel))) {
      const enemy = who === a ? d : a, before = JSON.stringify(s);
      const results = Object.keys(E.BASE).concat(enemy.learned).filter(reply => !E.availability(s, enemy, reply, s.duel)).map(reply => {
        const copy = JSON.parse(before), r = E.resolve(copy, who === a ? id : reply, who === a ? reply : id);
        return {mine: who === a ? r.hpA : r.hpD, enemy: who === a ? r.hpD : r.hpA};
      });
      const h = box.combatForecastHTML(who, id);
      assert(h.includes(E.SIDE[who.side] + '生命 ' + range(results.map(r => r.mine))), id);
      assert(h.includes(E.SIDE[enemy.side] + '生命 ' + range(results.map(r => r.enemy))), id);
      const risk = results.every(r => r.mine === 0) ? '本子本轮必定阵亡' : results.some(r => r.mine === 0) ? '本子本轮可能阵亡' : '本子本轮可存活';
      assert(h.includes(risk), risk); assert.equal(JSON.stringify(s), before);
    }
  }
}
{
  const {s, a, d} = combat(); a.hp = 1; d.hp = 1; s.duel.forceD = 2;
  const h = box.combatForecastHTML(a, 'strike');
  assert(h.includes('本子本轮必定阵亡') && h.includes('红方生命 0') && h.includes('黑方生命 0'));
  assert(h.includes('全部合法回应') && h.includes('双方同时结算'));
  assert(!h.includes('必胜') && !h.includes('胜率'));
}
{
  const {s, a, d} = combat(); a.hp = 2;
  const before = JSON.stringify(s), h = box.combatForecastHTML(a, 'guard');
  assert(h.includes('本子本轮可能阵亡'));
  a.hp = 18; assert(box.combatForecastHTML(a, 'guard').includes('本子本轮可存活'));
  a.hp = 2; assert.equal(JSON.stringify(s), before);
  const original = box.combatForecastHTML(a, 'guard');
  box.fightUI = {first: 'strike', computerChoice: 'focus'};
  assert.equal(box.combatForecastHTML(a, 'guard'), original);
  box.fightUI = {first: 'break', computerChoice: 'guard'};
  assert.equal(box.combatForecastHTML(a, 'guard'), original);
}
{
  const {s, a, d} = combat();
  a.learned = ['pawn_grit']; a.exhausted = []; d.learned = ['cannon_hold']; d.exhausted = [];
  const ready = box.combatForecastHTML(a, 'strike');
  d.exhausted = ['cannon_hold']; const exhausted = box.combatForecastHTML(a, 'strike');
  assert.notEqual(ready, exhausted);
  a.exhausted = ['pawn_grit']; assert.throws(() => box.combatForecastHTML(a, 'pawn_grit'), /不可用/);
  s.duel.forceA = 2; assert.throws(() => box.combatForecastHTML(a, 'focus'), /不可用/);
}
{
  const {a} = combat(); assert.equal(box.combatForecastHTML(a, null), '');
  vm.runInContext('lesson={stage:"counter"}', box); assert.equal(box.combatForecastHTML(a, 'strike'), '');
  vm.runInContext('lesson=null', box);
}
{
  for (const rotated of [false, true]) {
    const s = load('attrition'); s.repetitions = {};
    s.pieces = [E.piece('rk', 'red', 'king', 4, 9), E.piece('bk', 'black', 'king', 3, 0), E.piece('hero', 'red', 'rook', 4, 5), E.piece('attacker', 'black', 'rook', 4, 0), E.piece('target', 'black', 'pawn', 0, 5)];
    E.get(s, 'rk').hp = 1; E.get(s, 'target').hp = 1;
    if (rotated) {s.turn = 'black'; for (const p of s.pieces) {p.side = E.OTHER[p.side]; p.x = 8 - p.x; p.y = 9 - p.y;}}
    const ctx = E.context(s, E.get(s, 'hero'), E.get(s, 'target')), before = JSON.stringify([s, ctx]), advice = box.openingAdvice(ctx);
    assert(advice.reason.includes('并保住进攻子')); assert(advice.risk.includes('将帅漏防风险'));
    assert.equal(JSON.stringify([s, ctx]), before);
    E.get(s, 'rk').hp = 18; assert(!box.openingAdvice(ctx).risk);
  }
}
function edgeScene(side, y, target = false) {
  const s = load('tactics'), edge = side === 'red' ? 0 : 9;
  s.turn = side; s.repetitions = {};
  s.pieces = [E.piece('rk', 'red', 'king', 4, 9), E.piece('bk', 'black', 'king', 5, 0), E.piece('pawn', side, 'pawn', 3, y)];
  if (target) s.pieces.push(E.piece('target', E.OTHER[side], 'pawn', 3, edge));
  return s;
}
const edgeNotes = advice => advice.risks.filter(text => text.includes('位于对方底线'));
for (const side of ['red', 'black']) {
  const edge = side === 'red' ? 0 : 9, beforeEdge = side === 'red' ? 1 : 8;
  for (const [y, x] of [[beforeEdge, 3], [edge, 2]]) {
    const s = edgeScene(side, y), before = JSON.stringify(s), action = {type: 'move', id: 'pawn', x, y: edge};
    const advice = box.boardAdvice(action), notes = edgeNotes(advice);
    assert.equal(notes.length, 1);
    assert(notes[0].startsWith('移动后，') && notes[0].includes('只能横移，不能后退，也不会升变'));
    assert.equal(JSON.stringify(s), before, '查看落点后果不能移动或追加行动');
    const next = JSON.parse(before); E.move(next, action.id, action.x, action.y);
    const pawn = E.get(next, 'pawn'), moves = E.moves(next, pawn);
    assert.equal(pawn.kind, 'pawn'); assert(moves.length > 0);
    assert(moves.every(move => move.y === edge && Math.abs(move.x - pawn.x) === 1));
  }
}

for (const side of ['red', 'black']) {
  const edge = side === 'red' ? 0 : 9, s = edgeScene(side, side === 'red' ? 1 : 8, true);
  E.get(s, 'target').hp = 1;
  box.pawnId = 'pawn'; box.targetId = 'target'; vm.runInContext('selected=pawnId;preview=targetId', box);
  const before = JSON.stringify(s), action = {type: 'move', id: 'pawn', x: 3, y: edge};
  const notes = edgeNotes(box.boardAdvice(action)), previewHTML = box.previewHTML();
  assert.equal(notes.length, 1); assert(notes[0].startsWith('若获胜并占位，'));
  assert(previewHTML.includes(notes[0]) && previewHTML.includes('发起武斗'));
  assert.equal(JSON.stringify(s), before, '查看进攻建议和交战预览不能提前吃子');
  const next = JSON.parse(before); E.move(next, 'pawn', 3, edge); E.resolve(next, 'strike', 'focus');
  assert(!E.get(next, 'target')); assert.equal(E.get(next, 'pawn').kind, 'pawn');
  assert.equal(E.get(next, 'pawn').y, edge);
}

for (const side of ['red', 'black']) {
  const s = edgeScene(side, side === 'red' ? 2 : 7), pawn = E.get(s, 'pawn');
  assert.equal(edgeNotes(box.boardAdvice({type: 'move', id: pawn.id, x: 3, y: side === 'red' ? 1 : 8})).length, 0);
  pawn.y = side === 'red' ? 0 : 9; pawn.learned = ['pawn_grit']; pawn.exhausted = ['pawn_grit'];
  const before = JSON.stringify(s);
  assert.equal(edgeNotes(box.boardAdvice({type: 'rest', id: pawn.id, card: 'pawn_grit'})).length, 0);
  for (const kind of ['rook', 'horse', 'cannon', 'guard', 'elephant', 'king']) {
    assert.equal(box.pawnEndRankRisk({...pawn, kind}, pawn.y), '');
  }
  assert.equal(JSON.stringify(s), before);
}
for (const side of ['red', 'black']) for (const repetition of [false, true]) {
  const s = edgeScene(side, side === 'red' ? 1 : 8), action = {type: 'move', id: 'pawn', x: 3, y: side === 'red' ? 0 : 9};
  if (repetition) {
    const next = JSON.parse(JSON.stringify(s)); E.move(next, action.id, action.x, action.y);
    s.repetitions[E.key(next)] = 2;
  } else s.quiet = 79;
  const before = JSON.stringify(s), advice = box.boardAdvice(action, true);
  const next = JSON.parse(before); E.move(next, action.id, action.x, action.y);
  assert.equal(next.phase, 'ended'); assert.equal(next.winner, 'draw');
  assert(advice.risks.some(text => text.includes(next.reason)));
  assert(advice.reasons.some(text => text.includes('本局立即结束')));
  assert(!advice.risks.some(text => text.includes('首轮吃子风险')));
  assert(!advice.reasons.concat(advice.risks).some(text => /移动后可向|可继续调动|落点可被|只能横移/.test(text)));
  assert(advice.note.includes('尚未执行'));
  assert.equal(JSON.stringify(s), before);
}

{
  const s = load('challenge-tempo');
  E.rest(s, 'hero', 'rook_crush'); E.move(s, 'black_king', 5, 1); E.move(s, 'red_king', 4, 9);
  const before = JSON.stringify(s), action = {type: 'move', id: 'black_king', x: 4, y: 1};
  const advice = box.boardAdvice(action), next = JSON.parse(before); E.move(next, action.id, action.x, action.y);
  assert.equal(next.phase, 'ended'); assert.equal(next.winner, 'black');
  assert(advice.risks.some(text => text.includes(next.reason)));
  assert(advice.reasons.some(text => text.includes('本局立即结束')));
  assert(!advice.risks.some(text => text.includes('首轮吃子风险')));
  assert(!advice.reasons.concat(advice.risks).some(text => /发起武斗|可继续调动|落点可被/.test(text)));
  assert.equal(JSON.stringify(s), before);
}

for (const side of ['red', 'black']) {
  const s = edgeScene(side, side === 'red' ? 1 : 8), pawn = E.get(s, 'pawn');
  pawn.learned = ['pawn_grit']; pawn.exhausted = ['pawn_grit']; s.quiet = 79;
  const before = JSON.stringify(s), advice = box.boardAdvice({type: 'rest', id: pawn.id, card: 'pawn_grit'});
  const next = JSON.parse(before); E.rest(next, pawn.id, 'pawn_grit');
  assert.equal(next.phase, 'ended'); assert.equal(next.winner, 'draw');
  assert(advice.reasons.some(text => text.includes('本局不再有使用机会')));
  assert(!advice.risks.some(text => /仍可向|恢复后仍需/.test(text)));
  assert.equal(JSON.stringify(s), before);
}
for (const rotated of [false, true]) {
  const s = load('attrition'); s.repetitions = {};
  s.pieces = [E.piece('rk', 'red', 'king', 3, 9), E.piece('bk', 'black', 'king', 5, 0), E.piece('hero', 'red', 'rook', 4, 5), E.piece('enemy', 'black', 'rook', 3, 0)];
  E.get(s, 'hero').hp = 2;
  if (rotated) {s.turn = 'black'; for (const p of s.pieces) {p.side = E.OTHER[p.side]; p.x = 8 - p.x; p.y = 9 - p.y;}}
  const action = {type: 'move', id: 'hero', x: rotated ? 5 : 3, y: rotated ? 4 : 5};
  const before = JSON.stringify(s), advice = box.boardAdvice(action, true), next = JSON.parse(before);
  E.move(next, action.id, action.x, action.y);
  const hero = E.get(next, 'hero'), enemy = E.get(next, 'enemy'), ctx = E.context(next, enemy, hero), finishes = box.YiwuComputer.battleOutlook(next, ctx).finishes;
  assert(finishes.length); assert(advice.risks.some(text => text.includes('首轮吃子风险') && text.includes('不代表对手已决定')));
  assert(advice.note.includes('将帅两轮漏防'));assert(advice.note.includes('不预测暗招或更长序列'));
  for (const attack of finishes) for (const defense of box.YiwuComputer.choices(next, hero, ctx)) {
    const result = JSON.parse(JSON.stringify(next)); E.move(result, enemy.id, hero.x, hero.y); E.resolve(result, attack, defense);
    assert(!E.get(result, hero.id)); assert(E.get(result, enemy.id)?.hp > 0);
  }
  assert.equal(JSON.stringify(s), before);
  const p = E.get(s, 'hero'); p.x = action.x; p.learned = ['rook_crush']; p.exhausted = ['rook_crush'];
  const restBefore = JSON.stringify(s), rest = box.boardAdvice({type: 'rest', id: p.id, card: 'rook_crush'});
  assert(rest.risks.some(text => text.includes('首轮吃子风险'))); assert.equal(JSON.stringify(s), restBefore);
  const restored = JSON.parse(restBefore); E.rest(restored, p.id, 'rook_crush');
  const defender = E.get(restored, p.id), attacker = E.get(restored, 'enemy'), restCtx = E.context(restored, attacker, defender);
  const attacks = box.YiwuComputer.battleOutlook(restored, restCtx).finishes; assert(attacks.length);
  for (const attack of attacks) for (const defense of box.YiwuComputer.choices(restored, defender, restCtx)) {
    const result = JSON.parse(JSON.stringify(restored)); E.move(result, attacker.id, defender.x, defender.y); E.resolve(result, attack, defense);
    assert(!E.get(result, defender.id)); assert(E.get(result, attacker.id)?.hp > 0);
  }
}

for (const hp of [18, 1]) {
  const s = load('attrition'); s.repetitions = {};
  s.pieces = [E.piece('rk', 'red', 'king', 3, 9), E.piece('bk', 'black', 'king', 5, 0), E.piece('hero', 'red', 'rook', 4, 5), E.piece('enemy', 'black', 'rook', 3, 0)];
  E.get(s, 'hero').hp = hp; if (hp === 1) E.get(s, 'enemy').hp = 1;
  const before = JSON.stringify(s), advice = box.boardAdvice({type: 'move', id: 'hero', x: 3, y: 5}, true);
  assert(!advice.risks.some(text => text.includes('首轮吃子风险')), '只有几何威胁或同时阵亡不能宣称对手存活吃子');
  assert.equal(JSON.stringify(s), before);
}
const outcomeRecords = [
  [['create', 'challenge-support'], ['move', 'helper', 4, 4], ['resolve', 'strike', 'focus']],
  [['create', 'challenge-tempo'], ['move', 'hero', 4, 4], ['resolve', 'guard', 'guard'], ['resolve', 'strike', 'break']],
  [['create', 'challenge-tempo'], ['move', 'hero', 4, 4], ['resolve', 'break', 'break']],
  [['create', 'challenge-tempo'], ['rest', 'hero', 'rook_crush'], ['move', 'black_king', 5, 1], ['move', 'red_king', 4, 9],
    ['move', 'target', 4, 5], ...Array.from({length: 5}, () => ['resolve', 'guard', 'guard'])]
];
const drawRecord = [['create', 'challenge-support']];
for (let i = 0; i < 4; i++) drawRecord.push(['move', i % 2 ? 'enemy_rook' : 'helper', i % 2 ? 1 : 0, 4],
  ...Array.from({length: i === 3 ? 5 : 6}, () => ['resolve', 'guard', 'guard']));
outcomeRecords.push(drawRecord);
function replayOutcome(commands) {
  const s = load(commands[0][1]);
  for (const [name, ...args] of commands.slice(1)) E[name](s, ...args);
  assert.equal(s.phase, 'duel'); return s;
}
for (const commands of outcomeRecords) {
  const s = replayOutcome(commands), ctx = s.duel;
  for (const who of [E.get(s, ctx.a), E.get(s, ctx.d)]) {
    const isA = who.id === ctx.a, enemy = E.get(s, isA ? ctx.d : ctx.a);
    for (const id of box.YiwuComputer.choices(s, who, ctx)) {
      const before = JSON.stringify(s), outcomes = box.YiwuComputer.choices(s, enemy, ctx).map(reply => {
        const next = JSON.parse(before); E.resolve(next, isA ? id : reply, isA ? reply : id);
        return next.phase === 'ended' ? next.winner : null;
      });
      const html = box.combatForecastHTML(who, id);
      for (const [winner, all, some] of [['red', '必定完成', '可能完成'], ['black', '必定失败', '可能失败'], ['draw', '必定判和', '可能判和']]) {
        const count = outcomes.filter(outcome => outcome === winner).length;
        assert.equal(html.includes(all), count === outcomes.length);
        assert.equal(html.includes(some), count > 0 && count < outcomes.length);
      }
      assert.equal(html.includes('本轮挑战：'), outcomes.some(Boolean));
      if (outcomes.includes('black')) assert(html.includes('pick-forecast danger'));
      assert.equal(JSON.stringify(s), before);
    }
  }
}
{
  for (const index of [0, 3]) {
    const s = replayOutcome(outcomeRecords[index]), who = E.get(s, s.duel.a).side === 'red' ? E.get(s, s.duel.a) : E.get(s, s.duel.d);
    const html = box.combatForecastHTML(who, index ? 'focus' : 'strike');
    assert(html.includes('本子本轮可存活')); assert(html.includes('本轮挑战：必定失败'));
  }
  const s = replayOutcome(outcomeRecords[2]), html = box.combatForecastHTML(E.get(s, 'hero'), 'strike');
  assert(html.includes('本轮挑战：可能完成；可能失败'));
  const draw = replayOutcome(drawRecord);
  assert(box.combatForecastHTML(E.get(draw, 'helper'), 'guard').includes('本轮挑战：可能判和'));
}
{
  const {s, a} = combat(), before = JSON.stringify(s);
  assert(!box.combatForecastHTML(a, 'strike').includes('本轮挑战：'));
  vm.runInContext('lesson={}', box); assert.equal(box.combatForecastHTML(a, 'strike'), '');
  vm.runInContext('lesson=null', box); assert.equal(box.combatForecastHTML(a, null), '');
  assert.equal(JSON.stringify(s), before);
}
for (const commands of outcomeRecords) {
  const s = replayOutcome(commands), ctx = s.duel;
  for (const who of [E.get(s, ctx.a), E.get(s, ctx.d)]) {
    const isA = who.id === ctx.a, enemy = E.get(s, isA ? ctx.d : ctx.a);
    for (const id of box.YiwuComputer.choices(s, who, ctx)) {
      const before = JSON.stringify(s), expected = new Map(); let ongoing = false;
      for (const reply of box.YiwuComputer.choices(s, enemy, ctx)) {
        const next = JSON.parse(before); E.resolve(next, isA ? id : reply, isA ? reply : id);
        if (next.phase !== 'ended') {ongoing = true; continue;}
        expected.set((E.BASE[reply] || E.CARDS[reply]).name, {title: {red: '完成挑战', black: '挑战失败', draw: '本局判和'}[next.winner], reason: next.reason});
      }
      const html = box.combatRepliesHTML(who, id), actual = new Map();
      for (const [, names, title, reason] of html.matchAll(/<p>对手用「([^」]+)」时，([^<]+)。<\/p><small>([^<]+)<\/small>/g)) {
        for (const name of names.split('、')) {assert(!actual.has(name)); actual.set(name, {title, reason});}
      }
      assert.deepEqual(actual, expected);
      if (expected.size) {
        assert.equal(html.includes('未列出的回应本轮不会直接结束挑战'), ongoing);
        assert.equal(html.includes('challenge-check risk'), [...expected.values()].some(value => value.title === '挑战失败'));
        assert(html.includes('不预知暗招'));
      } else assert.equal(html, '');
      assert.equal(JSON.stringify(s), before);
    }
  }
}
{
  const {a} = combat(); assert.equal(box.combatRepliesHTML(a, 'strike'), '');
  const s = replayOutcome(outcomeRecords[0]), who = E.get(s, s.duel.a);
  vm.runInContext('lesson={}', box); assert.equal(box.combatRepliesHTML(who, 'strike'), '');
  vm.runInContext('lesson=null', box); assert.equal(box.combatRepliesHTML(who, null), '');
}
function kingFollowUpScene(rotated=false,extraSupport=false){
  const s=load('attrition');s.repetitions={};
  s.pieces=[['rk','red','king',4,9,9],['bk','black','king',3,0,18],['target','black','pawn',4,8,1],['br','black','rook',4,5,18],...(extraSupport?[['bh','black','horse',2,7,18]]:[])].map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));
  E.get(s,'rk').learned=['king_calm'];E.get(s,'rk').exhausted=['king_calm'];E.get(s,'target').learned=extraSupport?['pawn_grit']:['pawn_advance','pawn_grit'];
  if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  return s;
}
function actualFollowUpLoss(state,side,rounds=1){
  if(state.phase!=='board')return false;
  const king=state.pieces.find(p=>p.side===side&&p.kind==='king');
  return state.pieces.filter(p=>p.side!==side&&E.canMove(state,p,king.x,king.y)).some(p=>{
    const next=JSON.parse(JSON.stringify(state));E.move(next,p.id,king.x,king.y);
    const win=(battle,left)=>box.YiwuComputer.choices(battle,E.get(battle,p.id),battle.duel).some(id=>box.YiwuComputer.choices(battle,E.get(battle,king.id),battle.duel).every(reply=>{
      const end=JSON.parse(JSON.stringify(battle));E.resolve(end,id,reply);
      return end.phase==='ended'?end.winner===p.side:left>1&&end.phase==='duel'&&win(end,left-1);
    }));
    return win(next,rounds);
  });
}
for(const rotated of [false,true])for(const kingHp of [9,10]){
  const s=kingFollowUpScene(rotated),a=E.get(s,'rk'),d=E.get(s,'target');a.hp=kingHp;
  const ctx=E.context(s,a,d),before=JSON.stringify([s,ctx]),out=box.YiwuComputer.battleOutlook(s,ctx),advice=box.openingAdvice(ctx);
  assert.deepEqual([...out.finishes],['strike','break']);
  assert(advice.reason.includes('并保住进攻子'));assert(advice.risk.includes('吃子后漏防风险'));
  assert(advice.risk.includes('「破势」'));assert(advice.risk.includes('两轮内'));
  if(kingHp===10){assert(advice.risk.includes('「奋进」'));assert(advice.risk.includes('「斩击」在守方全部合法回应后，未发现这种下一手漏防'));}
  else{assert(advice.risk.includes('上述可吃子的招式均存在这样的回应'));assert(!advice.risk.includes('未发现这种下一手漏防'));}
  const danger=JSON.parse(JSON.stringify(s));E.move(danger,a.id,d.x,d.y);E.resolve(danger,'break','pawn_advance');assert.equal(E.get(danger,a.id).hp,kingHp-8);assert(!E.get(danger,d.id));assert(actualFollowUpLoss(danger,a.side));
  let twoRoundDanger=false;
  for(const reply of box.YiwuComputer.choices(s,d,ctx)){
    const next=JSON.parse(JSON.stringify(s));E.move(next,a.id,d.x,d.y);E.resolve(next,'strike',reply);assert(!E.get(next,d.id));assert(E.get(next,a.id).hp>0);assert(!actualFollowUpLoss(next,a.side));
    if(actualFollowUpLoss(next,a.side,2))twoRoundDanger=true;
  }
  assert.equal(twoRoundDanger,kingHp===9);
  assert.equal(JSON.stringify([s,ctx]),before);
}
for(const rotated of [false,true]){
  const s=kingFollowUpScene(rotated,true),a=E.get(s,'rk'),d=E.get(s,'target'),ctx=E.context(s,a,d),before=JSON.stringify(s),out=box.YiwuComputer.battleOutlook(s,ctx),advice=box.openingAdvice(ctx);
  assert(advice.risk.includes('上述可吃子的招式均存在这样的回应'));assert(!advice.risk.includes('在守方全部合法回应后，未发现'));
  for(const id of out.finishes)assert(box.YiwuComputer.choices(s,d,ctx).some(reply=>{
    const next=JSON.parse(JSON.stringify(s));E.move(next,a.id,d.x,d.y);E.resolve(next,id,reply);return actualFollowUpLoss(next,a.side);
  }));
  assert.equal(JSON.stringify(s),before);
}
for(const ending of ['healthy','win','draw']){
  const s=kingFollowUpScene(),a=E.get(s,'rk'),d=E.get(s,'target');
  if(ending==='healthy')a.hp=18;
  if(ending==='win'){s.pieces=s.pieces.filter(p=>p.id!=='bk');d.kind='king';d.learned=[];}
  const ctx=E.context(s,a,d),out=box.YiwuComputer.battleOutlook(s,ctx);assert(out.finishes.length);
  if(ending==='draw')for(const id of out.finishes)for(const reply of box.YiwuComputer.choices(s,d,ctx)){
    const next=JSON.parse(JSON.stringify(s));E.move(next,a.id,d.x,d.y);E.resolve(next,id,reply);s.repetitions[E.key(next)]=E.DRAW.repetitions-1;
  }
  const before=JSON.stringify(s);assert(!box.openingAdvice(ctx).risk);
  if(ending!=='healthy')for(const id of out.finishes)for(const reply of box.YiwuComputer.choices(s,d,ctx)){
    const next=JSON.parse(JSON.stringify(s));E.move(next,a.id,d.x,d.y);E.resolve(next,id,reply);assert.equal(next.phase,'ended');assert.equal(next.winner,ending==='draw'?'draw':a.side);
  }
  assert.equal(JSON.stringify(s),before);
}

{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'computer-two-round-fixture.json'),'utf8'));let s;
  for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  const before=JSON.stringify(s);box.state=s;
  const preview=vm.runInContext('s=state;selected="black_king_0";preview="red_king_0";previewHTML()',box);
  assert(preview.includes('两轮内胜局判断'));assert(preview.includes('可确保至迟下一轮获胜'));
  assert(preview.includes('按揭示后的新状态选择下一轮必胜招式'));assert(preview.includes('上述两轮判断已计入支援影响'));
  assert(!preview.includes('换一个交战目标'));assert.equal(JSON.stringify(s),before);
}

{
  const fixture=require('./computer-two-round-safety-fixture.json');let s;
  for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  box.state=s;vm.runInContext('s=state',box);const before=JSON.stringify(s);
  const action=command=>({type:command[0],id:command[1],x:command[2],y:command[3]});
  const bad=box.boardAdvice(action(fixture.beforeAction),true),good=box.boardAdvice(action(fixture.afterAction),true);
  assert(bad.risks.some(t=>t.includes('将帅漏防风险')&&t.includes('两轮内')));assert(bad.note.includes('不预测暗招'));
  assert(!good.risks.some(t=>t.includes('将帅漏防风险')));assert.equal(JSON.stringify(s),before);
}
{
  const fixture=require('./opening-followup-fixture.json'),C=box.YiwuComputer;
  const scene=(rotated=false)=>{
    let state;
    for(const [op,...args]of fixture.commands){if(op==='create')state=E.create(...args);else E[op](state,...args);}
    assert.equal(state.phase,'board');assert.equal(state.ply,14);
    if(rotated){state.turn=E.OTHER[state.turn];state.repetitions={};for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
    box.state=state;vm.runInContext('s=state',box);return state;
  };
  const query=state=>box.openingAdvice(E.context(state,E.get(state,fixture.attacker),E.get(state,fixture.target)));
  for(const rotated of [false,true]){
    const state=scene(rotated),a=E.get(state,fixture.attacker),d=E.get(state,fixture.target),enemy=E.get(state,fixture.threat),ctx=E.context(state,a,d),before=JSON.stringify([state,ctx]);
    Object.defineProperty(box,'fightUI',{configurable:true,get(){throw new Error('预览不得读取暗招');}});
    try{
      const advice=box.openingAdvice(ctx);
      assert(advice.reason.includes('并保住进攻子'));assert.equal(advice.risk,'');
      assert(advice.followUp?.includes('吃子后将帅受攻'));
      assert(advice.followUp.includes(E.label(enemy)+'（'+(enemy.x+1)+'路'+(10-enemy.y)+'线）'));
      assert(advice.followUp.includes('能发起武斗不等于必胜'));
      const action={type:'move',id:a.id,x:d.x,y:d.y};
      assert(box.boardAdvice(action).risks.includes(advice.followUp));
      box.aId=a.id;box.dId=d.id;const preview=vm.runInContext('selected=aId;preview=dId;previewHTML()',box);
      assert(preview.includes(advice.followUp));
      for(const id of C.battleOutlook(state,ctx).finishes)for(const reply of C.choices(state,d,ctx)){
        const next=JSON.parse(JSON.stringify(state));E.move(next,a.id,d.x,d.y);E.resolve(next,id,reply);
        assert.equal(next.phase,'board');assert(!E.get(next,d.id));assert(E.get(next,a.id).hp>0);
        const king=next.pieces.find(p=>p.side===a.side&&p.kind==='king'),threat=E.get(next,enemy.id);
        assert(E.canMove(next,threat,king.x,king.y));assert(!C.kingLostNext(next,a.side));
        assert.equal(C.battleOutlook(next,E.context(next,threat,king)).counters.length,0);
      }
      assert.equal(JSON.stringify([state,ctx]),before);
    }finally{delete box.fightUI;}
  }
  for(const variant of ['removed','blocked','counter','no-finish','duel','win','draw','certain-loss','challenge']){
    const state=scene(),a=E.get(state,fixture.attacker),d=E.get(state,fixture.target);
    if(variant==='removed')state.pieces=state.pieces.filter(p=>p.id!==fixture.threat);
    if(variant==='blocked')state.pieces.push(E.piece('blocker',a.side,'pawn',3,7));
    if(variant==='counter')E.get(state,fixture.threat).hp=1;
    if(variant==='no-finish')d.hp=18;
    if(variant==='duel')E.move(state,a.id,d.x,d.y);
    if(variant==='win'){state.pieces=state.pieces.filter(p=>p.side===a.side||p.kind!=='king');d.kind='king';d.learned=[];d.exhausted=[];}
    if(variant==='draw'){
      const ctx=E.context(state,a,d);
      for(const id of C.battleOutlook(state,ctx).finishes)for(const reply of C.choices(state,d,ctx)){
        const next=JSON.parse(JSON.stringify(state));E.move(next,a.id,d.x,d.y);E.resolve(next,id,reply);
        state.repetitions[E.key(next)]=E.DRAW.repetitions-1;
      }
    }
    if(variant==='certain-loss')state.pieces.find(p=>p.side===a.side&&p.kind==='king').hp=1;
    if(variant==='challenge')state.scenario='challenge-tempo';
    const before=JSON.stringify(state),advice=query(state);
    assert(!advice.followUp,variant+'不应叠加一般受攻提示');
    if(variant==='certain-loss')assert(advice.risk.includes('将帅漏防风险'));
    assert.equal(JSON.stringify(state),before);
  }
  const state=scene(),a=E.get(state,fixture.attacker),d=E.get(state,fixture.target),next=JSON.parse(JSON.stringify(state));
  E.move(next,a.id,d.x,d.y);E.resolve(next,'strike','strike');state.repetitions[E.key(next)]=E.DRAW.repetitions-1;
  const before=JSON.stringify(state),advice=query(state);
  assert(advice.followUp.includes('守方「'+E.BASE.guard.name+'」'),'首个回应判和后，仍需核对其他回应');
  assert.equal(JSON.stringify(state),before);
}
{
  const s=load('tactics');vm.runInContext('selected="hero";preview="target"',box);
  const before=JSON.stringify(s),h=box.previewHTML(),scope=h.match(/<details class="preview-scope"[^>]*>[\s\S]*?<\/details>/);
  assert(scope,'详细判断范围应按需展开');assert(!/^<details[^>]*\sopen(?:\s|>)/.test(scope[0]));
  assert(scope[0].includes('首轮判断覆盖双方全部可用招式'));assert(scope[0].includes('不预测暗招或更长序列'));
  const visible=h.replace(scope[0],'');assert(visible.includes('有限推演，不预知暗招，不能保证后续安全。'));
  assert(visible.includes('首轮突袭 +1'));assert(visible.includes('双方不出击时不会额外扣血。'));assert(visible.includes('不是最终损血'));
  assert(h.indexOf('首轮突袭 +1')<h.indexOf('首轮判断'));assert(h.indexOf('首轮判断')<h.indexOf('进攻方输出'));
  assert(h.includes('data-action="cancel-preview" autofocus'));assert(h.includes('class="preview-support"'));
  const ctx=E.context(s,E.get(s,'hero'),E.get(s,'target')),strike=E.roundDamage(ctx,'strike','strike'),guard=E.roundDamage(ctx,'guard','guard');
  assert.equal(strike.toD-strike.toA,1);assert.equal(guard.toA,0);assert.equal(guard.toD,0);assert.equal(JSON.stringify(s),before);
}
console.log('配牌条件、支援、本轮生命预估与残局回应、吃子漏防、兵卒底线、行动终局、落点首轮风险、两轮胜局预览、吃子后将帅受攻与预览信息层级：29 组检查通过。');
