const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const box = vm.createContext({});
vm.runInContext(scripts[0], box);
const helpers = ['cardUnavailable', 'supportDetailsHTML'].map(name => {
  const source = scripts[2].match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'));
  assert(source, '缺少界面函数：' + name);
  return source[0];
});
vm.runInContext('const E=Yiwu; let s;\n' + helpers.join('\n'), box);
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

console.log('配牌条件与支援专项：4 组检查通过。');
