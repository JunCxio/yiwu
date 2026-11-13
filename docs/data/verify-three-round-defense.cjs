const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),bytes=fs.readFileSync(__dirname+'/three-round-defense-0.6.135.json.gz');
assert.equal(hash(bytes),'d680e501f117a0e2ac7268a41f38afd0fcab14ef1f9db6d129a1fab0c0f13856');
const data=JSON.parse(zlib.gunzipSync(bytes)),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8'),scripts=s=>[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(data.version,'0.6.135');assert.equal(hash(source),data.releaseSHA256,'请提供报告指定的0.6.135入口');assert.equal(hash(data.baselineHTML),data.baselineSHA256);
assert.equal(hash(source.replaceAll('0.6.135','0.6.134').replace('0.6.134 · 三轮取将防线','0.6.134 · 电脑查询提速')),data.frozenCandidateSHA256);
assert.equal(scripts(source)[0],scripts(data.baselineHTML)[0]);assert.equal(scripts(source)[0],scripts(data.rejectedCandidateHTML)[0]);
const box=vm.createContext({});vm.runInContext(scripts(source)[0],box);const E=box.Yiwu;let games=0,commands=0;
for(const [batchIndex,batch]of data.batches.entries()){
  const {plan,runs,report}=batch,seen=new Set(plan.excludedSeeds),newSeeds=[];
  assert.equal(plan.roots.length,32);assert.equal(runs.length,128);assert.equal(plan.inputs.length,128);
  assert.equal(plan.baselineSHA256,data.baselineSHA256);assert.equal(plan.candidateSHA256,batchIndex===0?hash(data.rejectedCandidateHTML):data.frozenCandidateSHA256);
  for(const root of plan.roots)for(const [side,key]of [['red','seedA'],['black','seedB']]){
    const value=crypto.createHash('sha256').update(`${plan.seedLabel}:${root.difficulty}:${root.scenario}:${root.replicate}:${side}`).digest().readUInt32LE(0);
    assert.equal(root[key],value);assert(!seen.has(value));seen.add(value);newSeeds.push(value);
  }
  assert.deepEqual(plan.newSeeds,newSeeds);
  for(const [i,run]of runs.entries()){
    assert.deepEqual(run.input,plan.inputs[i]);let state;
    for(const [op,...args]of run.commands){if(op==='create'){assert(!state);state=E.create(...args);}else E[op](state,...args);commands++;}
    assert.equal(state.phase,'ended');assert.equal(state.winner,run.winner);assert.equal(state.reason,run.reason);assert.equal(state.ply,run.plies);assert.equal(hash(JSON.stringify(state)),run.terminalSHA256);
    assert.equal(run.moves+run.rests+run.passes+run.battles,run.plies);games++;
  }
  const groups=[];
  for(const difficulty of ['standard','practice'])for(const scenario of ['quick','full']){
    const all=runs.filter(r=>r.input.difficulty===difficulty&&r.input.scenario===scenario),baseline=all.filter(r=>r.input.models.red==='baseline'&&r.input.models.black==='baseline'),candidate=all.filter(r=>r.input.models.red==='candidate'&&r.input.models.black==='candidate'),direct=all.filter(r=>r.input.models.red!==r.input.models.black),mean=a=>a.reduce((n,r)=>n+r.plies,0)/a.length;
    assert.equal(all.length,32);assert.equal(baseline.length,8);assert.equal(candidate.length,8);assert.equal(direct.length,16);
    const row={difficulty,scenario,points:direct.reduce((n,r)=>n+(r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),0),directGames:direct.length,baselineMean:mean(baseline),candidateMean:mean(candidate),baselineMaximum:Math.max(...baseline.map(r=>r.plies)),candidateMaximum:Math.max(...candidate.map(r=>r.plies)),changedSelfGames:candidate.filter((r,i)=>JSON.stringify(r.commands)!==JSON.stringify(baseline[i].commands)).length};
    row.passed=row.points>=8&&row.candidateMean<=row.baselineMean&&row.candidateMaximum<=row.baselineMaximum;groups.push(row);
  }
  assert.deepEqual(groups,report.groups);assert.equal(report.passed,groups.every(r=>r.passed));assert.equal(report.passed,batchIndex!==0);assert(report.allCommandsReplayed);
  assert.equal(report.commands,runs.reduce((n,r)=>n+r.commands.length,0));
}
const primary=data.batches[1].plan,confirmation=data.batches[2].plan;
assert.deepEqual(primary.inputs,data.batches[0].plan.inputs);assert.deepEqual(primary.newSeeds,data.batches[0].plan.newSeeds);
assert.deepEqual(confirmation.excludedSeeds,[...new Set([...primary.excludedSeeds,...primary.newSeeds])]);assert.equal(confirmation.excludedSeeds.length,5852);
const median=a=>[...a].sort((x,y)=>x-y)[a.length>>1];
for(const row of data.performance.rows){
  assert.equal(median(row.samples.candidate),row.candidateMedianMs);assert.equal(Math.max(...row.samples.candidate),row.candidateMaximumMs);
  assert(row.candidateMedianMs<=50&&row.candidateMaximumMs<=100&&row.cold.candidate<=100);
  if(row.name.startsWith('opening-'))assert(row.candidateMedianMs-row.baselineMedianMs<=5);
}
assert.equal(data.performance.rows.length,119);assert(data.review.independentConfirmationCompleted);assert.equal(data.approval.scope.length,3);
console.log(JSON.stringify({verified:true,games,commands,initialCandidateRejected:true,correctedPrimaryAndIndependentPassed:true,performanceSamplesVerified:119,computerDecisionsRecomputed:false}));
