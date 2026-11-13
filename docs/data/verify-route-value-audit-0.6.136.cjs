const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),bytes=fs.readFileSync(__dirname+'/route-value-audit-0.6.136.json.gz');assert.equal(hash(bytes),'6f624bbd70974fa58089ba1a7890c65bca7d875c32e83f5a43c19666cdd6c101');
const data=JSON.parse(zlib.gunzipSync(bytes)),priorBytes=fs.readFileSync(__dirname+'/'+data.priorArchive);assert.equal(hash(priorBytes),data.priorArchiveSHA256);const prior=JSON.parse(zlib.gunzipSync(priorBytes)),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8');
assert.equal(data.baseVersion,'0.6.136');assert.equal(data.strategyChanged,false);assert.equal(hash(source),data.sourceSHA256,'请提供报告指定的0.6.136入口');assert.equal(source,prior.files['baseline.html']);assert.equal(data.plan.baselineSHA256,data.sourceSHA256);
assert.equal(hash(JSON.stringify(data.diagnosis,null,2)+'\n'),data.plan.diagnosisSHA256);assert.equal(hash(prior.files['driver-v3.cjs']),data.plan.driverSHA256);
const box=vm.createContext({});for(const m of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);const E=box.Yiwu,C=box.YiwuComputer;
function replay(commands){let s;for(const [op,...args]of commands){assert(['create','learn','start','move','rest','pass','resolve','retreat'].includes(op));if(op==='create'){assert(!s);s=E.create(...args);}else E[op](s,...args);}return s;}
function route(s,id){
  const p=E.get(s,id),fixed=s.pieces.filter(q=>q.id!==id),occupied=new Set(fixed.map(q=>q.y*9+q.x)),edges=Array.from({length:90},()=>[]),targetIds=Array.from({length:90},()=>[]);
  for(let k=0;k<90;k++)if(!occupied.has(k)){
    const at={...p,x:k%9,y:Math.floor(k/9)},projected={...s,pieces:[...fixed,at]};
    for(const move of E.moves(projected,at))if(!move.capture)edges[k].push(move.y*9+move.x);
    targetIds[k]=fixed.filter(q=>q.side!==p.side&&E.canMove(projected,at,q.x,q.y)).map(q=>q.id);
  }
  const start=p.y*9+p.x,distance=Array(90).fill(Infinity),queue=[start];distance[start]=0;
  for(let i=0;i<queue.length;i++)for(const k of edges[queue[i]])if(!Number.isFinite(distance[k])){distance[k]=distance[queue[i]]+1;queue.push(k);}
  const shortest=Math.min(...distance.filter((_,k)=>targetIds[k].length)),endpoints=[];
  if(Number.isFinite(shortest))for(let k=0;k<90;k++)if(distance[k]===shortest&&targetIds[k].length){
    const at={...p,x:k%9,y:Math.floor(k/9)},projected={...copy(s),turn:p.side,pieces:[...copy(fixed),at]},ranked=C.rankedActions(projected);
    endpoints.push({x:at.x,y:at.y,targets:targetIds[k].map(id=>{const q=E.get(projected,id),action=ranked.find(a=>a.type==='move'&&a.id===p.id&&a.x===q.x&&a.y===q.y),out=C.battleOutlook(projected,E.context(projected,at,q));assert(action);return {id,kind:q.kind,hp:q.hp,score:action.score,firstRoundScore:out.score,finishes:copy(out.finishes),counters:copy(out.counters)};})});
  }
  const targets=endpoints.flatMap(e=>e.targets);return {distance:Number.isFinite(shortest)?shortest:null,maximumProjectedAttackScore:targets.length?Math.max(...targets.map(t=>t.score)):null,allProjectedAttacksNegative:targets.length>0&&targets.every(t=>Math.round(t.score*1e9)<0),endpoints};
}
const normalized=x=>{const r=copy(x);r.endpoints.sort((a,b)=>a.y-b.y||a.x-b.x);return r;},expectedRows=[];
for(const [batchName,id]of [['trial-v3','v3-primary'],['confirm','v3-holdout']]){
  const batch=prior.batches.find(b=>b.id===id);assert(batch);
  for(const [index,run]of batch.runs.entries()){
    if(index%4===0)continue;const control=batch.runs[index-index%4];let prefix=0;while(prefix<Math.min(run.commands.length,control.commands.length)&&JSON.stringify(run.commands[prefix])===JSON.stringify(control.commands[prefix]))prefix++;
    if(prefix===run.commands.length&&prefix===control.commands.length)continue;expectedRows.push([batchName,index,prefix]);
    const row=data.diagnosis.rows.find(r=>r.batch===batchName&&r.index===index);assert(row);assert.equal(row.commandIndex,prefix);const s=replay(run.commands.slice(0,prefix)),raw=JSON.stringify(s);assert.deepEqual(copy(s),row.state);assert.equal(s.phase,'board');assert.equal(row.ply,s.ply+1);assert.equal(row.selfPlay,index%4===1);
    for(const [name,command]of [['baseline',control.commands[prefix]],['candidate',run.commands[prefix]]]){
      const recorded=row.branches[name],[op,id,x,y]=command;assert.deepEqual(recorded.command,command);assert.equal(op,'move');assert(!E.at(s,x,y));const action=C.rankedActions(s).find(a=>a.type==='move'&&a.id===id&&a.x===x&&a.y===y);assert(action);assert.equal(action.score,recorded.score);
      const next=copy(s);E.move(next,id,x,y);assert.equal(next.phase,'board');assert.deepEqual(normalized(route(next,id)),normalized(recorded.route));assert.equal(C.kingLostNext(next,row.side,3),recorded.kingLostNext);
      const replies=C.rankedActions(next);assert.deepEqual(copy(replies.filter(a=>a.type==='move'&&E.at(next,a.x,a.y)?.id===id)),recorded.immediateEnemyAttacks);assert.deepEqual(copy(replies[0]),recorded.bestEnemyReply);
    }
    assert.equal(JSON.stringify(s),raw);assert.equal(row.branches.baseline.command[1],row.branches.candidate.command[1]);assert.equal(Math.round(row.branches.baseline.score*1e9),Math.round(row.branches.candidate.score*1e9));
  }
}
assert.deepEqual(data.diagnosis.rows.map(r=>[r.batch,r.index,r.commandIndex]),expectedRows);assert.equal(expectedRows.length,33);
const expectedGroups=[];for(const batch of ['trial-v3','confirm']){const rs=data.diagnosis.rows.filter(r=>r.batch===batch);expectedGroups.push({batch,firstDivergences:rs.length,changedSelfPlay:rs.filter(r=>r.selfPlay).length,candidateAllProjectedAttacksNegative:rs.filter(r=>r.branches.candidate.route.allProjectedAttacksNegative).length,baselineAllProjectedAttacksNegative:rs.filter(r=>r.branches.baseline.route.allProjectedAttacksNegative).length,candidateNewImmediateAttacks:rs.filter(r=>r.branches.candidate.immediateEnemyAttacks.length>r.branches.baseline.immediateEnemyAttacks.length).length,candidateKingLostNext:rs.filter(r=>r.branches.candidate.kingLostNext).length});}assert.deepEqual(expectedGroups,data.diagnosis.groups);
const expectedSpecs=data.diagnosis.rows.filter(r=>r.selfPlay).flatMap(row=>{
  const batch=prior.batches.find(b=>b.id===(row.batch==='confirm'?'v3-holdout':'v3-primary')),base={...batch.runs[row.index-1].input,models:{red:'baseline',black:'baseline'}},action=name=>{const [,id,x,y]=row.branches[name].command;return {type:'move',id,x,y,score:row.branches[name].score};};
  return [{case:row.batch+'-'+row.index,branch:'control',input:base,expectedControl:row.index-1,batch:row.batch},{case:row.batch+'-'+row.index,branch:'one-move',input:{...base,force:{ply:row.ply,expected:action('baseline'),action:action('candidate')}},expectedControl:row.index-1,batch:row.batch}];
});assert.deepEqual(data.plan.inputs,expectedSpecs);assert.equal(data.runs.length,32);assert.equal(data.report.rows.length,16);
let commands=0;for(const [i,run]of data.runs.entries()){
  assert.deepEqual(run.spec,expectedSpecs[i]);assert.deepEqual(run.result.input,run.spec.input);const s=replay(run.result.commands);assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.result.terminalSHA256);assert.equal(s.winner,run.result.winner);assert.equal(s.ply,run.result.plies);assert.equal(s.reason,run.result.reason);commands+=run.result.commands.length;
}
for(const [i,row]of data.report.rows.entries()){
  const control=data.runs[i*2],branch=data.runs[i*2+1],diag=data.diagnosis.rows.find(r=>r.selfPlay&&r.batch+'-'+r.index===control.spec.case),batch=prior.batches.find(b=>b.id===(diag.batch==='confirm'?'v3-holdout':'v3-primary')),original=batch.runs[diag.index-1],full=batch.runs[diag.index];
  assert.deepEqual(control.result.commands,original.commands);assert.equal(control.result.terminalSHA256,original.terminalSHA256);assert.deepEqual(branch.result.commands.slice(0,diag.commandIndex),original.commands.slice(0,diag.commandIndex));assert.deepEqual(branch.result.commands[diag.commandIndex],diag.branches.candidate.command);
  assert.equal(row.sameCommandsAsFullCandidate,JSON.stringify(branch.result.commands)===JSON.stringify(full.commands));assert.equal(row.sameTerminalAsFullCandidate,branch.result.terminalSHA256===full.terminalSHA256);
  const start=diag.commandIndex+1;let end=start;for(;end<branch.result.commands.length;end++){const s=replay(branch.result.commands.slice(0,end+1));if(s.phase==='ended'||s.phase==='board'&&s.turn===diag.side){assert.deepEqual(copy(s),row.replyState);break;}}
  assert.deepEqual(branch.result.commands.slice(start,end+1),row.actualEnemyCommands);const p=E.get(row.replyState,diag.piece.id);if(row.replyState.phase==='board'&&p)assert.deepEqual(normalized(route(row.replyState,p.id)),normalized(row.routeAfterReply));else assert.equal(row.routeAfterReply,null);
  const targets=[...new Set(diag.branches.candidate.route.endpoints.flatMap(e=>e.targets.map(t=>t.id)))],changed=targets.filter(id=>{const a=E.get(diag.state,id),b=E.get(row.replyState,id);return !b||a.x!==b.x||a.y!==b.y||a.hp!==b.hp;});assert.deepEqual(changed,row.changedTargets);
  const score=w=>w==='draw'?.5:w===diag.side?1:0;assert.equal(row.pointsChange,score(branch.result.winner)-score(control.result.winner));assert.equal(row.pliesChange,branch.result.plies-control.result.plies);assert.deepEqual(row.staticBefore,diag.branches.candidate.route);
  for(const [key,r]of [['control',control],['branch',branch]])assert.deepEqual(row[key],{winner:r.result.winner,plies:r.result.plies});
}
const groups=[];for(const negative of [false,true]){const rs=data.report.rows.filter(r=>r.staticBefore.allProjectedAttacksNegative===negative);groups.push({allStaticAttacksNegative:negative,cases:rs.length,improvedOutcomes:rs.filter(r=>r.pointsChange>0).length,worsenedOutcomes:rs.filter(r=>r.pointsChange<0).length,shorter:rs.filter(r=>r.pliesChange<0).length,longer:rs.filter(r=>r.pliesChange>0).length,unchangedLength:rs.filter(r=>r.pliesChange===0).length,totalPliesChange:rs.reduce((n,r)=>n+r.pliesChange,0),changedFirstTargets:rs.filter(r=>r.changedTargets.length).length,sameCommandsAsFullCandidate:rs.filter(r=>r.sameCommandsAsFullCandidate).length});}assert.deepEqual(groups,data.report.groups);
assert.equal(commands,12172);assert.equal(data.report.commands,commands);assert.equal(data.report.games,32);assert(data.report.allControlsMatchPriorCommandsAndTerminal&&data.report.allGamesNaturallyEndedAndReplayed);
console.log(JSON.stringify({verified:true,firstDivergences:33,games:32,commands,groups,staticDistancesAndScoresRecomputed:true,actualFirstResponsesReplayed:true,allComputerDecisionsRecomputed:false,strategyChanged:false}));
