const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
let passed=0;
function test(name,fn){try{fn();passed++;console.log('通过：'+name);}catch(error){process.exitCode=1;console.error('失败：'+name+'；'+error.message);}}
function lastAction(){
  const s=E.create('challenge-tempo');
  E.rest(s,'hero','rook_crush');E.move(s,'black_king',5,1);E.move(s,'red_king',3,8);
  E.move(s,'target',4,5);E.resolve(s,'focus','focus');
  assert.equal(s.ply,3);assert.equal(s.duel.round,2);
  return s;
}
function ordinary(rotated=false){
  const s=E.create('attrition');s.pieces.forEach(p=>{p.learned=[];p.exhausted=[];});
  if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  const a=E.get(s,'hero'),d=E.get(s,'target');E.move(s,a.id,d.x,d.y);E.resolve(s,'focus','focus');return s;
}
function checkedPlan(s,side,practice=false){
  const before=JSON.stringify(s),plan=(practice?C.practicePlan:C.combatPlan)(s,side);
  assert.equal(JSON.stringify(s),before,'查看计划不得改写棋局');
  assert(plan.every(x=>Number.isFinite(x.weight)&&x.weight>=0));
  assert(Math.abs(plan.reduce((n,x)=>n+x.weight,0)-1)<1e-9);
  return JSON.parse(JSON.stringify(plan));
}
test('真实残局最后行动撤回即可获胜，两种难度均落实确定胜局',()=>{
  const s=lastAction(),next=copy(s);E.retreat(next);assert.equal(next.winner,'black');
  for(const practice of [false,true]){
    assert.deepEqual(checkedPlan(s,'black',practice),[{id:'retreat',weight:1}]);
    for(const roll of [0,.2,.5,.9,.999999])assert.equal(C.combat(s,'black',()=>roll,practice?'practice':'standard'),'retreat');
  }
});
test('撤回会直接失败的构造边界局面，不把撤回当作保命手段',()=>{
  const s=E.create('challenge-tempo');s.ply=3;E.get(s,'hero').hp=4;
  E.move(s,'hero',4,4);E.resolve(s,'focus','focus');
  const next=copy(s);E.retreat(next);assert.equal(next.winner,'black');
  for(const practice of [false,true])assert(checkedPlan(s,'red',practice).every(x=>x.id!=='retreat'));
});
test('无伤与重复局面的撤回判和按实际结果评估，红黑对称',()=>{
  for(const rotated of [false,true])for(const kind of ['quiet','repetition']){
    const s=ordinary(rotated),side=E.get(s,s.duel.a).side,normal=checkedPlan(s,side);
    if(kind==='quiet')s.quiet=E.DRAW.quiet-1;
    else{const next=copy(s);E.retreat(next);s.repetitions[E.key(next)]=E.DRAW.repetitions-1;}
    const next=copy(s);E.retreat(next);assert.equal(next.winner,'draw');
    const plan=checkedPlan(s,side);
    assert(plan.find(x=>x.id==='retreat').weight>normal.find(x=>x.id==='retreat').weight,'判和与普通撤回不能使用相同评分');
    checkedPlan(s,E.OTHER[side]);
  }
});
test('本场已有伤害时不会误用无伤判和，普通撤回保留原有策略',()=>{
  const s=ordinary();E.resolve(s,'strike','focus');assert(s.duel.totalDamage>0);
  const normal=checkedPlan(s,'red');s.quiet=E.DRAW.quiet-1;
  const next=copy(s);E.retreat(next);assert.equal(next.phase,'board');assert.equal(next.quiet,0);
  assert.deepEqual(checkedPlan(s,'red'),normal);
  E.get(s,'hero').hp=4;assert.deepEqual(checkedPlan(s,'red',true),[{id:'retreat',weight:1}]);
});
test('首轮和守方没有撤回选项，已有确定将帅击倒仍优先',()=>{
  const s=ordinary();
  for(const practice of [false,true]){
    assert(checkedPlan(s,'black',practice).every(x=>x.id!=='retreat'));
    s.duel.round=1;assert(checkedPlan(s,'red',practice).every(x=>x.id!=='retreat'));s.duel.round=2;
  }
  E.get(s,'target').kind='king';E.get(s,'target').hp=1;
  assert(checkedPlan(s,'red').every(x=>x.id!=='retreat'));
});
test('撤回说明与实际胜负、判和及已结算状态一致，查看不重复结算',()=>{
  const win=lastAction(),draw=ordinary();draw.quiet=E.DRAW.quiet-1;
  for(const s of [win,draw]){
    const before=JSON.stringify(s),next=copy(s);E.retreat(next);
    const reason=C.explain('retreat','standard',s);
    assert(reason.includes(next.winner==='draw'?'判和':'黑方获胜'));assert(reason.includes(next.reason));
    assert(!reason.includes('生命较低'));assert.equal(JSON.stringify(s),before);
    const after=JSON.stringify(next);assert.equal(C.explain('retreat','standard',next),reason);assert.equal(JSON.stringify(next),after);
  }
  const s=ordinary(),reason=C.explain('retreat','practice',s);
  assert(reason.includes('伤势')&&reason.includes('气势清零'));assert(!reason.includes('直接结束本局'));
});
function lastRound(rotated=false){
  const fixture=require('./computer-last-round-fixture.json');let s;
  for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  if(rotated){
    s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    for(const p of [s.duel.origin,s.duel.target]){p.x=8-p.x;p.y=9-p.y;}
  }
  return s;
}

