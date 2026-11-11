const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2).map(m=>m[1]);
vm.runInContext(scripts[0],box);
vm.runInContext(scripts[1].includes('function advanceTrapsKing(')?scripts[1].replace('return {actions,choices','return {advanceTrapsKing,actions,choices'):scripts[1],box);
const E=box.Yiwu,C=box.YiwuComputer,fixture=require('./computer-king-advance-fixture.json'),copy=s=>JSON.parse(JSON.stringify(s));
const same=(a,b)=>a.id===b.id&&a.x===b.x&&a.y===b.y;
const rotate=(a,rotated)=>({...a,x:rotated?8-a.x:a.x,y:rotated?9-a.y:a.y});
function state(row,rotated=false){
  let s;for(const [op,...args]of row.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply+1,row.ply);
  if(rotated){s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));}
  return s;
}
function threatened(s,side){
  const king=s.pieces.find(p=>p.kind==='king'&&p.side===side);
  return s.pieces.some(p=>{
    if(p.side===side||!E.canMove(s,p,king.x,king.y))return false;
    const ctx=E.context(s,p,king),choices=q=>Object.keys(E.BASE).concat(q.learned).filter(id=>!E.availability(s,q,id,ctx));
    return !choices(king).some(reply=>choices(p).every(id=>{const r=E.roundDamage(ctx,id,reply);return r.toA>=p.hp&&r.toD<king.hp;}));
  });
}
function quietReplies(s){
  const side=s.turn,states=[];
  for(const p of s.pieces.filter(p=>p.side===side)){
    const commands=E.moves(s,p).filter(m=>!E.at(s,m.x,m.y)).map(m=>['move',p.id,m.x,m.y]).concat(p.exhausted.map(id=>['rest',p.id,id]));
    for(const [op,...args]of commands){const next=copy(s);E[op](next,...args);if(next.phase==='ended'?next.winner!==E.OTHER[side]:!threatened(next,side))states.push(next);}
  }
  return states;
}
let branches=0,blocked=0;
for(const row of fixture.cases)for(const rotated of [false,true]){
  const s=state(row,rotated),raw=JSON.stringify(s),side=s.turn,bad=rotate(row.danger,rotated),good=rotate(row.safe,rotated),advance=rotate(row.advance,rotated);
  const ranked=copy(C.rankedActions(s));assert(ranked.find(a=>same(a,bad)).score<ranked.find(a=>same(a,good)).score-.06,'应优先选择保留将帅防线的调动');
  for(const [action,trapped]of [[bad,true],[good,false]]){
    const next=copy(s);E.move(next,action.id,action.x,action.y);assert(!threatened(next,side));
    const king=next.pieces.find(p=>p.kind==='king'&&p.side===side),before=JSON.stringify(next);
    assert.equal(C.advanceTrapsKing(next,king),trapped);assert.equal(JSON.stringify(next),before);
    if(!E.canMove(next,E.get(next,advance.id),advance.x,advance.y)){assert.equal(trapped,false);blocked++;continue;}
    E.move(next,advance.id,advance.x,advance.y);assert.equal(next.phase,'board');
    const safe=quietReplies(next);assert.equal(safe.length===0,trapped);
    if(trapped)assert(threatened(next,side));branches++;
  }
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999])assert(same(C.board(s,()=>roll,difficulty),good));
  assert.equal(JSON.stringify(s),raw);assert.deepEqual(copy(C.rankedActions(s)),ranked);
  const other=state(row,!rotated),mirrored=C.rankedActions(other);assert.equal(mirrored.length,ranked.length);
  for(const action of ranked){const match=mirrored.find(b=>same(b,rotate(action,true)));assert(match);assert(Math.abs(match.score-action.score)<1e-8);}
  const quietDraw=copy(s);E.move(quietDraw,bad.id,bad.x,bad.y);quietDraw.quiet=E.DRAW.quiet-1;
  assert.equal(C.advanceTrapsKing(quietDraw,quietDraw.pieces.find(p=>p.kind==='king'&&p.side===side)),false,'对手调动直接判和时，不虚构后续封锁');
  const repeatedDraw=copy(s);E.move(repeatedDraw,bad.id,bad.x,bad.y);
  for(const p of repeatedDraw.pieces.filter(p=>p.side===repeatedDraw.turn))for(const m of E.moves(repeatedDraw,p).filter(m=>!E.at(repeatedDraw,m.x,m.y))){
    const next=copy(repeatedDraw);E.move(next,p.id,m.x,m.y);if(next.phase==='board')repeatedDraw.repetitions[E.key(next)]=E.DRAW.repetitions-1;
  }
  assert.equal(C.advanceTrapsKing(repeatedDraw,repeatedDraw.pieces.find(p=>p.kind==='king'&&p.side===side)),false,'重复调动直接判和时，不虚构后续封锁');
}
console.log('将帅单出口防线：两份完整合法历史、红黑旋转、'+branches+' 条实际后续分支、'+blocked+' 条蹩马腿阻止的进攻、全部行动评分、两种难度选步、真实无伤及重复判和与输入不变检查通过。');
