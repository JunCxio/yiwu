const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=value=>JSON.parse(JSON.stringify(value));
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'computer-king-defense-fixture.json'),'utf8'));
let checks=0,branches=0,damageChecks=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function scene(row,rotate=false){
  let s;
  for(const [command,...args]of row.commands)if(command==='create')s=E.create(...args);else E[command](s,...args);
  assert.equal(s.ply+1,row.ply);assert.equal(s.duel.round,row.round);
  if(rotate){
    s.turn=E.OTHER[s.turn];
    for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    for(const key of ['origin','target']){s.duel[key].x=8-s.duel[key].x;s.duel[key].y=9-s.duel[key].y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{
      const [turn,pieces]=JSON.parse(key);
      return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...state])=>[id,8-x,9-y,...state])]),count];
    }));
  }
  return s;
}
function plan(s){
  const side=E.get(s,s.duel.d).side,choices=C.choices(s,E.get(s,s.duel.d),s.duel),before=JSON.stringify(s),result=copy(C.combatPlan(s,side));
  assert(result.length);assert(result.every(x=>choices.includes(x.id)&&Number.isFinite(x.weight)&&x.weight>=0));
  assert(Math.abs(result.reduce((n,x)=>n+x.weight,0)-1)<1e-9);
  assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.combatPlan(copy(s),side)),result);
  return result;
}
function nextWin(s){
  if(s.phase!=='duel')return false;
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
  return C.choices(s,a,s.duel).some(id=>C.choices(s,d,s.duel).every(reply=>{
    const next=copy(s);E.resolve(next,id,reply);branches++;
    return next.phase==='ended'&&next.winner===a.side;
  }));
}
test('四个真实守将局面及红黑旋转均避开下一轮确定败局',()=>{
  for(const row of fixture.cases)for(const rotate of [false,true]){
    const s=scene(row,rotate),side=E.get(s,s.duel.d).side,before=JSON.stringify(s),result=plan(s);
    assert(result.every(x=>row.safe.includes(x.id)));
    for(const option of result)for(const reply of C.choices(s,E.get(s,s.duel.a),s.duel)){
      const next=copy(s);E.resolve(next,reply,option.id);branches++;
      assert(!(next.phase==='ended'&&next.winner===E.OTHER[side]));assert(!nextWin(next));
    }
    for(const roll of [0,.25,.5,.75,.999999])assert(row.safe.includes(C.combat(s,side,()=>roll,'standard')));
    assert.equal(JSON.stringify(s),before);
  }
  assert.deepEqual(plan(scene(fixture.cases[0])),[{id:'strike',weight:1}]);
});
test('练习电脑仍保留基础类型随机选择，第六轮与无稳妥替代时保留合法计划',()=>{
  const base=scene(fixture.cases[0]),side=E.get(base,base.duel.d).side;
  assert(C.practicePlan(base,side).some(x=>!fixture.cases[0].safe.includes(x.id)&&x.weight>0));
  for(const alter of [s=>{E.get(s,s.duel.d).hp=1;},s=>{E.get(s,s.duel.d).hp=6;s.duel.forceA=0;},s=>{s.duel.round=6;},s=>{E.get(s,s.duel.d).kind='rook';},s=>{E.get(s,s.duel.d).hp=18;}]){
    const s=copy(base);alter(s);plan(s);
  }
});
test('第二轮起所有招式面对基础克制回应最多造成一点伤害',()=>{
  const counter={strike:'guard',break:'strike',guard:'break',focus:'guard'};
  for(const id of Object.keys(E.BASE).concat(Object.keys(E.CARDS)))for(let round=2;round<=6;round++)for(let supportA=0;supportA<=2;supportA++)for(let supportD=0;supportD<=2;supportD++)for(let forceA=0;forceA<=2;forceA++)for(let forceD=0;forceD<=2;forceD++){
    const ctx={round,supportA:Array(supportA).fill('a'),supportD:Array(supportD).fill('d'),forceA,forceD};
    assert(E.roundDamage(ctx,id,counter[(E.BASE[id]||E.CARDS[id]).type]).toD<=1);damageChecks++;
  }
});
console.log(JSON.stringify({checks,branches,damageChecks,inputUnchanged:true}));
