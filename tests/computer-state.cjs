const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
let checks=0,previews=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
function verify(s,ctx,aId,dId){
  assert(Object.values(s.repetitions).every(n=>Number.isInteger(n)&&n>0));
  const before=JSON.stringify(s),contextBefore=JSON.stringify(ctx),expected=copy(s);
  expected.phase='duel';expected.duel=copy(ctx);E.resolve(expected,aId,dId);
  const result=C.combatOutcome(s,ctx,aId,dId);previews++;
  assert.deepEqual(copy(result),expected.phase==='ended'?copy(expected):null);
  assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(ctx),contextBefore);
  if(result){
    assert.notEqual(result.repetitions,s.repetitions);
    const oldKey=Object.keys(result.repetitions)[0];if(oldKey)result.repetitions[oldKey]++;
    result.repetitions[E.key(result)]=100;
    result.log.push('独立预演状态');
    if(result.pieces.length){result.pieces[0].hp=0;result.pieces[0].learned.push('测试');result.pieces[0].exhausted.push('测试');}
    result.lastCombat.origin.x=-1;result.lastCombat.supportA.push('测试');result.lastCombat.history[0].breakdownA.base=-1;
    assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(ctx),contextBefore);
    assert.deepEqual(copy(C.combatOutcome(s,ctx,aId,dId)),copy(expected));
  }
  return expected;
}
function royal(both=false,rotated=false){
  const s=E.create('attrition');
  s.pieces=both?[E.piece('a','red','king',4,9),E.piece('d','black','king',4,0)]:[E.piece('rk','red','king',3,9),E.piece('a','red','rook',4,1),E.piece('d','black','king',4,0)];
  E.get(s,'d').hp=1;if(both)E.get(s,'a').hp=1;s.repetitions={};
  if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  s.repetitions[E.key(s)]=1;return s;
}
test('从棋盘独立构造的交战上下文与真实终局一致，返回状态不共享可变数据',()=>{
  for(const rotated of [false,true]){
    const s=royal(false,rotated),ctx=E.context(s,E.get(s,'a'),E.get(s,'d'));
    assert.equal(s.duel,null);assert.equal(verify(s,ctx,'strike','break').winner,E.get(s,'a').side);
  }
});
test('双方将帅阵亡的完整和局状态与真实规则相同，红黑对称',()=>{
  for(const rotated of [false,true]){
    const s=royal(true,rotated),d=E.get(s,'d');E.move(s,'a',d.x,d.y);
    assert.equal(verify(s,copy(s.duel),'strike','strike').winner,'draw');
  }
});
function finalRound(){
  const s=E.create('attrition');E.get(s,'hero').learned=['rook_hold'];s.pieces.push(E.piece('helper','red','rook',0,4));E.move(s,'hero',4,4);
  for(let i=0;i<5;i++)E.resolve(s,'guard','guard');return s;
}
test('六轮无伤判和保留耗牌、交锋历史与计数，预演修改不影响原局',()=>{
  const s=finalRound();s.quiet=E.DRAW.quiet-1;
  const result=verify(s,s.duel,'rook_hold','guard');assert.equal(result.winner,'draw');
  assert(E.get(result,'hero').exhausted.includes('rook_hold'));assert.equal(result.lastCombat.history.length,6);
});
test('第三次重复只增加预演状态的计数，输入中的第二次计数保持不变',()=>{
  const s=finalRound(),probe=copy(s);E.resolve(probe,'rook_hold','guard');
  const key=E.key(probe);s.repetitions[key]=E.DRAW.repetitions-1;
  const result=verify(s,copy(s.duel),'rook_hold','guard');
  assert.equal(result.winner,'draw');assert.equal(result.repetitions[key],3);assert.equal(s.repetitions[key],2);
});
test('残局成功、时限失败与未结束的武斗均按真实规则返回完整状态或空值',()=>{
  const won=E.create('challenge-support');E.move(won,'hero',4,4);
  while(won.phase==='duel'){verify(won,won.duel,'guard','strike');E.resolve(won,'guard','strike');}
  assert.equal(won.winner,'red');
  const lost=E.create('challenge-tempo');E.rest(lost,'hero','rook_crush');E.move(lost,'black_king',5,1);E.move(lost,'red_king',3,8);E.move(lost,'target',4,5);
  for(let i=0;i<5;i++)E.resolve(lost,'guard','guard');
  assert.equal(verify(lost,lost.duel,'guard','guard').winner,'black');
});
console.log('终局状态隔离：'+checks+' 组通过，逐项核对 '+previews+' 个预演输入。');
