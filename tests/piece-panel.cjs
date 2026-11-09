const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const box = vm.createContext({});
vm.runInContext(scripts[0], box);
const names = ['computerTurn', 'boardRelations', 'positionHTML', 'cardTargets', 'cardPlanHTML', 'detailHTML', 'logsHTML'];
const helpers = names.map(name => {
  const source = scripts[2].match(new RegExp('  function ' + name + '\\([^\\n]*\\}\\r?$', 'm')) || scripts[2].match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'));
  assert(source, '缺少界面函数：' + name);
  return source[0];
});
const movement = scripts[2].match(/  const MOVE_RULES=\{[\s\S]*?\n  \};/);
const escape = scripts[2].match(/,esc=([^\n]+);/);
assert(movement); assert(escape);
vm.runInContext('const E=Yiwu,esc=' + escape[1] + '; let s,selected,lesson=null,preview=null,hint=null,screen="game",opponent="local",fightUI=null,cardGuide=null;\n' + movement[0] + '\n' + helpers.join('\n'), box);
const E = box.Yiwu;
function show(s, p, open = false) {
  box.state = s; box.pieceId = p.id; box.open = open;
  vm.runInContext('s=state;selected=pieceId', box);
  const before = JSON.stringify(s), result = box.detailHTML(open);
  assert.equal(JSON.stringify(s), before, '查看面板不能修改棋局');
  return result;
}

for (const side of ['red', 'black']) for (const kind of Object.keys(E.NAMES.red)) for (const count of [0, 1, 2]) {
  const s = E.create('quick'); E.auto(s, 'red'); E.auto(s, 'black'); E.start(s); s.turn = side;
  const p = s.pieces.find(p => p.side === side && p.kind === kind);
  assert(p);
  const ids = Object.keys(E.CARDS).filter(id => E.CARDS[id].kind === kind);
  p.learned = ids.slice(3 - count); p.exhausted = [];
  const h = show(s, p), group = h.match(/<details class="unlearned-cards"[^>]*>[\s\S]*?<\/details>/);
  assert(group, '未学牌应收在独立折叠区');
  assert(!/^<details[^>]*\sopen(?:\s|>)/.test(group[0]), '首次查看默认收起');
  assert(group[0].includes('未学招式 · ' + (3 - count) + ' 张'));
  assert(h.includes('已学招式 · ' + count + ' 张'));
  for (const id of ids) {
    assert.equal(h.split('</span>' + E.CARDS[id].name + '</strong>').length - 1, 1, '每张牌只列一次');
    assert.equal(group[0].includes('</span>' + E.CARDS[id].name + '</strong>'), !p.learned.includes(id));
  }
  if (!count) assert(h.includes('未学习培养牌。武斗仍有斩击、架势、破势和蓄势。'));
  else assert(h.indexOf('</span>' + E.CARDS[p.learned[0]].name + '</strong>') < h.indexOf('<details class="unlearned-cards"'));
  assert(show(s, p, true).includes('<details class="unlearned-cards" open>'));
}
console.log('通过：七类棋子、红黑阵营和零至两张配牌正确分组，查看不改状态');

{
  const s = E.create('quick'); E.auto(s, 'red'); E.auto(s, 'black');
  for (const side of ['red', 'black']) {
    const p = s.pieces.find(p => p.side === side);
    const h = show(s, p);
    assert(!h.includes('unlearned-cards')); assert(h.includes('三选二 · 培养招式'));
    assert.equal((h.match(/data-learn=/g) || []).length, 3);
  }
  vm.runInContext('opponent="computer"', box);
  const h = show(s, s.pieces.find(p => p.side === 'black'));
  assert(!h.includes('unlearned-cards')); assert(!h.includes('data-learn=')); assert(h.includes('电脑配牌仅供查看'));
}
console.log('通过：配牌阶段仍完整展示三张牌，电脑阵营只读');

{
  vm.runInContext('opponent="local"', box);
  const s = E.create('tactics'), p = E.get(s, 'hero'); p.exhausted = [p.learned[0]];
  let h = show(s, p);
  assert(h.includes('data-rest="' + p.learned[0] + '"')); assert(h.includes('已耗尽：整备后才能再次使用'));
  assert(h.indexOf('data-rest=') < h.indexOf('unlearned-cards'));
  s.turn = 'black'; h = show(s, p); assert(!h.includes('data-rest='));
  s.phase = 'ended'; h = show(s, p); assert(!h.includes('data-rest=')); assert(h.includes('对局已结束'));
}
console.log('通过：耗尽牌的整备入口保持可见，非本方回合与终局不可整备');
console.log('棋子侧栏：3 组检查通过。');
