const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
const bytes=fs.readFileSync(__dirname+'/piece-route-trial-0.6.136.json.gz');assert.equal(hash(bytes),'bd731ead539db888337f8b7ee3697d0c9e2d60dc105e625ac1ed59e2c4528701');
const data=JSON.parse(zlib.gunzipSync(bytes)),json=name=>JSON.parse(data.files[name]),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8');
assert.equal(data.baseVersion,'0.6.136');assert.equal(data.candidateReleased,false);assert.equal(hash(source),data.baselineSHA256,'请提供报告指定的0.6.136入口');assert.equal(source,data.files['baseline.html']);
const scripts=html=>[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),engines={};
for(const [name,html,scopeFile]of [['baseline',source,null],['initial',data.files['candidate.html'],'scope.json'],['v2',data.files['candidate-v2.html'],'scope-v2.json'],['v3',data.files['candidate-v3.html'],'scope-v3.json']]){
  if(scopeFile){
    const scope=json(scopeFile);assert.equal(hash(html),scope.candidateSHA256);assert.equal(scope.baselineSHA256,data.baselineSHA256);
    let patched=source;for(const patch of scope.patches){assert.equal(patched.split(patch.from).length,2);patched=patched.replace(patch.from,patch.to);}assert.equal(patched,html);
    assert.equal(scripts(source)[0],scripts(html)[0]);assert.equal(source.match(/<style>[^]*?<\/style>/)[0],html.match(/<style>[^]*?<\/style>/)[0]);
  }
  const box=vm.createContext({});for(const script of scripts(html).slice(0,2))vm.runInContext(script,box);engines[name]={E:box.Yiwu,C:box.YiwuComputer};
}
const E=engines.baseline.E,replay=commands=>{
  let s;for(const [op,...args]of commands){assert(['create','learn','start','move','rest','pass','resolve','retreat'].includes(op));if(op==='create'){assert(!s);s=E.create(...args);}else{assert(s);if(op==='start'){assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);}E[op](s,...args);}}return s;
};
const expectedAcceptance={perGroupDirectPointsAtLeast:8,selfPlayMeanDoesNotIncrease:true,selfPlayMaximumDoesNotIncrease:true,atLeastOneGroupPaceImproves:true,allGamesEndNaturally:true,allCommandsAndTerminalsReplay:true,independentConfirmationRequiredBeforeAdoption:true};
const summaries=[];let totalCommands=0;
for(const [batchIndex,batch]of data.batches.entries()){
  const plan=json(batch.plan),report=json(batch.report),seen=new Set(plan.excludedSeeds),newSeeds=[];
  assert.equal(plan.roots.length,32);assert.equal(plan.inputs.length,128);assert.equal(batch.runs.length,128);assert.deepEqual(plan.acceptance,expectedAcceptance);
  assert.deepEqual(plan.limits,{maximumPlies:2000,maximumCommands:14000,limitIsFailureNotDraw:true});
  assert.equal(plan.baselineSHA256,data.baselineSHA256);assert.equal(plan.candidateSHA256,hash(data.files[batchIndex===0?'candidate-v2.html':'candidate-v3.html']));assert.equal(plan.driverSHA256,hash(data.files[batchIndex===0?'driver.cjs':'driver-v3.cjs']));
  assert.equal(plan.excludedSeeds.length,batchIndex===2?6364:6300);
  for(const [rootIndex,root]of plan.roots.entries()){
    for(const [side,key]of [['red','seedA'],['black','seedB']]){const value=crypto.createHash('sha256').update(`${plan.seedLabel}:${root.difficulty}:${root.scenario}:${root.replicate}:${side}`).digest().readUInt32LE(0);assert.equal(root[key],value);assert(!seen.has(value));seen.add(value);newSeeds.push(value);}
    for(const [offset,models]of [{red:'baseline',black:'baseline'},{red:'candidate',black:'candidate'},{red:'candidate',black:'baseline'},{red:'baseline',black:'candidate'}].entries())assert.deepEqual(plan.inputs[rootIndex*4+offset],{...root,style:'default',comparator:'spread',aVariant:0,bVariant:0,aSide:'red',group:batchIndex===2?'holdout':'primary',models});
  }
  assert.deepEqual(newSeeds,plan.newSeeds);
  let commands=0;
  for(const [index,run]of batch.runs.entries()){
    assert.deepEqual(run.input,plan.inputs[index]);const s=replay(run.commands);assert.equal(s.phase,'ended');assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(run.moves+run.rests+run.passes+run.battles,run.plies);commands+=run.commands.length;
  }
  const groups=[];
  for(const difficulty of ['standard','practice'])for(const scenario of ['quick','full']){
    const rows=batch.runs.filter(r=>r.input.difficulty===difficulty&&r.input.scenario===scenario),baseline=rows.filter(r=>r.input.models.red==='baseline'&&r.input.models.black==='baseline'),candidate=rows.filter(r=>r.input.models.red==='candidate'&&r.input.models.black==='candidate'),direct=rows.filter(r=>r.input.models.red!==r.input.models.black),mean=rs=>rs.reduce((n,r)=>n+r.plies,0)/rs.length;
    assert.equal(baseline.length,8);assert.equal(candidate.length,8);assert.equal(direct.length,16);
    const points=direct.reduce((n,r)=>n+(r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),0),baselineMean=mean(baseline),candidateMean=mean(candidate),baselineMaximum=Math.max(...baseline.map(r=>r.plies)),candidateMaximum=Math.max(...candidate.map(r=>r.plies));
    groups.push({difficulty,scenario,points,directWins:direct.filter(r=>r.winner!=='draw'&&r.input.models[r.winner]==='candidate').length,directDraws:direct.filter(r=>r.winner==='draw').length,baselineMean,candidateMean,baselineMaximum,candidateMaximum,baselineDraws:baseline.filter(r=>r.winner==='draw').length,candidateDraws:candidate.filter(r=>r.winner==='draw').length,identicalSelfPlayCommands:baseline.filter((r,i)=>JSON.stringify(r.commands)===JSON.stringify(candidate[i].commands)).length,passed:points>=8&&candidateMean<=baselineMean&&candidateMaximum<=baselineMaximum,paceImproves:candidateMean<baselineMean||candidateMaximum<baselineMaximum});
  }
  assert.deepEqual(groups,report.groups);assert.equal(report.commands,commands);assert.equal(report.games,128);assert.equal(report.passed,groups.every(g=>g.passed)&&groups.some(g=>g.paceImproves));assert(report.completed&&report.allGamesNaturallyEndedAndReplayed);
  assert.equal(report.passed,batchIndex===1);if(batchIndex===2)assert(report.independentConfirmationStarted&&report.independentConfirmationCompleted);
  summaries.push({id:batch.id,games:128,commands,passed:report.passed});totalCommands+=commands;
}
const [primary,revised,holdout]=data.batches.map(b=>json(b.plan));assert.deepEqual(primary.inputs,revised.inputs);assert.deepEqual(primary.roots,revised.roots);assert.deepEqual(primary.newSeeds,revised.newSeeds);assert.deepEqual(holdout.excludedSeeds,[...new Set([...revised.excludedSeeds,...revised.newSeeds])]);
const oldReport=json('confirm-report.json'),finalReport=json('confirm-report-final.json');delete oldReport.independentConfirmationStarted;delete finalReport.independentConfirmationStarted;delete finalReport.independentConfirmationCompleted;assert.deepEqual(oldReport,finalReport);
const f=json('failure-case.json'),run=data.batches[0].runs[f.index],control=data.batches[0].runs[f.index-f.index%4],s=replay(run.commands.slice(0,f.commandIndex));assert.deepEqual(copy(s),f.state);
assert.deepEqual(run.commands.slice(0,f.commandIndex),control.commands.slice(0,f.commandIndex));assert.notDeepEqual(run.commands[f.commandIndex],control.commands[f.commandIndex]);
assert.deepEqual(copy(engines.baseline.C.board(s,()=>f.roll,'practice')),f.baselineChoice);assert.deepEqual(copy(engines.v2.C.board(s,()=>f.roll,'practice')),f.candidateChoice);
assert.deepEqual({winner:control.winner,plies:control.plies},f.control);assert.deepEqual({winner:run.winner,plies:run.plies},f.candidate);
let near=engines.baseline.C.rankedActions(s);near=near.filter(a=>Math.round(near[0].score*1e9)-Math.round(a.score*1e9)<=1200000000).slice(0,3);const mapped=engines.v3.C.boardChoices(s,near);assert.equal(mapped.length,near.length);
for(let i=0;i<near.length;i++){assert.equal(mapped[i].id,near[i].id);assert.equal(mapped[i].type,near[i].type);assert.equal(Math.round(mapped[i].score*1e9),Math.round(near[i].score*1e9));}
for(const suffix of ['v2','v3']){
  const performance=json('performance-'+suffix+'.json'),median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];assert(performance.passed);assert.equal(performance.rows.length,139);
  for(const row of performance.rows){assert.equal(median(row.samples.baseline),row.baselineMedian);assert.equal(median(row.samples.candidate),row.candidateMedian);assert.equal(Math.max(...row.samples.candidate),row.maximum);assert(row.passed&&row.candidateMedian<=50&&row.maximum<=100&&row.cold.candidate<=100);if(row.name.startsWith('opening-'))assert(row.candidateMedian-row.baselineMedian<=5);}
  const regression=json('regression-'+suffix+'.json');assert.equal(regression.length,58);assert(regression.every(r=>r.status===0));
}
const initial=json('regression.json');assert.equal(initial.length,58);assert.deepEqual(initial.filter(r=>r.status!==0).map(r=>r.name),['computer-score-precision.cjs']);
const specific=json('specific-v4.json');assert(specific.passed);assert.equal(specific.routeChecks,135);assert.equal(specific.poolChecks,24);assert.equal(specific.strictCases,12);assert.equal(specific.terminalCases,8);
assert.equal(totalCommands,128202);console.log(JSON.stringify({verified:true,games:384,commands:totalCommands,batches:summaries,candidateRejected:true,probabilityFailureRecomputed:true,allComputerDecisionsRecomputed:false,specificRegressionAndTimingRerun:false}));
