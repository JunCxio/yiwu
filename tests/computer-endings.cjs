const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
let passed=0;
function test(name,fn){try{fn();passed++;console.log('通过：'+name);}catch(error){process.exitCode=1;console.error('失败：'+name+'；'+error.message);}}
function scene(rotated=false,losing=false){
  const s=E.create('attrition');s.repetitions={};
  s.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',4,0),E.piece('hero','red','rook',5,4),E.piece('target','black','pawn',5,3)];
  E.get(s,losing?'hero':'target').hp=1;
  if(losing)s.pieces.push(E.piece('enemy','black','rook',8,2));
  if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  return s;
}
function nextState(s,action){const next=copy(s);if(action.type==='rest')E.rest(next,action.id,action.card);else E.move(next,action.id,action.x,action.y);return next;}
const near=s=>{const ranked=C.rankedActions(s);return ranked.filter(a=>a.score>=ranked[0].score-.06);};
const targets=(s,action)=>{const target=E.get(s,'target');return action.type==='move'&&action.id==='hero'&&action.x===target.x&&action.y===target.y;};

test('优势局临近无伤判和时，选择可确保存活的吃子机会，红黑视角一致',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated);s.quiet=E.DRAW.quiet-1;const before=JSON.stringify(s),selected=near(s);
    assert(selected.every(a=>targets(s,a)),'不能为终局后的追将收益放弃存活吃子');
    const next=nextState(s,selected[0]),hero=E.get(next,'hero'),target=E.get(next,'target'),outlook=C.battleOutlook(next,next.duel);
    assert(outlook.finishes.length>0,'样本必须能确保首轮存活击倒');
    for(const id of outlook.finishes)for(const reply of C.choices(next,target,next.duel)){
      const result=copy(next);E.resolve(result,id,reply);
      assert.equal(result.phase,'board');assert.equal(result.quiet,0);assert(E.get(result,hero.id));assert(!E.get(result,target.id));
    }
    assert.equal(JSON.stringify(s),before,'检查不得改动棋局与重复记录');
  }
});

test('第三次完整局面重复按实际判和评估，优势局保留吃子机会',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated),hero=E.get(s,'hero'),drawAction={type:'move',id:hero.id,x:4,y:rotated?5:4};
    const next=nextState(s,drawAction);s.repetitions[E.key(next)]=E.DRAW.repetitions-1;
    const end=nextState(s,drawAction);assert.equal(end.winner,'draw');assert(end.reason.includes('第三次'));
    const before=JSON.stringify(s);assert(near(s).every(a=>targets(s,a)));assert.equal(JSON.stringify(s),before);
  }
});

test('已经结束的同一和局不再受追将、重复惩罚或整备加分影响',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated),hero=E.get(s,'hero');s.quiet=E.DRAW.quiet-1;
    hero.learned=['rook_crush'];hero.exhausted=['rook_crush'];
    const repeated={type:'move',id:hero.id,x:4,y:rotated?5:4};s.repetitions[E.key(nextState(s,repeated))]=E.DRAW.repetitions-1;
    const draws=C.rankedActions(s).filter(a=>nextState(s,a).winner==='draw');
    assert(draws.some(a=>a.type==='rest'));assert(draws.length>2);
    assert(draws.every(a=>a.score===draws[0].score),'相同终局应使用相同结果评分');
  }
});

test('劣势局可接受立即判和，确定将帅取胜仍优先',()=>{
  for(const rotated of [false,true]){
    const s=scene(rotated,true);s.quiet=E.DRAW.quiet-1;
    assert(near(s).every(a=>nextState(s,a).winner==='draw'),'不能为亏损交战放弃可得和局');
    const hero=E.get(s,'hero'),king=s.pieces.find(p=>p.side!==s.turn&&p.kind==='king');hero.hp=18;hero.x=king.x;hero.y=rotated?7:2;king.hp=1;
    const a=C.board(s,()=>0);assert.equal(a.id,hero.id);assert.equal(a.x,king.x);assert.equal(a.y,king.y);
    const next=nextState(s,a);for(const reply of C.choices(next,E.get(next,king.id),next.duel)){
      const result=copy(next);E.resolve(result,'strike',reply);assert.equal(result.winner,s.turn);
    }
  }
});

test('残局最后一次行动中，移动与整备的时限失败均不能冒充站位收益',()=>{
  const s=E.create('challenge-tempo');s.ply=E.CHALLENGES[s.scenario].limit-1;E.get(s,'target').hp=1;
  const before=JSON.stringify(s),ranked=C.rankedActions(s),quiet=ranked.filter(a=>nextState(s,a).phase==='ended');
  assert(quiet.some(a=>a.type==='rest'),'样本须包含整备');assert(quiet.some(a=>a.type==='move'),'样本须包含移动');
  for(const a of quiet){assert.equal(nextState(s,a).winner,'black');assert(a.score<-500,'时限失败必须按失利评估');}
  assert(near(s).every(a=>targets(s,a)));assert.equal(JSON.stringify(s),before);
});

