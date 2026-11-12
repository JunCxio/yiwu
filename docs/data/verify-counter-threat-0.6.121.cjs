const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),file=name=>path.join(__dirname,name);
const bytes=fs.readFileSync(file('counter-threat-0.6.121.json'));assert.equal(hash(bytes),'468be2b1856a1efe61880bf674eaac73ecf53b48d7e5455eca397ad43cc9fb77');const data=JSON.parse(bytes);
const html=fs.readFileSync(process.argv[2]||file('../../index.html'),'utf8');assert.equal(hash(html),data.sourceSHA256,'请提供报告指定的0.6.121游戏入口');
const priorBytes=fs.readFileSync(file('king-rescue-0.6.119.json'));assert.equal(hash(priorBytes),data.priorDataSHA256);const prior=JSON.parse(priorBytes);
const scripts=h=>[...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),models={};
for(const [name,candidate]of Object.entries(data.candidates)){
  const {from,to}=candidate.patch;assert.equal(html.split(from).length,2);models[name]=html.replace(from,to);assert.equal(hash(models[name]),candidate.sourceSHA256);
  assert.equal(scripts(html)[0],scripts(models[name])[0]);assert.equal(scripts(html)[2],scripts(models[name])[2]);
}
function execute(source,candidate){
  const writes=new Map(),mockFs={readFileSync(name,encoding){let text;if(name==='github-release/index.html'||name.endsWith('/baseline.html'))text=html;else if(name.endsWith('/candidate.html')||name.endsWith('/candidate-fast.html'))text=candidate;else throw new Error('未声明的读取：'+name);return encoding?text:Buffer.from(text);},writeFileSync(name,content){assert(name.startsWith('/trial/'));assert(!writes.has(name));writes.set(name,String(content));}};
  const allowed={'node:fs':mockFs,'node:vm':vm,'node:assert/strict':assert,'../king-rescue-v06119/known.json':prior.known,'./probe.json':data.probe};
  vm.runInNewContext(source,{__dirname:'/trial',require(name){assert(Object.hasOwn(allowed,name),'未声明的模块：'+name);return allowed[name];},console:{log(){}}},{timeout:30000});return writes;
}
const probe=execute(data.probeSource,models.primary);assert.equal(probe.get('/trial/baseline.html'),html);assert.deepEqual(JSON.parse(probe.get('/trial/probe.json')),data.probe);
for(const [name,candidate]of Object.entries(data.candidates)){
  const writes=execute(candidate.targetedSource,models[name]),result=JSON.parse(writes.get(name==='primary'?'/trial/targeted.json':'/trial/targeted-fast.json'));assert.deepEqual(result,candidate.targeted);
  const perf=candidate.performance,limits=perf.limits;assert.deepEqual(limits,data.acceptance.performance);
  for(const row of perf.rows){const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];assert.equal(row.baselineMedianMs,median(row.samples.baseline));assert.equal(row.candidateMedianMs,median(row.samples.candidate));assert.equal(row.candidateMaximumMs,Math.max(...row.samples.candidate));}
  const passed=perf.rows.every(r=>r.candidateMedianMs<=limits.maxStateMedianMs&&r.candidateMaximumMs<=limits.maxSampleMs&&(!r.name.startsWith('opening-')||r.candidateMedianMs-r.baselineMedianMs<=limits.maxOpeningExtraMedianMs));assert.equal(passed,perf.passed);assert.equal(passed,false);
}
const plan=data.reservedPlan,excluded=new Set([...prior.plan.excludedSeeds,...prior.plan.newSeeds]);assert.deepEqual([...excluded].sort((a,b)=>a-b),plan.excludedSeeds);assert.equal(plan.priorSeedsChecked,excluded.size);assert.equal(plan.inputs.length,136);
const expected=prior.plan.inputs.map(old=>{const i=structuredClone(old);if(i.group!=='known')for(const side of ['red','black'])i[side==='red'?'seedA':'seedB']=crypto.createHash('sha256').update([plan.seedLabel,i.difficulty,i.group,i.scenario,i.replicate,side].join(':')).digest().readUInt32LE(0);return i;});assert.deepEqual(plan.inputs,expected);
const fresh=new Set(plan.inputs.filter(i=>i.group!=='known').flatMap(i=>[i.seedA,i.seedB]));assert.equal(fresh.size,64);assert([...fresh].every(n=>!excluded.has(n)));assert.deepEqual([...fresh].sort((a,b)=>a-b),plan.newSeeds);
assert.equal(data.regression.rows.length,45);assert(data.regression.rows.every(r=>r.passed&&r.status===0));assert.deepEqual(data.regression.adapted,[]);for(const row of data.regression.rows)assert.equal(hash(data.regressionLogs[row.name].text),data.regressionLogs[row.name].sha256);
assert(data.regressionLogs['test_selection.cjs'].text.includes('143 项界面流程'));assert.equal(data.decision.fullGamesStarted,0);assert.equal(data.decision.adopted,false);
console.log(JSON.stringify({sourceVerified:true,oldBoardStates:data.probe.reports.reduce((n,r)=>n+r.boardStates,0),targetedSettlementsEach:data.candidates.primary.targeted.actualSettlements,boundCasesEach:data.candidates.primary.targeted.boundCases,performanceFailedBoth:true,reservedSeeds:64,recordedRegressionScripts:45,fullGamesStarted:0,adopted:false}));
