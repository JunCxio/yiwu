const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);vm.runInContext(scripts[1].replace('return {actions,choices','return {position,advanceTrapsKing,actions,choices'),box);
const E=box.Yiwu,C=box.YiwuComputer,row=require('./computer-king-zero-exit-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
function replay(rotated){
  let s;for(const [op,...args]of row.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply+1,row.ply);assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);
  if(rotated){
    s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
  }
  return s;
}
function threatened(s,king){
  return s.pieces.some(p=>{
    if(p.side===king.side||!E.canMove(s,p,king.x,king.y))return false;
    const ctx=E.context(s,p,king),ids=q=>Object.keys(E.BASE).concat(q.learned).filter(id=>!E.availability(s,q,id,ctx));
    return !ids(king).some(reply=>ids(p).every(id=>{const r=E.roundDamage(ctx,id,reply);return r.toA>=p.hp&&r.toD<king.hp;}));
  });
}
function safeExits(s,king){
  return E.moves(s,king).filter(m=>!E.at(s,m.x,m.y)).filter(m=>{
    const next=copy(s);next.turn=king.side;E.move(next,king.id,m.x,m.y);
    return next.phase==='ended'?next.winner!==E.OTHER[king.side]:!threatened(next,E.get(next,king.id));
  });
}
let branches=0;const failures=[];
for(const rotated of [false,true]){
  try{
    const s=replay(rotated),side=s.turn,before=JSON.stringify(s),rotate=a=>({...a,x:rotated?8-a.x:a.x,y:rotated?9-a.y:a.y});
    const good=rotate(row.safe),bad=rotate(row.danger),ranked=copy(C.rankedActions(s));
    const after=[];
    for(const action of [good,bad]){
      const next=copy(s);E.move(next,action.id,action.x,action.y);assert.equal(next.phase,'board');
      const king=E.get(next,action.id);assert(!threatened(next,king));assert.equal(safeExits(next,king).length,0);
      const pressure=[];
      for(const p of next.pieces.filter(p=>p.side!==side))for(const m of E.moves(next,p).filter(m=>!E.at(next,m.x,m.y))){
        const projected=copy(next);E.move(projected,p.id,m.x,m.y);if(projected.phase!=='board')continue;
        const defender=E.get(projected,king.id),attacker=E.get(projected,p.id);
        if(E.canMove(projected,attacker,defender.x,defender.y)&&threatened(projected,defender)&&!C.battleOutlook(projected,E.context(projected,attacker,defender)).counters.length&&!safeExits(projected,defender).length)pressure.push({type:'move',id:p.id,x:m.x,y:m.y});
      }
      assert.deepEqual(pressure,same(action,bad)?row.pressures.map(rotate):[]);branches+=pressure.length;
      assert.equal(C.advanceTrapsKing(next,king),pressure.length>0);after.push(next);
    }
    assert(ranked.find(a=>same(a,good)).score>ranked.find(a=>same(a,bad)).score+.06,'应区分零退路时下一手会被逼帅的同分落点');
    for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999])assert(!same(C.board(s,()=>roll,difficulty),bad));
    assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.rankedActions(s)),ranked);
    const mirror=C.rankedActions(replay(!rotated));for(const a of ranked){const m=mirror.find(b=>same(b,{...a,x:8-a.x,y:9-a.y}));assert(m);assert(Math.abs(m.score-a.score)<1e-8);}
    for(const kind of ['own-turn','quiet-draw','repetition-draw']){
      const states=after.map(copy);
      for(const next of states){
        if(kind==='own-turn')next.turn=side;
        else if(kind==='quiet-draw')next.quiet=E.DRAW.quiet-1;
        else for(const p of next.pieces.filter(p=>p.side===next.turn))for(const m of E.moves(next,p).filter(m=>!E.at(next,m.x,m.y))){const end=copy(next);E.move(end,p.id,m.x,m.y);next.repetitions[E.key(end)]=2;}
      }
      if(kind!=='own-turn')for(const next of states)assert(!C.advanceTrapsKing(next,E.get(next,bad.id)));
      assert(Math.abs(C.position(states[0],side)-C.position(states[1],side))<1e-8,'己方行动或下一手直接判和时不虚构额外逼帅风险');
    }
    console.log('通过：零退路风险'+(rotated?'红黑旋转':'完整历史')+'、真实压力分支、两难度、直接判和与输入不变');
  }catch(error){failures.push({rotated,message:error.message});console.error('失败：'+(rotated?'旋转':'原色')+'：'+error.message);}
}
assert.deepEqual(failures,[]);assert.equal(branches,4);console.log('零安全空位退路：2 组、4 条实际压力分支通过。');
