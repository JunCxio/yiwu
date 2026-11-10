const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2)){
  vm.runInContext(script[1].replace('return {actions,choices,','return {combatScore,actions,choices,'),box);
}
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
assert.equal(typeof C.combatScore,'function');
function royal(rotated=false,defending=false,hp=1,enemyHp=18){
  const s=E.create('attrition');s.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',3,0),E.piece('enemy','black','rook',4,8)];
  E.get(s,'rk').hp=hp;E.get(s,'enemy').hp=enemyHp;s.repetitions={};
  if(rotated)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  const a=E.get(s,defending?'enemy':'rk'),d=E.get(s,defending?'rk':'enemy');s.turn=a.side;E.move(s,a.id,d.x,d.y);
  E.resolve(s,'focus','focus');E.resolve(s,'focus','focus');assert.equal(s.duel.round,3);return s;
}
function checkedPlan(s,side){
  const before=JSON.stringify(s),p=s.pieces.find(p=>p.side===side&&[s.duel.a,s.duel.d].includes(p.id)),plan=C.combatPlan(s,side);
  assert.equal(JSON.stringify(s),before);assert(plan.length);
  assert(plan.every(x=>Number.isFinite(x.weight)&&x.weight>=0&&(x.id==='retreat'||!E.availability(s,p,x.id,s.duel))));
  assert(Math.abs(plan.reduce((n,x)=>n+x.weight,0)-1)<1e-9);return copy(plan);
}
let checks=0;
function test(name,fn){try{fn();checks++;console.log('通过：'+name);}catch(error){process.exitCode=1;console.error('失败：'+name+'；'+error.message);}}
test('濒死将帅有非必败替代时排除本轮必败招式，红黑进守一致',()=>{
  for(const rotated of [false,true])for(const defending of [false,true]){
    const s=royal(rotated,defending),king=E.get(s,'rk'),enemy=E.get(s,'enemy'),before=JSON.stringify(s),replies=C.choices(s,enemy,s.duel);
    for(const id of ['strike','break'])assert(replies.every(reply=>{const n=copy(s);E.resolve(n,defending?reply:id,defending?id:reply);return n.winner===enemy.side;}));
    const guard=copy(s);E.resolve(guard,'guard','guard');assert.equal(guard.phase,'duel');assert(E.get(guard,king.id));
    const plan=checkedPlan(s,king.side);assert(plan.every(x=>!['strike','break'].includes(x.id)));
    if(defending){assert.deepEqual(plan,[{id:'guard',weight:1}]);assert(C.practicePlan(s,king.side).some(x=>x.id==='strike'&&x.weight>0));}
    else assert(plan.some(x=>x.id==='retreat'&&x.weight>0));
    for(const roll of [0,.25,.5,.75,.999999])assert(!['strike','break'].includes(C.combat(s,king.side,()=>roll)));
    assert.equal(JSON.stringify(s),before);
  }
});
test('普通将帅交战的实际胜负评分只看终局，不计结束后的伤害收益',()=>{
  const outcomes=new Set();
  for(const rotated of [false,true])for(const defending of [false,true])for(const hp of [1,5,18])for(const enemyHp of [1,5,18]){
    const s=royal(rotated,defending,hp,enemyHp),ctx=s.duel,a=E.get(s,ctx.a),d=E.get(s,ctx.d),before=JSON.stringify(s);
    for(const id of C.choices(s,a,ctx))for(const reply of C.choices(s,d,ctx)){
      const next=copy(s);E.resolve(next,id,reply);if(next.phase!=='ended')continue;
      outcomes.add(next.winner===a.side?'win':'loss');assert.equal(C.combatScore(s,ctx,id,reply),next.winner===a.side?1000:-1000);
    }
    assert.equal(JSON.stringify(s),before);
  }
  assert(outcomes.has('win')&&outcomes.has('loss'));
});
test('双方将帅同时阵亡的同一和局，不再因终局耗牌而区别评分',()=>{
  for(const rotated of [false,true]){
    const s=E.create('attrition');s.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',4,0)];s.repetitions={};
    if(rotated)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    for(const p of s.pieces)p.hp=1;
    const king=E.get(s,'rk'),enemy=E.get(s,'bk');king.learned=['king_lead'];s.turn=king.side;E.move(s,king.id,enemy.x,enemy.y);
    E.resolve(s,'focus','focus');E.resolve(s,'focus','focus');
    for(const id of ['break','king_lead'])for(const reply of C.choices(s,enemy,s.duel)){
      const next=copy(s);E.resolve(next,id,reply);assert.equal(next.winner,'draw');assert.equal(C.combatScore(s,s.duel,id,reply),0);
    }
    const plan=checkedPlan(s,king.side);assert(Math.abs(plan.find(x=>x.id==='break').weight-plan.find(x=>x.id==='king_lead').weight)<1e-9);
  }
});
function quietBattle(){
  const s=E.create('attrition');s.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',5,0),E.piece('hero','red','horse',3,6),E.piece('target','black','rook',4,4)];
  E.get(s,'hero').learned=['horse_turn'];s.repetitions={};E.move(s,'hero',4,4);return s;
}
test('普通武斗第六轮实际无伤或重复判和时，气势和耗牌不计终局收益',()=>{
  for(const cause of ['quiet','repetition']){
    const s=quietBattle();for(let i=0;i<5;i++)E.resolve(s,'guard','guard');
    if(cause==='quiet')s.quiet=E.DRAW.quiet-1;
    else{const next=copy(s);E.resolve(next,'horse_turn','guard');s.repetitions[E.key(next)]=E.DRAW.repetitions-1;}
    const before=JSON.stringify(s),end=copy(s);E.resolve(end,'horse_turn','guard');assert.equal(end.winner,'draw');
    assert.equal(C.combatScore(s,s.duel,'horse_turn','guard'),0);checkedPlan(s,'red');checkedPlan(s,'black');assert.equal(JSON.stringify(s),before);
  }
});
test('尚未结束的普通武斗继续计算本轮收益，不提前判和或改写状态',()=>{
  const s=quietBattle();s.quiet=E.DRAW.quiet-1;const before=JSON.stringify(s),next=copy(s);E.resolve(next,'horse_turn','guard');
  assert.equal(next.phase,'duel');assert.equal(C.combatOutcome(s,s.duel,'horse_turn','guard'),null);
  assert(C.combatScore(s,s.duel,'horse_turn','guard')>0);assert.equal(JSON.stringify(s),before);
});
test('自然标准局中韧劲击倒对手后的气势归零，不再计入留存收益',()=>{
  const fixture=require('./computer-force-fixture.json');let s;
  for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.ply,40);assert.equal(s.duel.round,2);
  const before=JSON.stringify(s),ctx=s.duel,next=copy(s),r=E.resolve(next,fixture.attackerChoice,fixture.defenderChoice);
  assert(r.finished);assert.equal(next.phase,'board');assert.equal(r.hpBeforeA,17);assert.equal(r.hpA,16);assert.equal(r.hpBeforeD,1);assert.equal(r.hpD,0);
  assert.equal(r.forceAfterA,1);assert.equal(next.lastCombat.forceA,0);assert.equal(next.lastCombat.forceD,0);
  assert.equal(C.combatScore(s,ctx,fixture.attackerChoice,fixture.defenderChoice),7.75);
  checkedPlan(s,'red');checkedPlan(s,'black');assert.equal(JSON.stringify(s),before);
});
test('进守和红黑双方仅在交战继续时计入气势收益，末轮与提前离场一致',()=>{
  for(const mirrored of [false,true])for(const round of [2,6])for(const survivor of ['a','d','both']){
    const s=E.create('tactics');E.get(s,'target').kind='pawn';E.get(s,'target').learned=['pawn_grit'];
    if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    const a=E.get(s,'hero'),d=E.get(s,'target');s.turn=a.side;E.move(s,a.id,d.x,d.y);E.resolve(s,'guard','guard');s.duel.round=round;
    if(survivor==='a')d.hp=1;else if(survivor==='d')a.hp=1;
    const id=survivor==='d'?'strike':'pawn_grit',reply=survivor==='d'?'pawn_grit':'strike',before=JSON.stringify(s),next=copy(s),r=E.resolve(next,id,reply);
    assert.equal(C.combatScore(s,s.duel,id,reply),survivor==='a'?7.75:survivor==='d'?-7.75:round===2?4.85:3.75);
    if(r.finished){assert.equal(next.lastCombat.forceA,0);assert.equal(next.lastCombat.forceD,0);}else assert.equal(next.duel.forceA,1);
    assert.equal(JSON.stringify(s),before);
  }
});
console.log('普通武斗终局：'+checks+' / 7 项检查通过。');
