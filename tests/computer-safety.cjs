const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=value=>JSON.parse(JSON.stringify(value));
const samples=[
  {pieces:[['rk','red','king',4,7,2],['bk','black','king',4,1,1],['r0','red','horse',8,8,1],['r1','red','horse',3,4,1],['b0','black','horse',6,4,18],['b1','black','horse',5,4,18]],move:{id:'bk',x:4,y:2},attacker:'r1'},
  {pieces:[['rk','red','king',5,7,2],['bk','black','king',5,2,1],['r0','red','horse',6,0,1],['r1','red','horse',1,4,18],['b0','black','horse',2,6,5],['b1','black','horse',5,6,1]],move:{id:'b1',x:4,y:4},attacker:'r0'}
];
function scene(sample,rotated=false){
  const s=E.create('attrition');s.turn=rotated?'red':'black';s.repetitions={};
  s.pieces=sample.pieces.map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,rotated?E.OTHER[side]:side,kind,rotated?8-x:x,rotated?9-y:y),{hp}));
  return s;
}
const same=(a,b)=>a.id===b.id&&a.x===b.x&&a.y===b.y;
function winsAgainstKing(s,attackerId){
  const next=copy(s),king=next.pieces.find(p=>p.side!==next.turn&&p.kind==='king'),attacker=E.get(next,attackerId);
  if(!E.canMove(next,attacker,king.x,king.y))return false;E.move(next,attacker.id,king.x,king.y);
  return C.choices(next,attacker,next.duel).some(id=>C.choices(next,king,next.duel).every(reply=>{
    const result=copy(next);E.resolve(result,id,reply);return result.phase==='ended'&&result.winner===attacker.side;
  }));
}
let checks=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
test('将帅移动和其他棋子调动均避开下一手确定败局，红黑视角一致',()=>{
  for(const sample of samples)for(const rotated of [false,true]){
    const s=scene(sample,rotated),danger={...sample.move,x:rotated?8-sample.move.x:sample.move.x,y:rotated?9-sample.move.y:sample.move.y};
    const bad=copy(s);E.move(bad,danger.id,danger.x,danger.y);assert(winsAgainstKing(bad,sample.attacker),'样本必须有覆盖全部合法防守的获胜回应');
    const before=JSON.stringify(s),ranked=C.rankedActions(s);
    assert(ranked.find(a=>same(a,danger)).score<-500);
    for(const roll of [0,.25,.5,.75,.999999])assert(!same(C.board(s,()=>roll),danger));
    const selected=C.board(s,()=>0),after=copy(s);E.move(after,selected.id,selected.x,selected.y);assert.equal(after.phase,'board');
    assert(!after.pieces.some(p=>p.side===after.turn&&winsAgainstKing(after,p.id)));
    assert.equal(JSON.stringify(s),before);assert(ranked.every(a=>Number.isFinite(a.score)));
  }
});
test('整备不能掩盖将帅的下一手确定败局，检查不修改耗牌和记录',()=>{
  const s=scene(samples[1]),p=E.get(s,'b0');p.learned=['horse_join'];p.exhausted=['horse_join'];
  const before=JSON.stringify(s),rest=C.rankedActions(s).find(a=>a.type==='rest');
  assert(rest.score<-500);assert.notEqual(C.board(s,()=>0).type,'rest');assert.equal(JSON.stringify(s),before);
});
test('行动已触发无伤判和时，不虚构后续进攻',()=>{
  const sample=samples[1],s=scene(sample);s.quiet=E.DRAW.quiet-1;
  const next=copy(s);E.move(next,sample.move.id,sample.move.x,sample.move.y);assert.equal(next.winner,'draw');
  assert(C.rankedActions(s).find(a=>same(a,sample.move)).score>-500);
});
test('行动已触发第三次重复判和时，不虚构后续进攻',()=>{
  const sample=samples[1],s=scene(sample),next=copy(s);E.move(next,sample.move.id,sample.move.x,sample.move.y);
  s.repetitions[E.key(next)]=E.DRAW.repetitions-1;const end=copy(s);E.move(end,sample.move.id,sample.move.x,sample.move.y);assert.equal(end.winner,'draw');
  const before=JSON.stringify(s);assert(C.rankedActions(s).find(a=>same(a,sample.move)).score>-500);assert.equal(JSON.stringify(s),before);
});
test('单纯走法威胁及可能双方将帅阵亡不误判为对手确定获胜',()=>{
  const sample=samples[1],s=scene(sample);E.get(s,'bk').hp=18;
  assert(C.rankedActions(s).find(a=>same(a,sample.move)).score>-500);
  s.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',4,0)];s.pieces.forEach(p=>{p.hp=1;});
  assert(C.rankedActions(s).find(a=>a.id==='bk'&&a.x===4&&a.y===1).score>-500);
});
test('残局未完成指定目标时，击败黑将不能冒充确定获胜',()=>{
  const s=E.create('challenge-support'),king=s.pieces.find(p=>p.side==='black'&&p.kind==='king');king.hp=1;
  s.pieces.push(E.piece('probe','red','rook',king.x,king.y+2));s.repetitions={};
  const before=JSON.stringify(s),attack=C.rankedActions(s).find(a=>a.id==='probe'&&a.x===king.x&&a.y===king.y);
  assert(attack&&attack.score<1000);assert.equal(JSON.stringify(s),before);
  const result=copy(s);E.move(result,'probe',king.x,king.y);E.resolve(result,'strike','guard');assert.equal(result.winner,'black');
  s.turn='black';const quiet=C.rankedActions(s).find(a=>a.id===king.id&&a.x===king.x&&a.y===king.y+1);
  assert(quiet&&quiet.score>-500,'不能把红方提前击败黑将误作黑方确定败局');
});
console.log('将帅安全：'+checks+' 项检查通过。');
