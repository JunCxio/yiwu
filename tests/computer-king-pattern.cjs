const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,fixtures=require('./computer-king-pattern-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x));
let cases=0;
for(const fixture of fixtures)for(const rotate of [false,true]){
  let s;for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'duel');let side=fixture.side;
  if(rotate){
    side=E.OTHER[side];s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    for(const pos of [s.duel.target,s.duel.origin]){pos.x=8-pos.x;pos.y=9-pos.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
  }
  const before=JSON.stringify(s),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),mine=a.side===side?a:d,enemy=mine===a?d:a,plan=copy(C.combatPlan(s,side));
  assert(Math.abs(plan.reduce((n,p)=>n+p.weight,0)-1)<1e-10);assert(plan.every(p=>p.weight>=0&&(p.id==='retreat'||C.choices(s,mine,s.duel).includes(p.id))));
  const noHistory=copy(s);noHistory.duel.history=[];
  if(fixture.kind==='danger'){
    assert.equal(mine.kind,'king');
    const losses=C.choices(s,enemy,s.duel).map(id=>plan.reduce((n,p)=>n+(p.id!=='retreat'&&C.combatOutcome(s,s.duel,mine===a?p.id:id,mine===a?id:p.id)?.winner===enemy.side?p.weight:0),0));
    const worst=Math.max(...losses);assert(worst>0&&worst<=fixture.maxLoss,fixture.name+'不应因两次重复出招放大当轮取将风险');
    assert.deepEqual(plan,copy(C.combatPlan(noHistory,side)));
  }else{
    assert.deepEqual(plan,fixture.plan);
    assert.notDeepEqual(plan,copy(C.combatPlan(noHistory,side)),'普通交战与未临危将帅仍应参考已揭示历史');
  }
  assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.combatPlan(copy(s),side)),plan);cases++;
}
console.log(JSON.stringify({cases,legalHistories:true,rotated:true,immediateWorstLossChecked:true,harmlessHistoryPreserved:true,inputUnchanged:true}));