test('合法末轮残血进攻子不再为即将清零的蓄势承伤，红黑对称',()=>{
  for(const rotated of [false,true]){
    const s=lastRound(rotated),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),next=copy(s);
    assert.equal(s.duel.round,6);assert.equal(a.hp,1);assert.equal(d.hp,4);assert.equal(C.choices(s,d,s.duel).length,4);
    E.resolve(next,'focus','strike');assert(!E.get(next,a.id));assert.equal(E.get(next,d.id).hp,d.hp);
    const exit=copy(s);E.retreat(exit);assert.equal(exit.phase,'board');assert(!C.kingLostNext(exit,a.side));
    assert.deepEqual(checkedPlan(s,a.side),[{id:'retreat',weight:1}]);
    for(const roll of [0,.2,.5,.9,.999999])assert.equal(C.combat(s,a.side,()=>roll),'retreat');
  }
});

test('提前蓄势、诱使耗牌、保留判和选择和无伤计数均不套用末轮止损',()=>{
  for(const kind of ['earlier','card','draw','quiet']){
    const s=lastRound(),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
    if(kind==='earlier')s.duel.round=5;
    else if(kind==='card'){d.learned=['pawn_advance'];assert(C.choices(s,d,s.duel).includes('pawn_advance'));}
    else if(kind==='draw'){const next=copy(s);E.retreat(next);s.repetitions[E.key(next)]=E.DRAW.repetitions-1;const exit=copy(s);E.retreat(exit);assert.equal(exit.winner,'draw');}
    else s.duel.totalDamage=0;
    assert(checkedPlan(s,a.side).some(p=>p.id==='focus'&&p.weight>0),kind);
  }
});

test('撤回后存在确定取将风险时，不以末轮蓄势为由强行撤回',()=>{
  const fixture=require('./review-followup-fixture.json');let s;
  for(const [op,...args]of fixture.commands.slice(0,fixture.beforeCommand)){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  s.duel.round=6;const a=E.get(s,s.duel.a),next=copy(s);E.retreat(next);assert(C.kingLostNext(next,a.side));
  assert(checkedPlan(s,a.side).some(p=>p.id==='focus'&&p.weight>0));
});

test('末轮止损先完成省牌，不把可省下的培养蓄势牌留在计划中',()=>{
  const fixture=require('./computer-last-round-fixture.json');let s;
  for(const [op,...args]of fixture.cardOrderCommands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  const a=E.get(s,s.duel.a);assert.equal(s.duel.round,6);assert(C.choices(s,a,s.duel).includes('elephant_store'));
  const plan=checkedPlan(s,a.side);assert(!plan.some(p=>p.id==='focus'));assert(!plan.some(p=>p.id==='elephant_store'));
  assert(plan.some(p=>p.id==='retreat'&&p.weight>0));
});

console.log('撤回决策：'+passed+' / 10 项检查通过。');
