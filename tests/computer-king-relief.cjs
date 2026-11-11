const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,fixtures=require('./computer-king-relief-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
function replay(fixture,rotated){
  let s;for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply+1,fixture.ply);
  if(rotated){
    s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
  }
  return s;
}
function underAttack(s,king){return s.pieces.some(p=>p.side!==king.side&&E.canMove(s,p,king.x,king.y)&&!C.battleOutlook(s,E.context(s,p,king)).counters.length);}
let states=0,choices=0;
for(const fixture of fixtures)for(const rotated of [false,true]){
  const s=replay(fixture,rotated),before=JSON.stringify(s),king=s.pieces.find(p=>p.side===s.turn&&p.kind==='king');
  assert(underAttack(s,king));
  for(const exit of E.moves(s,king).filter(m=>!E.at(s,m.x,m.y))){
    const next=copy(s);E.move(next,king.id,exit.x,exit.y);
    assert(next.phase==='ended'?next.winner===E.OTHER[s.turn]:underAttack(next,E.get(next,king.id)),'该病例不能存在安全空位移将');
  }
  const expected=rotated?{...fixture.expected,x:8-fixture.expected.x,y:9-fixture.expected.y}:fixture.expected;
  const a=E.get(s,expected.id),d=E.at(s,expected.x,expected.y),outlook=C.battleOutlook(s,E.context(s,a,d));
  assert.equal(a.kind,'guard');assert.notEqual(d.kind,'king');assert.equal(outlook.finishes.length,0);assert.equal(outlook.counters.length,0);
  assert(same(C.rankedActions(s)[0],expected),'受困时应比较反击的预计解围收益');
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){assert(same(C.board(s,()=>roll,difficulty),expected));choices++;}
  const ranked=copy(C.rankedActions(s));assert.deepEqual(copy(C.rankedActions(copy(s))),ranked);assert.equal(JSON.stringify(s),before);
  const mirrored=C.rankedActions(replay(fixture,!rotated));
  for(const action of ranked){const other=mirrored.find(b=>same(b,{...action,x:8-action.x,y:9-action.y}));assert(other);assert(Math.abs(action.score-other.score)<1e-8);}
  states++;
}
console.log(JSON.stringify({states,choices,legalPrefixes:true,noSafeEmptyKingExit:true,uncertainBattle:true,rotationVerified:true,inputUnchanged:true}));
