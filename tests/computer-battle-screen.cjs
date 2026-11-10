const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./computer-battle-screen-fixture.json');
const threats=(s,side)=>{const king=s.pieces.find(p=>p.side===side&&p.kind==='king');return s.pieces.filter(p=>p.side!==side&&E.canMove(s,p,king.x,king.y));};
function state(row,rotated=false){
  let s;for(const [op,...args]of row.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  if(rotated){s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));}
  return s;
}
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('通过：'+name);};
test('真实红黑交战首轮结束的全部分支均会打开炮线，但仍有继续交战分支',()=>{
  for(const row of fixture.cases)for(const rotated of [false,true]){
    const s=state(row,rotated),raw=JSON.stringify(s),a=E.get(s,row.attacker),d=E.get(s,row.defender),ctx=E.context(s,a,d);let ended=0,continued=0;
    assert.equal(threats(s,s.turn).length,0);assert.equal(C.battleOutlook(s,ctx).finishes.length,0);
    for(const aId of C.choices(s,a,ctx))for(const dId of C.choices(s,d,ctx)){
      const next=copy(s);E.move(next,a.id,d.x,d.y);E.resolve(next,aId,dId);
      if(next.phase==='duel')continued++;else{ended++;assert.equal(next.phase,'board');assert(threats(next,s.turn).some(p=>p.kind==='cannon'));}
    }
    assert(ended>0&&continued>0);assert.equal(JSON.stringify(s),raw);
  }
});
test('有可用防守选择时，不再把暴露将帅的普通交战排在前面',()=>{
  for(const row of fixture.cases)for(const rotated of [false,true]){
    const s=state(row,rotated),raw=JSON.stringify(s),target=E.get(s,row.defender),ranked=copy(C.rankedActions(s));
    const risky=ranked.find(x=>x.type==='move'&&x.id===row.attacker&&x.x===target.x&&x.y===target.y);assert(risky&&risky.score<ranked[0].score-.06);
    for(const roll of [0,.25,.5,.75,.999999]){
      const action=C.board(s,()=>roll);assert(!(action.type==='move'&&action.id===row.attacker&&action.x===target.x&&action.y===target.y));
      const next=copy(s);if(action.type==='rest')E.rest(next,action.id,action.card);else E.move(next,action.id,action.x,action.y);
      assert.equal(next.phase,'board');assert.equal(threats(next,s.turn).length,0);
    }
    assert.deepEqual(copy(C.rankedActions(s)),ranked);assert.equal(JSON.stringify(s),raw);
  }
});
console.log('普通交战炮线风险：'+checks+' 组检查通过。');
