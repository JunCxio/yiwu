const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./computer-initiative-fixture.json');
function state(row,rotated=false){
 let s;for(const [op,...args]of row.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
 assert.equal(s.phase,'board');assert.equal(s.ply+1,row.ply);
 if(rotated){s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));}
 return s;
}
const rotatedAction=(a,rotated)=>({...a,x:rotated?8-a.x:a.x,y:rotated?9-a.y:a.y});
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
const threats=(s,side)=>{const king=s.pieces.find(p=>p.side===side&&p.kind==='king');return s.pieces.filter(p=>p.side!==side&&E.canMove(s,p,king.x,king.y));};
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('通过：'+name);};
test('真实局面有移将或挡线选择时，不用待兑现的攻将抵销己方即时风险',()=>{
 for(const row of fixture.cases)for(const rotated of [false,true]){
  const s=state(row,rotated),raw=JSON.stringify(s),danger=rotatedAction(row.danger,rotated),safe=rotatedAction(row.safe,rotated),ranked=copy(C.rankedActions(s));
  const risky=copy(s);E.move(risky,danger.id,danger.x,danger.y);assert(threats(risky,s.turn).length);
  const avoided=copy(s);E.move(avoided,safe.id,safe.x,safe.y);assert.equal(threats(avoided,s.turn).length,0);
  assert(ranked.find(a=>same(a,danger)).score<ranked.find(a=>same(a,safe)).score-.06);
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){
   const action=C.board(s,()=>roll,difficulty);assert(same(action,safe));const next=copy(s);E.move(next,action.id,action.x,action.y);assert.equal(next.phase,'board');assert.equal(threats(next,s.turn).length,0);
  }
  assert.deepEqual(copy(C.rankedActions(s)),ranked);assert.equal(JSON.stringify(s),raw);
 }
});
test('全部合法走棋评分在红黑旋转后相同，查询不改变存档状态',()=>{
 for(const row of fixture.cases){
  const s=state(row),other=state(row,true),raw=JSON.stringify([s,other]),a=C.rankedActions(s),b=C.rankedActions(other);
  assert.equal(a.length,b.length);for(const action of a){const match=b.find(x=>same(x,rotatedAction(action,true)));assert(match);assert(Math.abs(action.score-match.score)<1e-8);}
  assert.equal(JSON.stringify([s,other]),raw);
 }
});
console.log('攻将时机与己方避险：'+checks+' 组检查通过。');
