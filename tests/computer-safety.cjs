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
test('将帅可确保反杀时不因残血进攻子放弃存活吃子，判断与实际防守一致',()=>{
  const sample={pieces:[['rk','red','king',4,9,18],['bk','black','king',3,0,18],['rr','red','rook',0,5,18],['br','black','horse',5,7,1],['bp','black','rook',0,4,2],['block','black','pawn',3,3,18]]};
  for(const rotated of [false,true]){
    const s=scene(sample,rotated);s.turn=rotated?'black':'red';
    const king=E.get(s,'rk'),attacker=E.get(s,'br'),target=E.get(s,'bp'),before=JSON.stringify(s);
    const threat=copy(s);threat.turn=attacker.side;E.move(threat,attacker.id,king.x,king.y);
    const plan=C.combatPlan(threat,king.side);assert(plan.length);
    for(const option of plan)for(const id of C.choices(threat,E.get(threat,attacker.id),threat.duel)){
      const result=copy(threat);E.resolve(result,id,option.id);
      assert(!E.get(result,attacker.id));assert(E.get(result,king.id)?.hp>0);
    }
    for(const roll of [0,.25,.5,.75,.999999]){
      const action=C.board(s,()=>roll);assert.equal(action.id,'rr');assert.equal(action.x,target.x);assert.equal(action.y,target.y);
    }
    const capture=copy(s);E.move(capture,'rr',target.x,target.y);
    for(const option of C.combatPlan(capture,s.turn))for(const id of C.choices(capture,E.get(capture,target.id),capture.duel)){
      const result=copy(capture);E.resolve(result,option.id,id);assert(!E.get(result,target.id));assert(E.get(result,'rr')?.hp>0);
    }
    assert.equal(JSON.stringify(s),before);
    for(const [kingHp,attackerHp] of [[18,18],[1,1]]){
      E.get(s,king.id).hp=kingHp;E.get(s,attacker.id).hp=attackerHp;
      assert.equal(C.battleOutlook(s,E.context(s,E.get(s,attacker.id),E.get(s,king.id))).counters.length,0);
      assert.equal(C.board(s,()=>0).id,king.id,'不能确认反杀时仍优先将帅避险');
    }
  }
});
function exposedCapture(rotated=false){
  const sample={pieces:[['rk','red','king',4,9,1],['bk','black','king',3,0,18],['rr','red','rook',4,5,18],['br','black','rook',4,0,18],['target','black','pawn',0,5,1]]};
  const s=scene(sample,rotated);s.turn=rotated?'black':'red';return s;
}
test('确保存活的吃子仍须核对让开线路后的将帅确定败局，红黑一致',()=>{
  for(const rotated of [false,true]){
    const s=exposedCapture(rotated),before=JSON.stringify(s),target=E.get(s,'target'),ctx=E.context(s,E.get(s,'rr'),target),out=C.battleOutlook(s,ctx);
    assert(out.finishes.length);
    for(const id of out.finishes)for(const reply of C.choices(s,target,ctx)){
      const next=copy(s);E.move(next,'rr',target.x,target.y);E.resolve(next,id,reply);
      assert(!E.get(next,'target'));assert(E.get(next,'rr')?.hp>0);assert(winsAgainstKing(next,'br'));
    }
    const capture=a=>a.id==='rr'&&a.x===target.x&&a.y===target.y;
    assert(C.rankedActions(s).find(capture).score<-500);
    for(const roll of [0,.25,.5,.75,.999999]){
      const action=C.board(s,()=>roll);assert(!capture(action));
      const next=copy(s);E.move(next,action.id,action.x,action.y);assert(!winsAgainstKing(next,'br'));
    }
    assert.equal(JSON.stringify(s),before);
  }
});
test('吃子后仍有阻挡或无法确认击倒将帅时，不误报确定败局',()=>{
  for(const rotated of [false,true])for(const safe of ['blocked','healthy']){
    const s=exposedCapture(rotated),target=E.get(s,'target');
    if(safe==='blocked')s.pieces.push(E.piece('blocker',s.turn,'pawn',4,rotated?3:6));
    else E.get(s,'rk').hp=18;
    const before=JSON.stringify(s),capture=C.rankedActions(s).find(a=>a.id==='rr'&&a.x===target.x&&a.y===target.y);
    assert(capture.score>-500);assert.equal(C.board(s,()=>0).id,'rr');assert.equal(JSON.stringify(s),before);
  }
});
function kingCapture(rotated=false,extraSupport=false,defending=false){
  const sample={pieces:[['rk','red','king',4,9,9],['bk','black','king',3,0,18],['target','black','pawn',4,8,1],['br','black','rook',4,5,18]]};
  if(extraSupport)sample.pieces.push(['bh','black','horse',2,7,18]);
  const s=scene(sample,rotated),king=E.get(s,'rk'),target=E.get(s,'target');
  king.learned=['king_calm'];king.exhausted=['king_calm'];
  target.learned=extraSupport?['pawn_grit']:['pawn_advance','pawn_grit'];
  s.turn=defending?target.side:king.side;
  if(defending)E.move(s,target.id,king.x,king.y);else E.move(s,king.id,target.x,target.y);
  return s;
}
function checkedKingPlan(s){
  const king=E.get(s,'rk'),before=JSON.stringify(s),plan=C.combatPlan(s,king.side);
  assert.equal(JSON.stringify(s),before,'选招不得改写生命、耗牌、历史或重复记录');
  assert(plan.length&&plan.every(x=>Number.isFinite(x.weight)&&x.weight>=0&&!E.availability(s,king,x.id,s.duel)));
  assert(Math.abs(plan.reduce((n,x)=>n+x.weight,0)-1)<1e-9);
  return copy(plan);
}
test('将帅首轮吃子有避险替代时排除下一手确定败局，红黑一致',()=>{
  for(const rotated of [false,true]){
    const s=kingCapture(rotated),side=E.get(s,'rk').side,before=JSON.stringify(s);
    const danger=copy(s);E.resolve(danger,'break','pawn_advance');
    assert.equal(E.get(danger,'rk').hp,1);assert.equal(danger.turn,E.OTHER[side]);assert(winsAgainstKing(danger,'br'));
    assert.deepEqual(checkedKingPlan(s),[{id:'strike',weight:1}]);
    for(const option of checkedKingPlan(s))for(const reply of C.choices(s,E.get(s,'target'),s.duel)){
      const next=copy(s);E.resolve(next,option.id,reply);
      assert(!E.get(next,'target'));assert(E.get(next,'rk')?.hp>0);
      assert(!next.pieces.some(p=>p.side===next.turn&&winsAgainstKing(next,p.id)));
    }
    for(const roll of [0,.25,.5,.75,.999999])assert.equal(C.combat(s,side,()=>roll),'strike');
    assert(C.practicePlan(s,side).some(x=>x.id==='break'&&x.weight>0));
    assert.equal(JSON.stringify(s),before);
  }
});
test('将帅守方反杀后轮到己方行动，不按敌方立即进攻筛掉反杀招式',()=>{
  for(const rotated of [false,true]){
    const s=kingCapture(rotated,false,true),next=copy(s),side=E.get(s,'rk').side;
    E.resolve(next,'pawn_advance','break');assert.equal(next.turn,side);assert.equal(E.get(next,'rk').hp,1);
    const wrongTurn=copy(next);wrongTurn.turn=E.OTHER[side];assert(winsAgainstKing(wrongTurn,'br'));
    const king=E.get(next,'rk');assert(E.moves(next,king).some(move=>{
      if(E.at(next,move.x,move.y))return false;
      const escaped=copy(next);E.move(escaped,king.id,move.x,move.y);return !winsAgainstKing(escaped,'br');
    }));
    assert.deepEqual(checkedKingPlan(s),[{id:'strike',weight:.5},{id:'break',weight:.5}]);
  }
});
test('全部首轮存活吃子招式都有危险回应时，仍返回合法且归一的非空计划',()=>{
  for(const rotated of [false,true]){
    const s=kingCapture(rotated,true),out=C.battleOutlook(s,s.duel);
    assert(out.finishes.length>1);
    for(const id of out.finishes)assert(C.choices(s,E.get(s,'target'),s.duel).some(reply=>{
      const next=copy(s);E.resolve(next,id,reply);return winsAgainstKing(next,'br');
    }));
    const plan=checkedKingPlan(s);assert(plan.every(x=>out.finishes.includes(x.id)));
  }
});
test('将帅吃子已实际获胜或判和时，不虚构结束后的敌方进攻',()=>{
  for(const rotated of [false,true]){
    const s=kingCapture(rotated),out=C.battleOutlook(s,s.duel);
    for(const id of out.finishes)for(const reply of C.choices(s,E.get(s,'target'),s.duel)){
      const next=copy(s);E.resolve(next,id,reply);s.repetitions[E.key(next)]=E.DRAW.repetitions-1;
    }
    for(const option of checkedKingPlan(s))for(const reply of C.choices(s,E.get(s,'target'),s.duel)){
      const end=copy(s);E.resolve(end,option.id,reply);assert.equal(end.winner,'draw');
    }
    assert.equal(checkedKingPlan(s).length,out.finishes.length);
    const won=scene({pieces:[['rk','red','king',3,9,9],['bk','black','king',3,0,1],['br','black','rook',4,0,18]]},rotated);
    const king=E.get(won,'rk'),enemy=E.get(won,'bk');won.turn=king.side;E.move(won,king.id,enemy.x,enemy.y);
    for(const option of checkedKingPlan(won))for(const reply of C.choices(won,enemy,won.duel)){
      const end=copy(won);E.resolve(end,option.id,reply);assert.equal(end.winner,king.side);
    }
  }
});
console.log('将帅安全：'+checks+' 项检查通过。');
