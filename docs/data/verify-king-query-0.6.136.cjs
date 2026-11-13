const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),bytes=fs.readFileSync(__dirname+'/king-query-0.6.136.json.gz');
assert.equal(hash(bytes),'70c81888da81d0e21e9d955e136e01821d8fd659bad1f01caa4eaaf45a464704');
const data=JSON.parse(zlib.gunzipSync(bytes)),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8'),scripts=s=>[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),copy=x=>JSON.parse(JSON.stringify(x));
assert.equal(hash(source),data.releaseSHA256,'请提供报告指定的0.6.136入口');assert.equal(hash(data.baselineHTML),data.baselineSHA256);assert.equal(scripts(source)[0],scripts(data.baselineHTML)[0]);assert.equal(scripts(source)[2].replaceAll('0.6.136','0.6.135'),scripts(data.baselineHTML)[2]);
function engine(html){const box=vm.createContext({});for(const script of scripts(html).slice(0,2))vm.runInContext(script,box);return {E:box.Yiwu,C:box.YiwuComputer};}
const before=engine(data.baselineHTML),after=engine(source);let board=0,plans=0;
for(const p of data.performance.node)for(const row of p.cases){
  const s=row.state,raw=JSON.stringify(s);
  if(s.phase==='board'){assert.deepEqual(copy(after.C.rankedActions(s)),copy(before.C.rankedActions(s)));board++;}
  else for(const side of ['red','black']){assert.deepEqual(copy(after.C.combatPlan(s,side)),copy(before.C.combatPlan(s,side)));plans++;}
  assert.equal(JSON.stringify(s),raw);
}
const median=x=>[...x].sort((a,b)=>a-b)[x.length>>1];let timings=0;
for(const p of [...data.performance.node,data.performance.edge])for(const row of p.rows){
  assert.equal(median(row.samples.baseline),row.baselineMedianMs);assert.equal(median(row.samples.candidate),row.candidateMedianMs);assert.equal(Math.max(...row.samples.candidate),row.candidateMaximumMs);
  assert(row.candidateMedianMs<=50&&row.candidateMaximumMs<=100);if(row.cold)assert(row.cold.candidate<=100);if(row.name.startsWith('opening-'))assert(row.candidateMedianMs-row.baselineMedianMs<=5);timings++;
}
const trial=data.trial;assert.equal(hash(trial.candidateHTML),trial.plan.candidateSHA256);assert.equal(hash(trial.driver),trial.plan.driverSHA256);assert.equal(trial.report.passed,false);assert.equal(trial.runs.length,128);
const seen=new Set(trial.plan.excludedSeeds),newSeeds=[];
for(const root of trial.plan.roots)for(const [side,key]of [['red','seedA'],['black','seedB']]){const value=crypto.createHash('sha256').update(`${trial.plan.seedLabel}:${root.difficulty}:${root.scenario}:${root.replicate}:${side}`).digest().readUInt32LE(0);assert.equal(root[key],value);assert(!seen.has(value));seen.add(value);newSeeds.push(value);}assert.deepEqual(newSeeds,trial.plan.newSeeds);
const rng=value=>()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};let commands=0,decisionGames=0,boardChoices=0,combatChoices=0;
for(const [index,run]of trial.runs.entries()){
  assert.deepEqual(run.input,trial.plan.inputs[index]);const model=engine(source),{E,C}=model,verify=index%4===0,random={[run.input.aSide]:rng(run.input.seedA),[E.OTHER[run.input.aSide]]:rng(run.input.seedB)};let s;
  for(const command of run.commands){const [op,...args]=command;
    if(verify&&s?.phase==='board'){
      const a=C.board(s,random[s.turn],run.input.difficulty),expected=a.type==='pass'?['pass']:a.type==='rest'?['rest',a.id,a.card]:['move',a.id,a.x,a.y];assert.deepEqual(command,copy(expected));boardChoices++;
    }else if(verify&&s?.phase==='duel'){
      const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),id=C.combat(s,a.side,random[a.side],run.input.difficulty);let expected=['retreat'];combatChoices++;
      if(id!=='retreat'){expected=['resolve',id,C.combat(s,d.side,random[d.side],run.input.difficulty)];combatChoices++;}assert.deepEqual(command,copy(expected));
    }
    if(op==='create'){assert(!s);s=E.create(...args);}else E[op](s,...args);commands++;
  }
  assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);if(verify)decisionGames++;
}
assert.equal(commands,trial.report.commands);assert.equal(decisionGames,32);assert.equal(boardChoices,data.traces.boardChoices);
for(const expected of trial.report.groups){const all=trial.runs.filter(r=>r.input.difficulty===expected.difficulty&&r.input.scenario===expected.scenario),baseline=all.filter(r=>r.input.models.red==='baseline'&&r.input.models.black==='baseline'),candidate=all.filter(r=>r.input.models.red==='candidate'&&r.input.models.black==='candidate'),direct=all.filter(r=>r.input.models.red!==r.input.models.black),mean=a=>a.reduce((n,r)=>n+r.plies,0)/a.length;
  const points=direct.reduce((n,r)=>n+(r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),0);assert.equal(points,expected.points);assert.equal(mean(baseline),expected.baselineMean);assert.equal(mean(candidate),expected.candidateMean);assert.equal(Math.max(...baseline.map(r=>r.plies)),expected.baselineMaximum);assert.equal(Math.max(...candidate.map(r=>r.plies)),expected.candidateMaximum);assert.equal(expected.passed,points>=8&&mean(candidate)<=mean(baseline)&&expected.candidateMaximum<=expected.baselineMaximum);
}
assert.equal(data.verification.existingScripts.length,56);assert(data.verification.existingScripts.every(r=>r.status===0));assert.equal(data.verification.finalUIFlows,143);
console.log(JSON.stringify({verified:true,boardQueries:board,combatPlans:plans,timingRows:timings,trialGames:128,commands,oldControlDecisionsRecomputed:decisionGames,boardChoices,combatChoices,strategyCandidateRejected:true}));
