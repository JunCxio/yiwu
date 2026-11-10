const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2).map(m=>m[1]);
vm.runInContext(scripts[0],box);
const original='return {actions,choices';assert(scripts[1].includes(original));
vm.runInContext(scripts[1].replace(original,'return {retreatOutcome,actions,choices'),box);
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
let retreatPreviews=0;
function verifyRetreat(s){
  const before=JSON.stringify(s),expected=copy(s);E.retreat(expected);
  const nativeJSON=vm.runInContext('JSON',box);let fullCopies=0,result;
  box.JSON={parse:JSON.parse,stringify(value,...args){if(value?.repetitions===s.repetitions)fullCopies++;return JSON.stringify(value,...args);}};
  try{result=C.retreatOutcome(s);}finally{box.JSON=nativeJSON;}
  retreatPreviews++;assert.equal(fullCopies,0,'撤回预演不应再次序列化完整历史局面');
  assert.deepEqual(copy(result),expected.phase==='ended'?copy(expected):null);assert.equal(JSON.stringify(s),before);
  if(result){
    assert.notEqual(result.repetitions,s.repetitions);assert(Object.values(result.repetitions).every(Number.isInteger));
    result.repetitions[Object.keys(result.repetitions)[0]]++;
    result.repetitions[E.key(result)]=100;result.log.push('独立撤回预演');result.pieces[0].hp=0;result.pieces[0].learned.push('测试');
    result.lastCombat.origin.x=-1;result.lastCombat.supportA.push('测试');result.lastCombat.history[0].breakdownA.base=-1;
    assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.retreatOutcome(s)),copy(expected));
  }
  return expected;
}
function retreatScene(rotated=false){
  const s=E.create('attrition');
  if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.repetitions={};s.repetitions[E.key(s)]=1;}
  const a=E.get(s,'hero'),d=E.get(s,'target');E.move(s,a.id,d.x,d.y);E.resolve(s,'focus','focus');return s;
}
test('棋盘和首轮不预演撤回，也不修改输入',()=>{
  const s=E.create('attrition'),before=JSON.stringify(s);assert.equal(C.retreatOutcome(s),null);assert.equal(JSON.stringify(s),before);
  E.move(s,'hero',4,4);const first=JSON.stringify(s);assert.equal(C.retreatOutcome(s),null);assert.equal(JSON.stringify(s),first);
});
test('普通撤回及已有伤害的撤回保持真实状态，红黑一致',()=>{
  for(const rotated of [false,true]){
    const s=retreatScene(rotated);assert.equal(verifyRetreat(s).phase,'board');
    E.resolve(s,'strike','focus');assert(s.duel.totalDamage>0);s.quiet=E.DRAW.quiet-1;
    const next=verifyRetreat(s);assert.equal(next.phase,'board');assert.equal(next.quiet,0);
  }
});
test('撤回的无伤与第三次重复判和完整保留历史，并隔离所有可变状态',()=>{
  for(const rotated of [false,true])for(const kind of ['quiet','repetition']){
    const s=retreatScene(rotated);
    if(kind==='quiet')s.quiet=E.DRAW.quiet-1;
    else{const next=copy(s);E.retreat(next);s.repetitions[E.key(next)]=E.DRAW.repetitions-1;}
    assert.equal(verifyRetreat(s).winner,'draw');
  }
});
test('残局最后行动撤回后的完整失败状态与实际规则一致',()=>{
  const s=E.create('challenge-tempo');E.rest(s,'hero','rook_crush');E.move(s,'black_king',5,1);E.move(s,'red_king',3,8);
  E.move(s,'target',4,5);E.resolve(s,'focus','focus');assert.equal(verifyRetreat(s).winner,'black');
});
test('完整合法历史中的撤回不重复编码局面计数，输入和决策保持不变',()=>{
  const fixture=require('./computer-ending-cards-fixture.json');let s;
  for(const [name,...args]of fixture.commands){if(name==='create')s=E.create(...args);else E[name](s,...args);}
  assert(Object.keys(s.repetitions).length>30);assert.equal(s.duel.round,2);verifyRetreat(s);
  const before=JSON.stringify(s),plans=['red','black'].map(side=>copy(C.combatPlan(s,side)));
  verifyRetreat(s);assert.deepEqual(['red','black'].map(side=>copy(C.combatPlan(s,side))),plans);assert.equal(JSON.stringify(s),before);
});
console.log('终局状态隔离：'+checks+' 组通过，逐项核对 '+previews+' 个交战与 '+retreatPreviews+' 个撤回预演输入。');
