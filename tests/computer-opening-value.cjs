const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=x=>JSON.parse(JSON.stringify(x)),fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'computer-opening-value-fixture.json'),'utf8'));let inputs=0,branches=0;
function rotate(raw){
  const s=copy(raw);s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  const ctx=E.context(s,E.get(s,s.duel.a),E.get(s,s.duel.d));for(const key of ['origin','target','supportA','supportD','screen'])s.duel[key]=ctx[key];
  s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...tail])=>[id,8-x,9-y,...tail])]),n];}));return s;
}
for(const fixture of fixtures){
  let state;for(const [op,...args]of fixture.commands){if(op==='create')state=E.create(...args);else E[op](state,...args);}
  assert.equal(state.phase,'duel');assert.equal(state.duel.round,1);
  for(const mirrored of [false,true]){
    const s=mirrored?rotate(state):copy(state),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),before=JSON.stringify(s),plan=copy(C.combatPlan(s,a.side));
    assert.deepEqual(plan,fixture.expected,fixture.name+'的可靠吃子收益没有落实');assert(Math.abs(plan.reduce((n,r)=>n+r.weight,0)-1)<1e-9);
    assert(plan.every(r=>r.weight>0&&fixture.original.some(old=>old.id===r.id)));
    assert.deepEqual(copy(C.practicePlan(s,a.side)),fixture.practice);assert.deepEqual(copy(C.combatPlan(s,d.side)),fixture.defender);
    for(const option of plan)for(const reply of C.choices(s,d,s.duel)){
      const next=copy(s);E.resolve(next,option.id,reply);assert(E.get(next,a.id)?.hp>0);assert(!E.get(next,d.id));assert.notEqual(next.phase,'duel');branches++;
    }
    for(const roll of [0,.25,.5,.75,.999999]){let draws=0;const id=C.combat(s,a.side,()=>{draws++;return roll;});assert(plan.some(r=>r.id===id));assert.equal(draws,1);}
    assert.equal(JSON.stringify(s),before);inputs++;
  }
  console.log('通过：'+fixture.name+'合法历史与红黑换色');
}
assert.equal(fixtures.length,3);console.log(JSON.stringify({groups:fixtures.length,inputs,realBranches:branches,practiceAndDefenderUnchanged:true}));
