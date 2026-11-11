const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'index.html'), 'utf8');
const box = vm.createContext({});
vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1], box);
const E = box.Yiwu;
let checks = 0;
function verify(pieces, p) {
  const s = {pieces}, before = JSON.stringify(s), expected = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    if (E.canMove(s, p, x, y)) expected.push({x, y, capture: !!E.at(s, x, y)});
  }
  const actual = JSON.parse(JSON.stringify(E.moves(s, p)));
  assert.deepEqual(actual, expected, JSON.stringify(p));
  assert.equal(JSON.stringify(s), before);
  checks++;
  return actual;
}
verify([], null);
verify([], undefined);
verify([], E.piece('unknown', 'red', 'unknown', 4, 4));

// 与逐格合法性检查比较，也固定原来的纵坐标、横坐标排序和吃子标记。
for (const side of ['red', 'black']) for (const kind of Object.keys(E.NAMES[side])) {
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const p = E.piece('subject', side, kind, x, y);
    for (const layout of ['empty', 'friendly', 'enemy', 'mixed']) {
      const pieces = [p];
      for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < 9; xx++) {
        if (xx === x && yy === y) continue;
        const nearby = Math.abs(xx - x) <= 2 && Math.abs(yy - y) <= 2;
        if (layout === 'empty' || (layout === 'mixed' ? (xx * 7 + yy * 11 + x * 3 + y) % 5 !== 0 : !nearby)) continue;
        const friendly = layout === 'friendly' || layout === 'mixed' && (xx + yy) % 2 === 0;
        pieces.push(E.piece('block-' + xx + '-' + yy, friendly ? side : E.OTHER[side], 'pawn', xx, yy));
      }
      verify(pieces, p);
    }
  }
}

for (const side of ['red', 'black']) for (const kind of ['rook', 'cannon']) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (const screens of [0, 1, 2]) for (const friendlyScreen of [false, true]) for (const friendlyTarget of [false, true]) {
      const p = E.piece('subject', side, kind, 4, 4);
      const target = E.piece('target', friendlyTarget ? side : E.OTHER[side], 'horse', 4 + dx * 4, 4 + dy * 4);
      const pieces = [p, target];
      for (let n = 1; n <= screens; n++) pieces.push(E.piece('screen-' + n, friendlyScreen ? side : E.OTHER[side], 'pawn', 4 + dx * n, 4 + dy * n));
      const moves = verify(pieces, p);
      assert.equal(moves.some(m => m.x === target.x && m.y === target.y), !friendlyTarget && screens === (kind === 'cannon' ? 1 : 0));
    }
  }
}

for (const side of ['red', 'black']) for (let x = 0; x < 9; x++) {
  for (let y = 0; y < 10; y++) for (let targetY = 0; targetY < 10; targetY++) {
    if (y === targetY) continue;
    const p = E.piece('subject', side, 'king', x, y);
    const target = E.piece('target', E.OTHER[side], 'king', x, targetY);
    const clear = verify([p, target], p);
    assert.equal(clear.filter(m => m.x === x && m.y === targetY && m.capture).length, 1);
    if (Math.abs(targetY - y) > 1) {
      const screen = E.piece('screen', side, 'pawn', x, y + Math.sign(targetY - y));
      assert(!verify([p, target, screen], p).some(m => m.x === x && m.y === targetY));
    }
  }
}
console.log('通过：' + checks + ' 组走法、顺序、吃子标记与输入隔离检查');
