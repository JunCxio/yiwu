const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./computer-king-space-fixture.json');
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
const rotate=(a,rotated)=>({...a,x:rotated?8-a.x:a.x,y:rotated?9-a.y:a.y});
function state(row,rotated=false){
  let s;for(const [op,...args]of row.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply+1,row.ply);
  if(rotated){
    s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));
  }
  return s;
}
function emptyEscapes(s,side){
  const king=s.pieces.find(p=>p.side===side&&p.kind==='king');
  return E.moves(s,king).filter(m=>!E.at(s,m.x,m.y)).filter(m=>{
    const next=copy(s);next.turn=side;E.move(next,king.id,m.x,m.y);
    return next.phase==='board'&&!next.pieces.some(p=>p.side!==side&&E.canMove(next,p,m.x,m.y)&&!C.battleOutlook(next,E.context(next,p,E.get(next,king.id))).counters.length);
  });
}
const verifiedBattles=new Set(),battleChecks={fights:0,states:0,endings:0};
function checkBattle(start,side){
  const signature=JSON.stringify([E.key(start),start.duel.a,start.duel.d]);if(verifiedBattles.has(signature))return;verifiedBattles.add(signature);battleChecks.fights++;
  const seen=new Set(),pending=[copy(start)];
  while(pending.length){
    const state=pending.pop(),ctx=state.duel,key=JSON.stringify([state.phase,E.key(state),state.quiet,ctx?.round,ctx?.forceA,ctx?.forceD,ctx?.totalDamage>0]);if(seen.has(key))continue;seen.add(key);battleChecks.states++;
    if(state.phase!=='duel'){assert.equal(state.phase,'board');assert(emptyEscapes(state,side).length>0);assert(!C.kingLostNext(state,side));battleChecks.endings++;continue;}
    const a=E.get(state,ctx.a),d=E.get(state,ctx.d);assert(a.kind!=='king'&&d.kind!=='king');
    const rows=C.practicePlan(state,a.side),cols=C.practicePlan(state,d.side);
    for(const plan of [rows,cols]){assert(plan.length);assert(plan.every(p=>p.weight>0));assert(Math.abs(plan.reduce((sum,p)=>sum+p.weight,0)-1)<1e-12);}
    for(const row of rows){
      if(row.id==='retreat'){const next=copy(state);E.retreat(next);pending.push(next);continue;}
      for(const col of cols){const next=copy(state);E.resolve(next,row.id,col.id);pending.push(next);}
    }
  }
}
for(const row of fixture.cases)for(const rotated of [false,true]){
  const s=state(row,rotated),before=JSON.stringify(s),side=s.turn,bad=rotate(row.danger,rotated),good=rotate(row.safe,rotated);
  const trapped=copy(s);E.move(trapped,bad.id,bad.x,bad.y);assert.equal(trapped.phase,'board');assert.equal(emptyEscapes(trapped,side).length,0);
  const king=trapped.pieces.find(p=>p.side===side&&p.kind==='king');assert(!trapped.pieces.some(p=>p.side!==side&&E.canMove(trapped,p,king.x,king.y)),'这里检查的是退路，不是当前直接受攻');
  const ranked=copy(C.rankedActions(s));assert(ranked.find(a=>same(a,bad)).score<ranked.find(a=>same(a,good)).score-.06);
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){
    const action=C.board(s,()=>roll,difficulty),next=copy(s);E.move(next,action.id,action.x,action.y);
    if(next.phase==='duel'){assert.equal(difficulty,'practice');checkBattle(next,side);}
    else{assert.equal(next.phase,'board');assert(emptyEscapes(next,side).length>0);assert(!C.kingLostNext(next,side));}
    if(difficulty==='standard')assert(same(action,good));
  }
  assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.rankedActions(s)),ranked);
}
for(const row of fixture.cases){
  const a=state(row),b=state(row,true),before=JSON.stringify([a,b]),left=C.rankedActions(a),right=C.rankedActions(b);
  assert.equal(left.length,right.length);
  for(const action of left){const other=right.find(x=>same(x,rotate(action,true)));assert(other);assert(Math.abs(other.score-action.score)<1e-8);}
  assert.equal(JSON.stringify([a,b]),before);
}
{
  const prior=require('./computer-two-round-safety-fixture.json');
  const row={commands:prior.commands,ply:52,danger:{type:'move',id:'black_guard_3',x:4,y:1},safe:{type:'move',id:'black_guard_5',x:4,y:1}};
  for(const rotated of [false,true]){
    const s=state(row,rotated),before=JSON.stringify(s),side=s.turn,ranked=C.rankedActions(s);
    assert(same(ranked[0],rotate(row.safe,rotated)),'三血将帅挡线后还需保留空位退路');
    for(const [action,expected]of [[row.danger,0],[row.safe,1]]){
      const next=copy(s),move=rotate(action,rotated);E.move(next,move.id,move.x,move.y);
      assert.equal(C.kingLostNext(next,side),false);assert.equal(emptyEscapes(next,side).length,expected);
    }
    assert.equal(JSON.stringify(s),before);
  }
}
for(const rotated of [false,true]){
  const s=state(fixture.cases[0],rotated),before=JSON.stringify(s);
  for(const move of [{id:'black_cannon_5',x:2,y:9},{id:'black_rook_3',x:4,y:9}]){
    const duel=copy(s),attack=rotate(move,rotated);E.move(duel,attack.id,attack.x,attack.y);assert.equal(duel.phase,'duel');checkBattle(duel,s.turn);
  }
  assert.equal(JSON.stringify(s),before);
}
assert(battleChecks.fights>=4&&battleChecks.endings>0);
console.log('将帅退路：两份完整合法局面及红黑旋转、全部合法行动评分、两种难度各五个选步、三血将帅挡线与输入不变检查通过。');

console.log(JSON.stringify(battleChecks));
