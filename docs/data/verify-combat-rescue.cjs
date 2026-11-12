const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=process.argv[2]||path.resolve(__dirname,'../../index.html'),file=process.argv[3]||path.join(__dirname,'combat-rescue-0.6.131.json'),priorFile=process.argv[4]||path.join(__dirname,'balance-0.6.129.json');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),data=JSON.parse(fs.readFileSync(file)),priorBytes=fs.readFileSync(priorFile),prior=JSON.parse(priorBytes),html=fs.readFileSync(source,'utf8');
assert.equal(data.format,'yiwu-combat-rescue-audit');assert.equal(data.version,'0.6.131');assert.equal(hash(html),data.sourceSHA256,'请使用报告指定的0.6.131源码');assert.equal(hash(priorBytes),data.priorDataSHA256);
const box=vm.createContext({});for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);const E=box.Yiwu,C=box.YiwuComputer;
function random(values){const state={...values};return {state,next:side=>()=>{state[side]=(Math.imul(state[side],1664525)+1013904223)>>>0;return state[side]/4294967296;}};}
function args(a){return a.type==='pass'?[]:a.type==='rest'?[a.id,a.card]:[a.id,a.x,a.y];}
let boardChoices=0,combatChoices=0,commands=0,auditSettlements=0;
function choose(s,rng){
  if(s.phase==='board'){boardChoices++;const action=C.board(s,rng.next(s.turn),'practice');return [action.type,...args(action)];}
  if(s.phase==='duel'){combatChoices++;const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),x=C.combat(s,a.side,rng.next(a.side),'practice');if(x==='retreat')return ['retreat'];combatChoices++;return ['resolve',x,C.combat(s,d.side,rng.next(d.side),'practice')];}
  return null;
}
function apply(s,command,damage){
  const [op,...values]=command,before=op==='resolve'?{a:E.get(s,s.duel.a),d:E.get(s,s.duel.d),hpA:E.get(s,s.duel.a).hp,hpD:E.get(s,s.duel.d).hp}:null;E[op](s,...values);
  if(before){damage[before.a.id].damage+=before.hpD-(E.get(s,before.d.id)?.hp||0);damage[before.d.id].damage+=before.hpA-(E.get(s,before.a.id)?.hp||0);}
}
function activity(s){return Object.fromEntries(s.pieces.map(p=>[p.id,{side:p.side,kind:p.kind,damage:0}]));}
function threats(s,side){if(s.phase==='ended')return s.winner===E.OTHER[side]?['terminal-loss']:[];const king=s.pieces.find(p=>p.side===side&&p.kind==='king');assert(king);return s.pieces.filter(p=>p.side!==side&&E.canMove(s,p,king.x,king.y)&&!C.battleOutlook(s,E.context(s,p,king)).counters.length).map(p=>p.id);}
const primaryPlan=JSON.parse(data.primary.planSource),conditionalPlan=JSON.parse(data.conditional.planSource);
for(const [batch,plan]of [[data.primary,primaryPlan],[data.conditional,conditionalPlan]]){assert.equal(hash(batch.planSource),batch.planSHA256);assert.equal(plan.sourceSHA256,data.sourceSHA256);assert.equal(hash(data.drivers.runner),plan.runnerSHA256);assert.equal(hash(data.drivers.worker),plan.workerSHA256);assert.equal(batch.runs.length,plan.tasks.length);assert.equal(plan.resourceLimit.plies,2000);assert.equal(plan.resourceLimit.steps,14000);}
assert.equal(conditionalPlan.parentPlanSHA256,data.primary.planSHA256);assert.equal(primaryPlan.states.length,33);assert.equal(primaryPlan.tasks.length,94);assert.equal(conditionalPlan.states.length,128);assert.equal(conditionalPlan.tasks.length,256);
const oldRuns=[...prior.reports.flatMap(r=>r.runs.map(run=>({group:'primary',run}))),...prior.diagnostics.runs.map(run=>({group:'confirmation',run}))],origins=[],expectedTasks=[];
for(const [index,start]of primaryPlan.states.entries()){
  const reference=start.reference,found=oldRuns.filter(r=>r.group===reference.group&&JSON.stringify(r.run.input)===JSON.stringify(reference.input));assert.equal(found.length,1);const old=found[0].run;assert.deepEqual(start.control,{winner:old.winner,plies:old.plies,commands:old.commands,terminalSHA256:old.terminalSHA256});assert.deepEqual(old.commands.slice(0,start.prefix.length),start.prefix);
  const rng=random({[old.input.aSide]:old.input.seedA,[E.OTHER[old.input.aSide]]:old.input.seedB});let s,damage;
  for(const cmd of start.prefix){if(cmd[0]==='create'){assert(!s);s=E.create(cmd[1]);damage=activity(s);}else{const expected=choose(s,rng);if(expected)assert.deepEqual(cmd,expected);apply(s,cmd,damage);}}
  assert.equal(s.phase,'board');assert.equal(hash(JSON.stringify(s)),start.stateSHA256);assert.deepEqual(copy(s),start.state);assert.deepEqual(rng.state,start.rng);assert.equal(s.turn,E.OTHER[old.winner]);origins.push({damage});
  const row=data.audit.rows[index];assert.equal(row.stateSHA256,start.stateSHA256);assert.deepEqual(row.prefix,start.prefix);assert.deepEqual(row.cases,[start.reference]);assert.deepEqual(row.beforeThreats,Array.from(threats(s,s.turn)));
  const attacks=Array.from(s.pieces.filter(p=>p.side===s.turn),p=>Array.from(E.moves(s,p)).filter(m=>E.at(s,m.x,m.y)).map(m=>({type:'move',id:p.id,x:m.x,y:m.y}))).flat();assert.deepEqual(row.alternatives.map(a=>a.action),attacks);expectedTasks.push({index:expectedTasks.length,state:index,action:null});
  for(const alternative of row.alternatives){
    const action=alternative.action,target=E.at(s,action.x,action.y),duel=copy(s);E.move(duel,action.id,action.x,action.y);const a=E.get(duel,duel.duel.a),d=E.get(duel,duel.duel.d),choices=[];
    assert.equal(alternative.target,target.id);assert.equal(alternative.targetHP,target.hp);assert.equal(alternative.targetThreatensKing,row.beforeThreats.includes(target.id));
    for(const id of C.choices(duel,a,duel.duel)){const replies=[];for(const reply of C.choices(duel,d,duel.duel)){const next=copy(duel);E.resolve(next,id,reply);auditSettlements++;replies.push({reply,phase:next.phase,winner:next.winner||null,hpA:E.get(next,a.id)?.hp||0,hpD:E.get(next,d.id)?.hp||0,threats:next.phase==='duel'?null:Array.from(threats(next,s.turn)),nextSHA256:hash(JSON.stringify(next))});}choices.push({id,guaranteedOneRoundRescue:replies.every(r=>r.phase!=='duel'&&!r.threats.length),replies});}
    assert.deepEqual(choices,alternative.choices);assert.deepEqual(alternative.guaranteedRescueChoices,choices.filter(c=>c.guaranteedOneRoundRescue).map(c=>c.id));assert.deepEqual(copy(C.twoRoundCapturePlan(duel)),alternative.twoRoundCapturePlan);expectedTasks.push({index:expectedTasks.length,state:index,action});
  }
}
assert.deepEqual(primaryPlan.tasks,expectedTasks);assert.equal(auditSettlements,1289);assert.equal(data.audit.summary.attackAlternatives,61);
function checkBatch(batch,plan,conditional=false){
  const analysis=[];assert.deepEqual(batch.runs.map(r=>r.task),plan.tasks.map(t=>t.index));
  for(const run of batch.runs){
    const task=plan.tasks[run.task],start=plan.states[task.state],origin=conditional?start.originalState:task.state,side=start.state.turn;assert.equal(run.state,task.state);assert.deepEqual(run.action,task.action);assert.deepEqual(run.commands.slice(0,start.prefix.length),start.prefix);
    let s=copy(start.state),damage=copy(origins[origin].damage),firstExit=null;const initialHP=Object.keys(damage).length*18,rng=random(start.rng),kingID=s.pieces.find(p=>p.side===side&&p.kind==='king').id;
    for(const [i,cmd]of run.commands.slice(start.prefix.length).entries()){
      const expected=choose(s,rng);assert(expected);assert.deepEqual(cmd,i===0&&task.action?[task.action.type,...args(task.action)]:expected,'命令与原策略或指定单次替代不符');apply(s,cmd,damage);
      if(task.action&&!firstExit&&s.phase!=='duel')firstExit={command:i+start.prefix.length,phase:s.phase,winner:s.winner||null,kingHP:E.get(s,kingID)?.hp||0,threats:Array.from(threats(s,side))};
      assert(s.ply<2000&&i<14000);
    }
    commands+=run.commands.length;assert.equal(s.phase,'ended');assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(run.defendingSide,side);assert.equal(run.defenderAvoidsLoss,s.winner!==E.OTHER[side]);assert.equal(Object.values(damage).reduce((n,p)=>n+p.damage,0),initialHP-s.pieces.reduce((n,p)=>n+p.hp,0));
    if(!task.action){assert.deepEqual(run.commands,start.control.commands);assert.equal(run.terminalSHA256,start.control.terminalSHA256);}
    else{const alternative=data.audit.rows[origin].alternatives.find(a=>JSON.stringify(a.action)===JSON.stringify(task.action)),target=E.at(start.state,task.action.x,task.action.y);analysis.push({task:run.task,state:run.state,action:run.action,target:target?.id||null,targetThreatensKing:alternative?.targetThreatensKing||false,winner:run.winner,plies:run.plies,defenderAvoidsLoss:run.defenderAvoidsLoss,firstExit,contributorCount:run.winner==='draw'?null:Object.values(damage).filter(p=>p.side===run.winner&&p.damage>0).length,damage});}
    if((run.task+1)%32===0)console.log(JSON.stringify({batch:conditional?'conditional':'primary',checked:run.task+1,total:batch.runs.length}));
  }
  return analysis;
}
const primary=checkBatch(data.primary,primaryPlan);assert.deepEqual(primary,data.primary.analysis.rows);const summary={games:94,controls:33,branches:61,commandsIncludingCreate:data.primary.runs.reduce((n,r)=>n+r.commands.length,0),ruleCommands:data.primary.runs.reduce((n,r)=>n+r.commands.length-1,0),wins:primary.filter(r=>r.winner===primaryPlan.states[r.state].state.turn).length,draws:primary.filter(r=>r.winner==='draw').length,losses:primary.filter(r=>!r.defenderAvoidsLoss).length,statesWithAvoidedLoss:new Set(primary.filter(r=>r.defenderAvoidsLoss).map(r=>r.state)).size,firstExitSafe:primary.filter(r=>r.firstExit.phase!=='ended'&&!r.firstExit.threats.length).length,firstExitWinOrDraw:primary.filter(r=>r.firstExit.phase==='ended'&&!r.firstExit.threats.length).length,avoidedLossButStillThreatened:primary.filter(r=>r.defenderAvoidsLoss&&r.firstExit.threats.length).length,stillSingleContributorWins:primary.filter(r=>r.winner!=='draw'&&r.contributorCount===1).length,longest:Math.max(...data.primary.runs.map(r=>r.plies))};assert.deepEqual(summary,data.primary.analysis.summary);
const selected=primary.filter(r=>r.firstExit.phase==='board'&&!r.firstExit.threats.length);assert.deepEqual(selected.map(r=>r.task),[43,71,78,82]);
const excluded=new Set();function collect(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='excludedSeeds'&&Array.isArray(item))item.forEach(seed=>excluded.add(seed));if(['seed','seedA','seedB'].includes(key)&&Number.isInteger(item))excluded.add(item>>>0);collect(item);}}collect(prior.plan);collect(prior.diagnostics.plan);prior.reports.forEach(r=>r.runs.forEach(run=>collect(run.input)));prior.diagnostics.runs.forEach(run=>collect(run.input));assert.equal(excluded.size,conditionalPlan.priorSeedsChecked);assert.deepEqual([...excluded].sort((a,b)=>a-b),[...conditionalPlan.excludedSeeds].sort((a,b)=>a-b));
const conditionalTasks=[];
for(const [index,start]of conditionalPlan.states.entries()){
  const branch=selected[Math.floor(index/32)],original=primaryPlan.states[branch.state],replicate=index%32;assert.equal(start.originalState,branch.state);assert.equal(start.originalBranchTask,branch.task);assert.equal(start.replicate,replicate);for(const key of ['reference','stateSHA256','state','prefix','control'])assert.deepEqual(start[key],original[key]);const values={};
  for(const side of ['red','black']){const seed=crypto.createHash('sha256').update(conditionalPlan.seedLabel+':'+branch.task+':'+replicate+':'+side).digest().readUInt32LE(0);assert(!excluded.has(seed));excluded.add(seed);values[side]=seed;}assert.deepEqual(start.rng,values);assert.deepEqual(conditionalPlan.newRoots[index],{originalBranchTask:branch.task,replicate,...values});
  const [type,id,x,y]=original.reference.chosen;for(const [option,action]of [['originalMove',{type,id,x,y}],['counterattack',branch.action]])conditionalTasks.push({index:conditionalTasks.length,state:index,option,action});
}
assert.deepEqual(conditionalPlan.tasks,conditionalTasks);const conditional=checkBatch(data.conditional,conditionalPlan,true),conditionalSummary=[];
for(const branch of selected)for(const option of ['originalMove','counterattack']){const rows=data.conditional.runs.filter(r=>conditionalPlan.states[r.state].originalBranchTask===branch.task&&conditionalPlan.tasks[r.task].option===option);assert.equal(rows.length,32);conditionalSummary.push({originalBranchTask:branch.task,option,games:rows.length,wins:rows.filter(r=>r.winner===r.defendingSide).length,draws:rows.filter(r=>r.winner==='draw').length,losses:rows.filter(r=>r.winner!==r.defendingSide&&r.winner!=='draw').length,meanPlies:rows.reduce((n,r)=>n+r.plies,0)/rows.length,maxPlies:Math.max(...rows.map(r=>r.plies))});}assert.deepEqual(conditionalSummary,data.conditional.summary);
assert.equal(commands,51378);assert.deepEqual(data.summary,{games:350,commands:51378,primary:summary,conditionalGames:256});console.log(JSON.stringify({games:350,commands,boardChoices,combatChoices,auditSettlements,newSeeds:conditionalPlan.newRoots.length*2,allTerminalHashesMatch:true,allDecisionsMatch:true}));
