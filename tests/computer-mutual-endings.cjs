const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const file=process.argv[2]||path.join(__dirname,'..','index.html'),scripts=[...fs.readFileSync(file,'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const box=vm.createContext({});vm.runInContext(scripts[0],box);
assert(scripts[1].includes('return {actions,choices'));const exposed=scripts[1].includes('function bothCanEndWithoutLosing')?'return {position,bothCanEndWithoutLosing,actions,choices':'return {position,actions,choices';vm.runInContext(scripts[1].replace('return {actions,choices',exposed),box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));let inputs=0,branches=0,certificates=0;
function scene(hpA,hpD,mirrored=false,cards=false){
  const s=E.create('attrition');s.pieces=[E.piece('a','red','king',4,9),E.piece('d','black','king',4,0)];s.repetitions={};
  E.get(s,'a').hp=hpA;E.get(s,'d').hp=hpD;
  if(cards)for(const p of s.pieces)p.learned=['king_calm','king_command'];
  if(mirrored){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  return s;
}
{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'computer-mutual-endings-fixture.json'),'utf8'));let s;
  for(const [name,...args]of fixture.commands){if(name==='create')s=E.create(...args);else E[name](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply,51);assert.equal(s.turn,'black');
  const a=E.get(s,'black_king_4'),d=E.get(s,'red_king_4');assert.equal(a.hp,1);assert.equal(d.hp,2);
  const before=JSON.stringify(s),ranked=C.rankedActions(s),capture=ranked.find(m=>m.id===a.id&&m.x===d.x&&m.y===d.y);
  assert(capture&&capture.score<0,'双方可保和的飞将不能在优势局冒充正交换收益');
  assert(Math.abs(capture.score+C.position(s,s.turn))<1e-8);
  for(const difficulty of ['practice','standard'])for(const roll of [0,.25,.5,.75,.999999]){const action=C.board(s,()=>roll,difficulty);assert(!(action.id===a.id&&action.x===d.x&&action.y===d.y));}
  assert.equal(JSON.stringify(s),before);assert.equal(typeof C.bothCanEndWithoutLosing,'function');
  console.log('通过：完整合法记录中不为可保和的飞将放弃普通吃子。');
}
for(const hpA of [1,2,3,8,18])for(const hpD of [1,2,3,8,18])for(const mirrored of [false,true])for(const cards of [false,true])
  for(const round of [1,3,6])for(const [forceA,forceD]of [[0,0],[1,2],[2,1]]){
    const s=scene(hpA,hpD,mirrored,cards),a=E.get(s,'a'),d=E.get(s,'d'),ctx=E.context(s,a,d);Object.assign(ctx,{round,forceA,forceD});
    const ids=p=>Object.keys(E.BASE).concat(p.learned).filter(id=>!E.availability(s,p,id,ctx)),rows=ids(a),cols=ids(d),before=JSON.stringify(s),ctxBefore=JSON.stringify(ctx);
    const ends=rows.map(id=>cols.map(reply=>{const next=copy(s);next.phase='duel';next.duel=copy(ctx);E.resolve(next,id,reply);branches++;return next.phase==='ended'?next.winner:null;}));
    const expected=ends.some(row=>row.every(winner=>winner&&winner!==d.side))&&cols.some((_,j)=>ends.every(row=>row[j]&&row[j]!==a.side));
    assert.equal(C.bothCanEndWithoutLosing(s,ctx),expected);assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(ctx),ctxBefore);inputs++;if(expected)certificates++;
  }
assert(certificates>0&&certificates<inputs);
console.log(JSON.stringify({inputs,actualBranches:branches,certificates,inputUnchanged:true}));
for(const mirrored of [false,true])for(const extraSide of ['red','black']){
  const s=scene(1,1,mirrored),side=s.turn,extra=mirrored?E.OTHER[extraSide]:extraSide;
  s.pieces.push(E.piece('extra',extra,'rook',0,5));const a=E.get(s,'a'),d=E.get(s,'d'),base=C.position(s,side),before=JSON.stringify(s);
  assert(C.bothCanEndWithoutLosing(s,E.context(s,a,d)));
  const capture=C.rankedActions(s).find(x=>x.id==='a'&&x.x===d.x&&x.y===d.y);assert(capture);assert(Math.abs(capture.score+base)<1e-8);
  assert.equal(Math.sign(capture.score),extra===side?-1:1);assert.equal(JSON.stringify(s),before);
}
const winning=scene(18,1),target=E.get(winning,'d');assert.equal(C.bothCanEndWithoutLosing(winning,E.context(winning,E.get(winning,'a'),target)),false);
assert.equal(C.rankedActions(winning).find(x=>x.id==='a'&&x.x===target.x&&x.y===target.y).score,1000);
console.log('通过：优势不把双方可保和的交战当正收益，劣势可接受，确定胜局仍优先。');

for(const scenario of ['challenge-support','challenge-relay','challenge-tempo']){const s=scene(1,1);s.scenario=scenario;assert.equal(C.bothCanEndWithoutLosing(s,E.context(s,E.get(s,'a'),E.get(s,'d'))),false);}
const ordinary=scene(1,1);E.get(ordinary,'d').kind='rook';assert.equal(C.bothCanEndWithoutLosing(ordinary,E.context(ordinary,E.get(ordinary,'a'),E.get(ordinary,'d'))),false);
console.log('通过：普通棋子与残局不套用将帅互保和的评分。');
