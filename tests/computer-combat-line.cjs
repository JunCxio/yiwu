const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./computer-combat-line-fixture.json');
let checks=0,branches=0;const test=(name,run)=>{run();checks++;console.log('通过：'+name);};
function replay(rotated=false){
  let s;for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  if(rotated){s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));}
  return s;
}
function exposed(s,side){
  const king=s.pieces.find(p=>p.side===side&&p.kind==='king');
  return s.pieces.some(p=>p.side!==side&&E.canMove(s,p,king.x,king.y)&&!C.battleOutlook(s,E.context(s,p,king)).counters.length);
}
function settle(s,id,reply){const next=copy(s);if(id==='retreat')E.retreat(next);else E.resolve(next,id,reply);branches++;return next;}
function plan(s,side=s.turn){
  const before=JSON.stringify(s),p=E.get(s,s.duel.a).side===side?E.get(s,s.duel.a):E.get(s,s.duel.d),result=copy(C.combatPlan(s,side));
  assert(result.length&&result.every(x=>Number.isFinite(x.weight)&&x.weight>=0&&(x.id==='retreat'||!E.availability(s,p,x.id,s.duel))));
  assert(Math.abs(result.reduce((n,x)=>n+x.weight,0)-1)<1e-9);assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.combatPlan(copy(s),side)),result);return result;
}
test('完整合法快速局复现炮阵亡后的新增受攻，不能误称两轮必败',()=>{
  for(const rotated of [false,true]){
    const s=replay(rotated);assert.equal(s.duel.round,5);assert.equal(E.get(s,fixture.attacker).hp,4);assert.equal(E.get(s,fixture.defender).hp,7);
    assert(!exposed(s,s.turn));const next=settle(s,'strike','guard');assert.equal(next.phase,'board');assert(!E.get(next,fixture.attacker));assert(exposed(next,s.turn));
    assert.equal(C.kingLostNext(next,s.turn),false,'新增受攻不等于下一手确定败局');
  }
});
test('存在安全替代时，标准选招和抽样不保留会离场漏防的招式，红黑一致',()=>{
  for(const rotated of [false,true]){
    const s=replay(rotated),result=plan(s);assert(result.every(x=>['cannon_hold','retreat'].includes(x.id)));
    for(const option of result)for(const reply of C.choices(s,E.get(s,s.duel.d),s.duel)){
      const next=settle(s,option.id,reply);assert(next.phase==='duel'||next.phase==='board'&&!exposed(next,s.turn));
    }
    for(const roll of [0,.25,.5,.75,.999999])assert(result.some(p=>p.id===C.combat(s,s.turn,()=>roll)));
    assert.deepEqual(copy(C.practicePlan(s,s.turn)),[{id:'retreat',weight:1}]);
    plan(s,E.OTHER[s.turn]);
  }
});
test('炮线仍被其他棋子挡住时，不禁用原有斩击',()=>{
  for(const rotated of [false,true]){
    const s=replay(rotated);s.pieces.push(E.piece('extra-blocker',s.turn,'pawn',rotated?5:3,rotated?3:6));
    const next=settle(s,'strike','guard');assert.equal(next.phase,'board');assert(!exposed(next,s.turn));assert(plan(s).some(x=>x.id==='strike'&&x.weight>0));
  }
});
test('真实重复判和后没有下一手，不把炮线当作继续作战的风险',()=>{
  for(const rotated of [false,true]){
    const s=replay(rotated);
    for(const id of C.choices(s,E.get(s,s.duel.a),s.duel))for(const reply of C.choices(s,E.get(s,s.duel.d),s.duel)){
      const next=settle(s,id,reply);if(next.phase==='board')s.repetitions[E.key(next)]=E.DRAW.repetitions-1;
    }
    const next=settle(s,'strike','guard');assert.equal(next.phase,'ended');assert.equal(next.winner,'draw');assert(plan(s).some(x=>x.id==='strike'&&x.weight>0));
  }
});
test('所有选择都留下相同确定败局时仍保留非空合法计划',()=>{
  const s=E.create('attrition');s.repetitions={};s.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',3,0),E.piece('hero','red','horse',0,7),E.piece('target','black','pawn',2,6),E.piece('threat','black','rook',4,0)];
  E.get(s,'rk').hp=1;E.move(s,'hero',2,6);s.duel.round=6;
  for(const id of C.choices(s,E.get(s,'hero'),s.duel).concat('retreat'))for(const reply of C.choices(s,E.get(s,'target'),s.duel)){
    const next=settle(s,id,reply);assert.equal(next.phase,'board');assert(C.kingLostNext(next,'red',false));
  }
  plan(s);
});
console.log(JSON.stringify({checks,actualBranches:branches,inputUnchanged:true}));
