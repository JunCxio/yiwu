const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);
// 仅测试读取内部站位评分，正式游戏不增加接口。
assert(scripts[1].includes('return {actions,choices'));vm.runInContext(scripts[1].replace('return {actions,choices','return {position,actions,choices'),box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./computer-king-tempo-fixture.json');
const same=(a,b)=>a.type===b.type&&a.id===b.id&&(a.type==='move'?a.x===b.x&&a.y===b.y:a.card===b.card);
function rotate(s){
  s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));return s;
}
const action=(a,rotated)=>rotated&&a.type==='move'?{...a,x:8-a.x,y:9-a.y}:a;
function escapes(s){
  const side=s.turn,king=s.pieces.find(p=>p.side===side&&p.kind==='king');
  return E.moves(s,king).filter(m=>!E.at(s,m.x,m.y)).filter(m=>{
    const next=copy(s);E.move(next,king.id,m.x,m.y);
    return next.phase==='ended'?next.winner!==E.OTHER[side]:!next.pieces.some(p=>p.side!==side&&E.canMove(next,p,m.x,m.y)&&!C.battleOutlook(next,E.context(next,p,E.get(next,king.id))).counters.length);
  });
}
let positions=0,exits=0;
for(const row of fixture.cases){
  let original;for(const [op,...args]of row.commands){if(op==='create')original=E.create(...args);else E[op](original,...args);}
  assert.equal(original.phase,'board');assert.equal(original.ply+1,row.ply);
  const ranks=[];
  for(const rotated of [false,true]){
    const s=rotated?rotate(copy(original)):copy(original),before=JSON.stringify(s),chase=action(row.chase,rotated),preferred=action(row.preferred,rotated);
    const next=copy(s);E.move(next,chase.id,chase.x,chase.y);assert.equal(next.phase,'board');
    const safe=escapes(next);assert(safe.length,'所比较的追将必须允许对手真实空位脱离');exits+=safe.length;
    const ranked=copy(C.rankedActions(s));assert(same(ranked[0],preferred),'有安全退路的追将不应掩盖原有更好选择');
    assert(ranked.find(a=>same(a,preferred)).score>ranked.find(a=>same(a,chase)).score+.06);
    for(const roll of [0,.25,.5,.75,.999999])assert(same(C.board(s,()=>roll,'standard'),preferred));
    for(const roll of [0,.5,.999999])assert(C.actions(s).some(a=>same(a,C.board(s,()=>roll,'practice'))));
    assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.rankedActions(s)),ranked);ranks.push(ranked);positions++;
  }
  for(const a of ranks[0])assert(Math.abs(a.score-ranks[1].find(b=>same(b,action(a,true))).score)<1e-8);
}
function scene(trapped=false){
  const s=E.create('attrition');s.turn='red';s.pieces=[['rk','red','king',3,9,1],['bk','black','king',5,0,18],['br','black','rook',3,5,18],...(trapped?[['br2','black','rook',4,5,18]]:[])].map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));return s;
}
for(const rotated of [false,true]){
  const base=scene(),s=rotated?rotate(base):base,side=s.turn,enemy=E.OTHER[side],before=JSON.stringify(s);
  assert(escapes(s).length);assert.equal(C.position(s,enemy),C.position(s,enemy,true));
  assert.equal(C.position(s,side),C.position(s,side,true),'己方将帅避险不因可移将而减弱');assert.equal(JSON.stringify(s),before);
  const trapped=rotated?rotate(scene(true)):scene(true),trappedBefore=JSON.stringify(trapped);assert.equal(escapes(trapped).length,0);
  assert(Math.abs(C.position(trapped,enemy)-C.position(trapped,enemy,true)-72.45)<1e-8,'没有空位退路仍保留原追将价值');assert.equal(JSON.stringify(trapped),trappedBefore);
  const wait=copy(s);wait.turn=enemy;assert(Math.abs(C.position(wait,enemy)-C.position(wait,enemy,true)-72.45)<1e-8,'尚未轮到守方移动时不提前视为脱离');
  const quiet=copy(trapped);quiet.quiet=E.DRAW.quiet-1;assert(escapes(quiet).length);assert.equal(C.position(quiet,enemy),C.position(quiet,enemy,true));
  const repetition=copy(trapped),king=repetition.pieces.find(p=>p.side===side&&p.kind==='king'),move=E.moves(repetition,king).find(m=>!E.at(repetition,m.x,m.y)),exit=copy(repetition);E.move(exit,king.id,move.x,move.y);repetition.repetitions[E.key(exit)]=2;
  assert(escapes(repetition).length);assert.equal(C.position(repetition,enemy),C.position(repetition,enemy,true));
}
console.log('追将收益：'+positions+' 个完整历史及旋转局面、'+exits+' 条真实空位退路、全部行动评分、两种难度、无路可退、行动方、两类判和与输入不变核对通过。');
