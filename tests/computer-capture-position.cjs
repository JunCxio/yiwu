const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./computer-capture-position-fixture.json');
function scene(rotated=false){
  let s;for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply,215);assert.equal(s.turn,'black');
  if(rotated){
    s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...state])=>[id,8-x,9-y,...state])]),count];}));
  }
  return s;
}
let checks=0;function test(name,fn){fn();checks++;console.log('通过：'+name);}
test('真实长局与旋转局面均优先士首轮吃掉威胁将帅的残血兵',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated),before=JSON.stringify(s),target=E.get(s,'red_pawn_2');
    for(const roll of [0,.25,.5,.75,.999999]){
      const action=C.board(s,()=>roll);assert(action.id.startsWith('black_guard'));assert.equal(action.x,target.x);assert.equal(action.y,target.y);
      const next=copy(s);E.move(next,action.id,action.x,action.y);const a=E.get(next,action.id),d=E.get(next,target.id),safe=C.battleOutlook(next,next.duel).finishes;
      const plan=C.combatPlan(next,s.turn);assert(plan.length&&plan.every(p=>safe.includes(p.id)));
      for(const option of plan)for(const reply of C.choices(next,d,next.duel)){
        const result=copy(next);E.resolve(result,option.id,reply);assert.equal(result.phase,'board');assert(!E.get(result,d.id));assert(E.get(result,a.id)?.hp>0);assert(!C.kingLostNext(result,s.turn));
      }
    }
    assert.equal(JSON.stringify(s),before);
  }
});
test('完整历史和耗牌保持独立，反复查询及重放后的建议一致',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated),before=JSON.stringify(s),first=copy(C.rankedActions(s));
    assert(first.every(a=>Number.isFinite(a.score)));assert.deepEqual(copy(C.rankedActions(s)),first);assert.deepEqual(copy(C.rankedActions(copy(s))),first);assert.equal(JSON.stringify(s),before);
  }
});
test('目标满血且无法确保首轮存活吃子时仍保留将帅避让选择',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated),target=E.get(s,'red_pawn_2');target.hp=18;const before=JSON.stringify(s);
    for(const p of s.pieces.filter(p=>p.side===s.turn&&p.kind==='guard'))if(E.canMove(s,p,target.x,target.y))assert.equal(C.battleOutlook(s,E.context(s,p,target)).finishes.length,0);
    for(const roll of [0,.5,.999999])assert.equal(C.board(s,()=>roll).id,'black_king_4');
    assert.equal(JSON.stringify(s),before);
  }
});
console.log('首轮吃子站位评分：'+checks+' 组检查通过。');
