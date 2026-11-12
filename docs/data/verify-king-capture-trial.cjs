const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
const bytes=fs.readFileSync(path.join(__dirname,'king-capture-trial-0.6.132.json'));assert.equal(hash(bytes),'9eea804f848eacb0c0af8f33d40901368f0e2dcdd14958975c719d4767bca38e');const data=JSON.parse(bytes);
const sourcePath=path.resolve(process.argv[2]||path.join(__dirname,'../../index.html')),source=fs.readFileSync(sourcePath,'utf8');assert.equal(hash(source),data.scope.baselineSHA256,'请提供报告指定的0.6.132入口');
let candidate=source;for(const [before,after]of data.scope.patches){assert.equal(candidate.split(before).length,2);candidate=candidate.replace(before,after);}assert.equal(hash(candidate),data.scope.candidateSHA256);
const scripts=html=>[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts(source)[0],scripts(candidate)[0]);
function model(html){const box=vm.createContext({});for(const script of scripts(html).slice(0,2))vm.runInContext(script,box);return {E:box.Yiwu,C:box.YiwuComputer};}
for(const [field,name]of [['driverSHA256','driver'],['workerSHA256','worker'],['runnerSHA256','runner'],['sharedDriverSHA256','shared'],['engineDriverSHA256','engine']])assert.equal(hash(data.sources[name]),data.plan[field]);
const priorBytes=fs.readFileSync(path.join(__dirname,'balance-0.6.129.json')),rescueBytes=fs.readFileSync(path.join(__dirname,'combat-rescue-0.6.131.json'));assert.equal(hash(priorBytes),data.priorDataSHA256);assert.equal(hash(rescueBytes),data.rescueDataSHA256);const prior=JSON.parse(priorBytes),conditional=JSON.parse(JSON.parse(rescueBytes).conditional.planSource),excluded=new Set();
function collect(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='excludedSeeds')item.forEach(seed=>excluded.add(seed));if(['seed','seedA','seedB'].includes(key)&&Number.isInteger(item))excluded.add(item);collect(item);}}
collect(prior.plan);collect(prior.diagnostics.plan);prior.reports.forEach(r=>r.runs.forEach(run=>collect(run.input)));prior.diagnostics.runs.forEach(run=>collect(run.input));conditional.newRoots.forEach(r=>{excluded.add(r.red);excluded.add(r.black);});assert.equal(excluded.size,5532);assert.deepEqual([...excluded].sort((a,b)=>a-b),data.plan.excludedSeeds);
const fresh=new Set(),roots=new Map();assert.equal(data.plan.inputs.length,136);
for(const i of data.plan.inputs.filter(i=>i.group==='primary')){for(const role of ['A','B']){const value=crypto.createHash('sha256').update([data.plan.seedLabel,i.difficulty,i.scenario,i.replicate,role].join(':')).digest().readUInt32LE(0);assert.equal(i['seed'+role],value);assert(!excluded.has(value));fresh.add(value);}const key=JSON.stringify([i.difficulty,i.scenario,i.replicate]),rows=roots.get(key)||[];rows.push(i.models);roots.set(key,rows);}
assert.equal(fresh.size,64);assert.equal(roots.size,32);assert.deepEqual([...fresh].sort((a,b)=>a-b),data.plan.newSeeds);for(const rows of roots.values())assert.deepEqual(rows.map(x=>x.red+':'+x.black).sort(),['baseline:baseline','baseline:candidate','candidate:baseline','candidate:candidate']);
assert.equal(data.processes.length,2);const finished=data.processes.flatMap(p=>{assert(p.completed&&!p.errors.length);assert.deepEqual(p.finished,p.planned);return p.finished;});assert.equal(finished.length,136);assert.equal(new Set(finished).size,136);
const all=data.plan.inputs.map(i=>{const found=data.reports.flatMap(r=>r.runs).filter(r=>JSON.stringify(r.input)===JSON.stringify(i));assert.equal(found.length,1);return found[0];});
for(const run of all)if(run.input.group==='known'&&run.input.models.red==='baseline'){const old=data.known[run.input.priorIndex];assert.deepEqual(run.commands,old.commands);assert.equal(run.terminalSHA256,old.terminalSHA256);assert.deepEqual(run.pieceActivity,old.pieceActivity);}
const comparisons=[];for(const [index,run]of all.entries())if(Object.values(run.input.models).includes('candidate')){const baselineIndex=all.findIndex(r=>r.input.models.red==='baseline'&&r.input.models.black==='baseline'&&JSON.stringify({...r.input,models:null})===JSON.stringify({...run.input,models:null}));assert(baselineIndex>=0);const before=all[baselineIndex].commands,after=run.commands;let prefix=0;while(prefix<before.length&&prefix<after.length&&JSON.stringify(before[prefix])===JSON.stringify(after[prefix]))prefix++;comparisons.push({index,baselineIndex,identical:prefix===before.length&&prefix===after.length,commonPrefixCommands:prefix,baselineCommand:before[prefix]||null,candidateCommand:after[prefix]||null});}assert.deepEqual(comparisons,data.traceComparisons);assert.equal(comparisons.length,100);assert.equal(comparisons.filter(r=>!r.identical).length,4);
const groupSummaries={};for(const difficulty of ['standard','practice'])for(const mode of ['quick','full']){
  const rows=all.filter(r=>r.input.group==='primary'&&r.input.difficulty===difficulty&&r.input.scenario===mode),direct=rows.filter(r=>r.input.models.red!==r.input.models.black),points=direct.map(r=>r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),summary={direct:{games:points.length,wins:points.filter(p=>p===1).length,draws:points.filter(p=>p===.5).length,losses:points.filter(p=>p===0).length,points:points.reduce((a,b)=>a+b,0)}};
  for(const model of ['baseline','candidate']){const self=rows.filter(r=>r.input.models.red===model&&r.input.models.black===model),plies=self.map(r=>r.plies).sort((a,b)=>a-b);summary[model]={games:self.length,meanPlies:plies.reduce((a,b)=>a+b,0)/plies.length,medianPlies:(plies[(plies.length-1)>>1]+plies[plies.length>>1])/2,maxPlies:plies.at(-1),draws:self.filter(r=>r.winner==='draw').length,singleDamageWins:self.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1).length};}
  summary.passedGates=summary.direct.points>=8&&summary.candidate.meanPlies<=summary.baseline.meanPlies&&summary.candidate.maxPlies<=summary.baseline.maxPlies;assert.deepEqual(summary,data.summary[difficulty+'-'+mode]);groupSummaries[difficulty+'-'+mode]=summary;
}
assert.deepEqual(Object.keys(groupSummaries).filter(k=>!groupSummaries[k].passedGates),data.decision.failedGates);assert.deepEqual(data.decision.failedGates,['practice-quick']);assert.equal(data.decision.adopted,false);assert.equal(data.decision.independentFollowupStarted,false);assert.equal(data.productionChanged,false);
assert.equal(data.regressions.length,54);assert(data.regressions.every(r=>r.status===0));assert(data.performance.passed);assert.equal(data.performance.rows.length,22);
for(const row of data.performance.rows){const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1];assert.equal(row.samples.baseline.length,11);assert.equal(row.samples.candidate.length,11);assert.equal(row.baselineMedianMs,median(row.samples.baseline));assert.equal(row.candidateMedianMs,median(row.samples.candidate));assert.equal(row.candidateMaximumMs,Math.max(...row.samples.candidate));assert(row.candidateMedianMs<=50&&row.candidateMaximumMs<=100&&(!row.name.startsWith('opening-')||row.candidateMedianMs-row.baselineMedianMs<=5));}
function diagnostics(){
  const priorRuns=data.known,probeWrites=new Map();
  function run(name,files,modules){
    const writes=new Map(),mockFs={readFileSync(file,encoding){assert(Object.hasOwn(files,file),'未声明读取：'+file);const value=files[file];return encoding?String(value):Buffer.from(value);},writeFileSync(file,value){assert(file.startsWith('/audit/')&&!writes.has(file));writes.set(file,JSON.parse(value));}};
    const builtin={'node:fs':mockFs,'node:vm':vm,'node:assert/strict':assert,'node:crypto':crypto};vm.runInNewContext(data.sources[name],{__dirname:'/audit',require(key){if(Object.hasOwn(builtin,key))return builtin[key];assert(Object.hasOwn(modules,key),'未声明模块：'+key);return modules[key];},console:{log(){}}});assert.equal(writes.size,1);return [...writes.values()][0];
  }
  const quiet=run('quiet',{'github-release/index.html':source},{'../king-threat-query-v06132/replay-inputs.json':priorRuns});assert.deepEqual(quiet.reports.map(r=>r.summary),data.quietSummaries);
  const probe=run('probe',{'github-release/index.html':source},{'../../github-release/docs/data/balance-0.6.129.json':prior});assert.deepEqual(probe.summary,data.probeSummary);assert.deepEqual(probe.rows.filter(r=>r.plans.every(p=>p.rounds===2)).slice(0,8),data.fixtures.cases);
  const targeted=run('targeted',{'/audit/candidate.html':candidate},{'./fixtures.json':data.fixtures});assert.deepEqual(targeted,data.targeted);
  const engine={engine(file){assert(['work/king-capture-v06132/baseline.html','work/king-capture-v06132/candidate.html'].includes(file));return model(file.endsWith('/baseline.html')?source:candidate);}};
  const decisions=run('decisions',{}, {'../pace_v0672.cjs':engine,'../quiet-tail-v06132/king-capture-probe.json':probe});assert.deepEqual(decisions,data.decisions);
  const runModules=Object.fromEntries(all.map((r,i)=>['./run-'+i+'.json',r]));const differences=run('differences',{}, {'../pace_v0672.cjs':engine,'./summary.json':{traceComparisons:data.traceComparisons},...runModules});assert.deepEqual(differences,data.differences);return {probeGames:probe.summary.games,diagnosticStates:targeted.states,settlements:targeted.settlements};
}
if(process.argv[3]===undefined){
  const checked=diagnostics(),totals={games:0,commands:0,boardChoices:0,combatChoices:0,rounds:0};
  Promise.all([0,1].map(shard=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[__filename,sourcePath,String(shard)]),out=[];child.stdout.on('data',chunk=>{out.push(chunk);process.stdout.write(chunk);});child.stderr.on('data',chunk=>process.stderr.write(chunk));child.on('error',reject);child.on('exit',code=>{if(code!==0)return reject(Error('复核子进程失败：'+code));resolve(JSON.parse(Buffer.concat(out).toString().trim().split('\n').at(-1)));});}))).then(rows=>{for(const row of rows)for(const key of Object.keys(totals))totals[key]+=row[key];assert.deepEqual(totals,data.totals);console.log(JSON.stringify({...totals,...checked,allChoicesRecomputed:true,allTerminalHashesMatch:true,adopted:false}));}).catch(e=>{console.error(e);process.exitCode=1;});
}else{
  const shard=Number(process.argv[3]);assert(Number.isInteger(shard)&&shard>=0&&shard<2);
  const models={baseline:model(source),candidate:model(candidate)},E=models.baseline.E,random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function setup(s,side,style,variant){
    if(style==='default'){E.auto(s,side,true);return;}
    const ps=s.pieces.filter(p=>p.side===side).sort((a,b)=>side==='red'?a.x-b.x:b.x-a.x),kinds=style==='defense'?['pawn','guard','elephant','horse','cannon','rook','king']:['rook','horse','cannon','pawn','guard','elephant','king'];
    let order=ps.filter(p=>p.kind!=='king').sort((a,b)=>kinds.indexOf(a.kind)-kinds.indexOf(b.kind));if(style==='mixed')order=['rook','pawn','guard','horse','cannon','elephant'].map(kind=>ps.find(p=>p.kind===kind));
    for(let i=0;i<order.length&&s.budget[side];i++){const p=order[i],ids=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind);for(const n of style==='spread'?[(i+variant)%3]:[[0,1],[0,2],[1,2]][variant])if(s.budget[side])E.learn(s,p.id,ids[n]);}
  }
  const totals={games:0,commands:0,boardChoices:0,combatChoices:0,rounds:0},runs=data.reports.find(r=>r.shard===shard).runs;
  for(const run of runs){
    const {input}=run,expected=E.create(input.scenario);setup(expected,input.aSide,input.style,input.aVariant);setup(expected,E.OTHER[input.aSide],input.comparator,input.bVariant);assert.equal(expected.budget.red,0);assert.equal(expected.budget.black,0);assert(expected.pieces.every(p=>p.hp===18&&p.learned.length<=2&&!p.exhausted.length));E.start(expected);
    const streams={[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)},controller=side=>models[input.models[side]].C,stats={moves:0,rests:0,passes:0,battles:0,rounds:0,retreats:0,reversals:0},last=new Map();let s,activity;
    for(const [op,...args]of run.commands){
      totals.commands++;if(op==='create'){assert(!s);s=E.create(...args);continue;}
      if(op==='start')activity=Object.fromEntries(s.pieces.map(p=>[p.id,{side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));
      if(['pass','rest','move'].includes(op)){
        assert.equal(s.phase,'board');const before=JSON.stringify(s),a=controller(s.turn).board(s,streams[s.turn],input.difficulty);totals.boardChoices++;assert.equal(JSON.stringify(s),before);assert.deepEqual([a.type,...(a.type==='move'?[a.id,a.x,a.y]:a.type==='rest'?[a.id,a.card]:[])],[op,...args]);
        if(op==='pass')stats.passes++;else if(op==='rest'){stats.rests++;activity[args[0]].rests++;}else{const p=E.get(s,args[0]),d=E.at(s,args[1],args[2]);if(d){stats.battles++;activity[p.id].attacks++;activity[d.id].defenses++;last.delete(p.id);}else{stats.moves++;activity[p.id].moves++;const previous=last.get(p.id);if(previous&&previous[0]===args[1]&&previous[1]===args[2])stats.reversals++;last.set(p.id,[p.x,p.y]);}}
      }
      if(op==='retreat'||op==='resolve'){
        assert.equal(s.phase,'duel');const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),before=JSON.stringify(s),aId=controller(a.side).combat(s,a.side,streams[a.side],input.difficulty);totals.combatChoices++;
        if(op==='retreat'){assert.equal(aId,'retreat');stats.retreats++;}else{
          const dId=controller(d.side).combat(s,d.side,streams[d.side],input.difficulty);totals.combatChoices++;assert.deepEqual([aId,dId],args);assert(!E.availability(s,a,aId,s.duel));assert(!E.availability(s,d,dId,s.duel));stats.rounds++;totals.rounds++;
          const damage=E.roundDamage(s.duel,...args);activity[a.id].damage+=Math.min(d.hp,damage.toD);activity[d.id].damage+=Math.min(a.hp,damage.toA);if(damage.toD>=d.hp)activity[a.id].captures++;if(damage.toA>=a.hp)activity[d.id].captures++;if(E.CARDS[aId])activity[a.id].cardUses++;if(E.CARDS[dId])activity[d.id].cardUses++;
        }
        assert.equal(JSON.stringify(s),before);
      }
      E[op](s,...args);if(op==='start')assert.equal(JSON.stringify(s),JSON.stringify(expected));
    }
    assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);for(const [key,value]of Object.entries(stats))assert.equal(value,run[key]);totals.games++;
    if(totals.games%6===0)console.log(JSON.stringify({shard,...totals}));
  }
  assert.equal(totals.games,68);console.log(JSON.stringify({shard,...totals,allChoicesRecomputed:true,allTerminalHashesMatch:true}));
}
