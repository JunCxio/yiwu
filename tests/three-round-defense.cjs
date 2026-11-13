const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({}),copy=x=>JSON.parse(JSON.stringify(x));
for(const script of scripts.slice(0,2))vm.runInContext(script,box);const E=box.Yiwu,C=box.YiwuComputer,fixtures=require('./three-round-defense-fixture.json');let branches=0,checks=0;
function replay(commands){let s;for(const [op,...args]of commands)if(op==='create')s=E.create(...args);else E[op](s,...args);return s;}
function rotate(original){const s=copy(original);s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}if(s.duel)for(const key of ['origin','target']){s.duel[key].x=8-s.duel[key].x;s.duel[key].y=9-s.duel[key].y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));return s;}
function oracle(s,left,side){if(s.phase==='ended')return s.winner===side;if(s.phase!=='duel'||!left)return false;return C.choices(s,E.get(s,s.duel.a),s.duel).some(id=>C.choices(s,E.get(s,s.duel.d),s.duel).every(reply=>{const next=copy(s);E.resolve(next,id,reply);branches++;return oracle(next,left-1,side);}));}
function actualLoss(s,side,left){if(s.phase!=='board')return false;const king=s.pieces.find(p=>p.side===side&&p.kind==='king');return s.pieces.filter(p=>p.side!==side&&E.canMove(s,p,king.x,king.y)).some(p=>{const next=copy(s);next.turn=p.side;E.move(next,p.id,king.x,king.y);return oracle(next,left,p.side);});}
for(const row of fixtures){
  const original=replay(row.commands);assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),row.stateSHA256);
  for(const mirrored of [false,true]){
    const s=mirrored?rotate(original):original,side=mirrored?E.OTHER[row.defender]:row.defender,before=JSON.stringify(s);
    assert(!actualLoss(s,side,2));assert(actualLoss(s,side,3));assert(!C.kingLostNext(s,side));assert(!C.kingLostNext(s,side,false));assert(!C.kingLostNext(s,side,true));assert(C.kingLostNext(s,side,3));assert.equal(JSON.stringify(s),before);checks++;
  }
}
for(const row of fixtures.filter(r=>[131,1090,1559].includes(r.game)))for(const mirrored of [false,true]){
  const original=replay(row.commands.slice(0,-1)),s=mirrored?rotate(original):original,side=s.turn,before=JSON.stringify(s),bad=row.commands.at(-1),x=mirrored?8-bad[2]:bad[2],y=mirrored?9-bad[3]:bad[3],ranked=C.rankedActions(s);
  assert(ranked.find(a=>a.id===bad[1]&&a.x===x&&a.y===y).score<-500);
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){
    const action=C.board(s,()=>roll,difficulty),next=copy(s);assert(!(action.id===bad[1]&&action.x===x&&action.y===y));E.move(next,action.id,action.x,action.y);
    if(next.phase==='board')assert(!actualLoss(next,side,3));else assert.equal(next.phase,'duel');
  }
  assert.equal(JSON.stringify(s),before);checks++;
}
for(const game of [76,1580])for(const mirrored of [false,true]){
  const row=fixtures.find(r=>r.game===game),original=replay(row.commands.slice(0,-1)),s=mirrored?rotate(original):original,side=E.get(s,s.duel.a).side,before=JSON.stringify(s),plan=C.combatPlan(s,side),enemy=E.get(s,s.duel.d);
  assert(plan.length);assert(Math.abs(plan.reduce((n,p)=>n+p.weight,0)-1)<1e-9);
  for(const p of plan){assert(p.weight>0);for(const reply of p.id==='retreat'?[null]:C.choices(s,enemy,s.duel)){const next=copy(s);if(p.id==='retreat')E.retreat(next);else E.resolve(next,p.id,reply);branches++;assert(!actualLoss(next,side,3));}}
  if(game===76)assert.deepEqual(copy(plan),[{id:'retreat',weight:1}]);else assert(plan.every(p=>['strike','guard','break'].includes(p.id)));
  assert.equal(JSON.stringify(s),before);checks++;
}
{
  const names=['openingAdvice','combatAdvice','combatFollowUpRisk','retreatConsequence','retreatRisks','kingExposureRisk','firstRoundLossRisk','boardAdvice','previewBoardAction','actionOutcomeRisk','pawnEndRankRisk'];
  const helpers=names.map(name=>scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  }'))?.[0]).filter(Boolean);assert.equal(helpers.length,names.length);
  vm.runInContext('const E=Yiwu,C=YiwuComputer;let s,lesson=null;'+helpers.join('\n'),box);vm.runInContext('Object.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
  for(const game of [131,1559]){const row=fixtures.find(r=>r.game===game),s=replay(row.commands.slice(0,-1)),[op,id,x,y]=row.commands.at(-1),before=JSON.stringify(s);box.input=s;box.action={type:op,id,x,y};const advice=vm.runInContext('s=input;boardAdvice(action,true)',box);assert(advice.risks.some(t=>t.includes('武斗三轮内')));assert.equal(JSON.stringify(s),before);checks++;}
  const row=fixtures.find(r=>r.game===76),s=replay(row.commands.slice(0,-1));box.input=s;const advice=vm.runInContext('s=input;combatAdvice(E.get(s,s.duel.a),"break")',box);assert(advice.risks.some(t=>t.includes('武斗三轮内')));checks++;
}
{
  const s=E.create('quick');E.auto(s,'red');E.auto(s,'black');E.start(s);
  s.pieces=[E.piece('rk','red','king',3,9),E.piece('hero','red','rook',4,2),E.piece('bk','black','king',4,0)];E.get(s,'bk').hp=4;s.turn='red';s.repetitions={};
  const move={type:'move',id:'hero',x:4,y:0},next=copy(s);E.move(next,move.id,move.x,move.y);assert(!C.twoRoundWinningChoices(next,'red').length);assert(C.threeRoundWinningChoices(next,'red').length);assert(C.rankedActions(s).some(r=>r.id===move.id&&r.x===move.x&&r.y===move.y&&r.score===1000));
  box.input=s;box.ctx=E.context(s,E.get(s,'hero'),E.get(s,'bk'));const advice=vm.runInContext('s=input;openingAdvice(ctx)',box);assert(advice.threeRound);assert(advice.reason.includes('本场武斗三轮内获胜'));assert(advice.reason.includes('按新状态重新选择'));checks++;
}
{
  const fixture=require('./three-round-king-attack-fixture.json'),original=replay(fixture.commands);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),fixture.stateSHA256);
  for(const mirrored of [false,true]){
    const s=mirrored?rotate(original):original,before=JSON.stringify(s),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),plan=C.combatPlan(s,a.side);
    assert.equal(a.hp,1);assert.equal(d.hp,4);assert.equal(d.kind,'king');assert(plan.some(p=>p.id!=='retreat'&&p.weight>0));
    assert(Math.abs(plan.reduce((n,p)=>n+p.weight,0)-1)<1e-9);
    for(const choice of plan)for(const reply of choice.id==='retreat'?[null]:C.choices(s,d,s.duel)){
      const next=copy(s);if(choice.id==='retreat')E.retreat(next);else E.resolve(next,choice.id,reply);branches++;assert(!actualLoss(next,a.side,3));
    }
    assert.equal(JSON.stringify(s),before);checks++;
  }
}
console.log(JSON.stringify({checks,actualSettlementBranches:branches,inputUnchanged:true,hiddenChoicesUnread:true}));