test('电脑达到残局时限即可获胜时，优先落实实际胜局',()=>{
  for(const scenario of Object.keys(E.CHALLENGES)){
    const s=E.create(scenario);s.ply=E.CHALLENGES[scenario].limit-1;s.turn='black';const before=JSON.stringify(s);
    const selected=near(s);assert(selected.length>0);
    for(const a of selected){const end=nextState(s,a);assert.equal(end.phase,'ended','必须直接完成胜局');assert.equal(end.winner,'black');}
    assert.equal(JSON.stringify(s),before);assert(C.rankedActions(s).every(a=>Number.isFinite(a.score)));
  }
});
function replayCombat(commands){
  const s=E.create(commands[0][1]);
  for(const [name,...args]of commands.slice(1))E[name](s,...args);
  assert.equal(s.phase,'duel');return s;
}
const wonRound=[['create','challenge-tempo'],['move','hero',4,4],['resolve','guard','guard'],['resolve','strike','break']];
const blackRound=[['create','challenge-tempo'],['move','hero',4,4],['resolve','guard','focus'],['resolve','focus','focus'],['resolve','guard','break']];
const wrongKing=[['create','challenge-support'],['move','helper',1,0],['move','black_king',4,0],['move','helper',4,0],['resolve','break','guard'],['resolve','break','guard'],['resolve','break','guard'],['resolve','strike','guard']];
function checkPlan(s,side){
  const before=JSON.stringify(s),plan=C.combatPlan(s,side);assert.equal(JSON.stringify(s),before);
  assert(plan.length>0);assert(plan.every(x=>Number.isFinite(x.weight)&&x.weight>=0));
  assert(Math.abs(plan.reduce((n,x)=>n+x.weight,0)-1)<1e-9);return plan;
}
test('真实残局中双方本轮可确定获胜时，只从实际获胜招式中选择',()=>{
  for(const [commands,side]of [[wonRound,'red'],[blackRound,'black']]){
    const s=replayCombat(commands),ctx=s.duel,a=E.get(s,ctx.a),d=E.get(s,ctx.d),isA=a.side===side;
    const winning=id=>C.choices(s,isA?d:a,ctx).every(reply=>{const next=copy(s);E.resolve(next,isA?id:reply,isA?reply:id);return next.winner===side;});
    assert(winning('strike')&&winning('break'));
    const plan=checkPlan(s,side);assert(plan.every(x=>x.id!=='retreat'&&winning(x.id)));
    for(const roll of [0,.25,.5,.75,.999999])assert(winning(C.combat(s,side,()=>roll)));
  }
});
test('提前击倒黑将会失败时，首轮与后续武斗不把确定失败作为吃子收益',()=>{
  for(const opening of [false,true]){
    const s=replayCombat(opening?wrongKing.slice(0,4):wrongKing);if(opening)E.get(s,'black_king').hp=1;
    const bad=copy(s);E.resolve(bad,'strike','guard');assert.equal(bad.winner,'black');
    const plan=checkPlan(s,'red');assert(plan.every(x=>!['strike','break'].includes(x.id)));
    const best=[...plan].sort((a,b)=>b.weight-a.weight)[0];assert(['focus','retreat'].includes(best.id));
  }
});
test('用错击败者或缺少指定支援时，击倒目标不能冒充挑战成功',()=>{
  for(const support of [false,true]){
    const commands=support?[['create','challenge-support'],['move','helper',4,4],['resolve','strike','focus']]
      :[['create','challenge-support'],['move','helper',1,0],['move','black_king',4,0],['move','hero',4,4],['resolve','strike','focus'],['resolve','strike','guard']];
    const s=replayCombat(commands),bad=copy(s);E.resolve(bad,'strike','focus');assert.equal(bad.winner,'black');
    assert(checkPlan(s,'red').every(x=>!['strike','break'].includes(x.id)));
  }
});
test('所有招式均直接失败的构造局面仍返回合法、归一的计划',()=>{
  const s=E.create('challenge-tempo');s.ply=3;E.get(s,'target').hp=18;E.get(s,'hero').hp=18;
  E.move(s,'hero',4,4);s.duel.round=6;
  for(const id of C.choices(s,E.get(s,'hero'),s.duel))for(const reply of C.choices(s,E.get(s,'target'),s.duel)){
    const next=copy(s);E.resolve(next,id,reply);assert.equal(next.winner,'black');
  }
  const ids=C.choices(s,E.get(s,'hero'),s.duel);assert(checkPlan(s,'red').every(x=>ids.includes(x.id)));
});
test('武斗终局预演与真实规则一致，非终局不误报，查看不改状态或上下文',()=>{
  for(const commands of [wonRound,blackRound,wrongKing,[['create','challenge-relay'],['move','veteran',4,4]]]){
    const s=replayCombat(commands),before=JSON.stringify(s),ctx=copy(s.duel);
    for(const id of C.choices(s,E.get(s,ctx.a),ctx))for(const reply of C.choices(s,E.get(s,ctx.d),ctx)){
      const next=copy(s);E.resolve(next,id,reply);const end=C.combatOutcome(s,ctx,id,reply);
      assert.equal(end?.winner??null,next.phase==='ended'?next.winner:null);
      if(end)assert.equal(end.reason,next.reason);
    }
    assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(ctx),JSON.stringify(s.duel));
  }
});
test('练习选招保留按类型等概率的设计，不强制执行标准电脑的终结招',()=>{
  const s=replayCombat(blackRound),before=JSON.stringify(s),plan=C.practicePlan(s,'black');
  assert.deepEqual(JSON.parse(JSON.stringify(plan)),['strike','guard','break','focus'].map(id=>({id,weight:.25})));
  assert.equal(JSON.stringify(s),before);
});
console.log('终局决策：'+passed+' / 12 项检查通过。');
