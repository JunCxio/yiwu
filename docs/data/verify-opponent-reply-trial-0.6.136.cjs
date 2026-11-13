const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),bytes=fs.readFileSync(__dirname+'/opponent-reply-trial-0.6.136.json.gz');
assert.equal(hash(bytes),'706736e38269b1bc304effd634f5fda429d1ea5f840c6084a9588ce6ca8c207f');
const data=JSON.parse(zlib.gunzipSync(bytes)),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8');
assert.equal(hash(source),data.releaseSHA256,'请提供报告指定的0.6.136入口');assert.equal(hash(data.baselineHTML),data.baselineSHA256);assert.equal(source,data.baselineHTML);
function patched(scope){let html=data.baselineHTML;for(const {from,to}of scope.patches){assert.equal(html.split(from).length,2);html=html.replace(from,to);}assert.equal(hash(html),scope.candidateSHA256);return html;}
assert.equal(patched(data.scope),data.candidateHTML);for(const a of data.attempts)assert.equal(patched(a.scope),a.html);
function engine(html){const box=vm.createContext({});for(const m of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1].replace('return {actions,choices,','return {position,actions,choices,'),box);return {E:box.Yiwu,C:box.YiwuComputer};}
const baseline=engine(data.baselineHTML),candidate=engine(data.candidateHTML),key=a=>JSON.stringify([a.type,a.id,a.x,a.y,a.card]),units=a=>Math.round(a.score*1e9);
let rankings=0,pools=0,replaced=0,commands=0;
for(const [i,row]of data.verification.performance.rows.entries()){
 if(i%2)continue;const s=row.state,raw=JSON.stringify(s),ranked=copy(baseline.C.rankedActions(s));assert.deepEqual(copy(candidate.C.rankedActions(s)),ranked);rankings++;
 for(const difficulty of ['standard','practice']){
  let near=ranked.filter(a=>units(ranked[0])-units(a)<=(difficulty==='practice'?1200000000:60000000));if(difficulty==='practice')near=near.slice(0,3);
  const original=JSON.stringify(near),actual=copy(candidate.C.replyChoices(s,near)),values=new Map();assert.equal(actual.length,near.length);
  for(const a of near){
   if(a.type!=='move'||units(a)!==units(near[0])||baseline.E.at(s,a.x,a.y)||near.filter(b=>b.type==='move'&&b.id===a.id&&units(b)===units(a)&&!baseline.E.at(s,b.x,b.y)).length<2)continue;
   const next=copy(s);baseline.E.move(next,a.id,a.x,a.y);if(next.phase!=='board')continue;const replies=baseline.C.rankedActions(next);
   values.set(key(a),Math.round(baseline.C.position(next,next.turn)*1e9)+(replies.length?units(replies[0]):0));
  }
  for(let n=0;n<near.length;n++){
   const a=near[n],b=actual[n];assert.equal(a.id,b.id);assert.equal(a.type,b.type);assert.equal(units(a),units(b));assert(near.some(x=>key(x)===key(b)));
   if(values.has(key(a)))assert.equal(values.get(key(b)),Math.min(...near.filter(x=>x.id===a.id&&values.has(key(x))).map(x=>values.get(key(x)))));else assert.deepEqual(a,b);
   if(key(a)!==key(b))replaced++;
  }
  let calls=0;assert.deepEqual(copy(candidate.C.board(s,()=>{calls++;return .5;},difficulty)),actual[Math.floor(.5*actual.length)]);assert.equal(calls,1);assert.equal(JSON.stringify(near),original);pools++;
 }
 assert.equal(JSON.stringify(s),raw);
}
assert.equal(rankings,172);assert.equal(pools,344);assert.equal(replaced,47);
const plan=data.plan,seen=new Set(plan.excludedSeeds),newSeeds=[];assert.equal(plan.excludedSeeds.length,6428);assert.equal(hash(data.candidateHTML),plan.candidateSHA256);assert.equal(hash(data.scripts['driver.cjs']),plan.driverSHA256);assert.equal(hash(data.upstreamDriver),plan.upstreamDriverSHA256);
for(const root of plan.roots)for(const [side,name]of [['red','seedA'],['black','seedB']]){const value=crypto.createHash('sha256').update(`${plan.seedLabel}:${root.difficulty}:${root.scenario}:${root.replicate}:${side}`).digest().readUInt32LE(0);assert.equal(value,root[name]);assert(!seen.has(value));seen.add(value);newSeeds.push(value);}assert.deepEqual(newSeeds,plan.newSeeds);
assert.equal(data.runs.length,128);for(const [i,run]of data.runs.entries()){
 assert.deepEqual(run.input,plan.inputs[i]);assert(run.plies<plan.limits.maximumPlies);assert(run.commands.length<plan.limits.maximumCommands);
 for(const {E}of [baseline,candidate]){let s;const replay=()=>{for(const [op,...args]of run.commands)if(op==='create')s=E.create(...args);else E[op](s,...args);};if(E.query)E.query(replay);else replay();assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);}
 commands+=run.commands.length;
}
const groups=[];for(const expected of data.report.groups){
 const all=data.runs.filter(r=>r.input.difficulty===expected.difficulty&&r.input.scenario===expected.scenario),base=all.filter(r=>r.input.models.red==='baseline'&&r.input.models.black==='baseline'),cand=all.filter(r=>r.input.models.red==='candidate'&&r.input.models.black==='candidate'),direct=all.filter(r=>r.input.models.red!==r.input.models.black),mean=rs=>rs.reduce((n,r)=>n+r.plies,0)/rs.length;
 assert.equal(base.length,8);assert.equal(cand.length,8);assert.equal(direct.length,16);
 const points=direct.reduce((n,r)=>n+(r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),0),maxB=Math.max(...base.map(r=>r.plies)),maxC=Math.max(...cand.map(r=>r.plies));
 assert.equal(points,expected.points);assert.equal(mean(base),expected.baselineMean);assert.equal(mean(cand),expected.candidateMean);assert.equal(maxB,expected.baselineMaximum);assert.equal(maxC,expected.candidateMaximum);
 const passed=points>=plan.acceptance.perGroupDirectPointsAtLeast&&mean(cand)<=mean(base)&&maxC<=maxB;assert.equal(passed,expected.passed);groups.push(passed);
}
assert.equal(data.report.passed,false);assert(!groups.every(Boolean));assert.equal(commands,data.report.commands);assert.equal(data.report.independentConfirmationStarted,false);
const diagnosis=data.diagnosis;let changed=0,longer=0,shorter=0;
for(let i=0;i<data.runs.length;i+=4){const a=data.runs[i],b=data.runs[i+1];let n=0;while(n<Math.min(a.commands.length,b.commands.length)&&JSON.stringify(a.commands[n])===JSON.stringify(b.commands[n]))n++;if(n===a.commands.length&&n===b.commands.length)continue;const row=diagnosis.rows[changed++];assert.equal(row.firstDifferentCommand,n);assert.deepEqual(row.baselineMove,a.commands[n]);assert.deepEqual(row.candidateMove,b.commands[n]);let s;for(const [op,...args]of a.commands.slice(0,n))if(op==='create')s=baseline.E.create(...args);else baseline.E[op](s,...args);assert.deepEqual(copy(s),row.state);assert.equal(a.commands[n][1],b.commands[n][1]);for(const c of [a.commands[n],b.commands[n]]){assert.equal(c[0],'move');assert(!baseline.E.at(s,c[2],c[3]));}if(b.plies>a.plies)longer++;if(b.plies<a.plies)shorter++;}
assert.equal(changed,diagnosis.changedSelfPlayRoots);assert.equal(longer,diagnosis.longerSelfPlay);assert.equal(shorter,diagnosis.shorterSelfPlay);
const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];let timingRows=0;
for(const report of [data.verification.performance,...Object.values(data.performanceOnly).map(r=>r.performance)]){
 for(const row of report.rows){assert.equal(median(row.samples.baseline),row.baselineMedian);assert.equal(median(row.samples.candidate),row.candidateMedian);assert.equal(Math.max(...row.samples.candidate),row.maximum);const passed=row.candidateMedian<=50&&row.maximum<=100&&row.cold.candidate<=100&&(!row.name.startsWith('opening-')||row.candidateMedian-row.baselineMedian<=5);assert.equal(passed,row.passed);timingRows++;}assert(report.rows.every(r=>r.passed));
}
for(const perf of Object.values(data.performanceOnly)){assert.equal(perf.adopted,false);assert.equal(patched(perf.scope),perf.candidateHTML);}
assert.equal(data.verification.regression.length,58);assert(data.verification.regression.every(r=>r.status===0));
console.log(JSON.stringify({verified:true,rankings,pools,replaced,trialGames:128,commands,rulesReplayed:2,changedSelfPlayRoots:changed,longerSelfPlay:longer,shorterSelfPlay:shorter,timingRows,allCandidatesRejected:true,releaseUnchanged:true}));
