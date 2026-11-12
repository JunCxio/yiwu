const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const bytes=fs.readFileSync(path.join(__dirname,'horse-distance-0.6.123.json'));assert.equal(hash(bytes),'deb8e677f92c5da7a0ee86db7ac0f51af84713c5b9d8a02eb01b55c4f2e6cd71');const data=JSON.parse(bytes);
const sourcePath=path.resolve(process.argv[2]||path.join(__dirname,'../../index.html')),source=fs.readFileSync(sourcePath,'utf8');assert.equal(hash(source),data.scope.sourceSHA256.baseline,'请提供报告指定的0.6.123入口');
let candidate=source;for(const patch of data.scope.patches){assert.equal(candidate.split(patch.from).length,2);candidate=candidate.replace(patch.from,patch.to);}assert.equal(hash(candidate),data.scope.sourceSHA256.candidate);
const scripts=html=>[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts(source)[0],scripts(candidate)[0]);assert.equal(scripts(source)[2],scripts(candidate)[2]);
assert.equal(hash(data.driverSource),data.plan.driverSHA256);assert.equal(data.plan.inputs.length,136);assert.equal(new Set(data.plan.inputs.map(i=>JSON.stringify(i))).size,136);assert(data.plan.inputs.every(i=>!i.force&&!i.relocate));
const priorBytes=fs.readFileSync(path.join(__dirname,'counter-cost-0.6.122.json'));assert.equal(hash(priorBytes),'fd8160ee6da0866c14ce55ebc4312ef4fc7828abc87a382051108b29de388513');const prior=JSON.parse(priorBytes).plan;
const excluded=new Set([...prior.excludedSeeds,...prior.newSeeds]),fresh=new Set(data.plan.inputs.filter(i=>i.group!=='known').flatMap(i=>[i.seedA,i.seedB]));assert.equal(excluded.size,3500);assert.deepEqual([...excluded].sort((a,b)=>a-b),data.plan.excludedSeeds);assert.equal(fresh.size,64);assert([...fresh].every(n=>!excluded.has(n)));assert.deepEqual([...fresh].sort((a,b)=>a-b),data.plan.newSeeds);
const roots=new Map();for(const i of data.plan.inputs.filter(i=>i.group!=='known')){for(const [side,key]of [['red','seedA'],['black','seedB']])assert.equal(i[key],crypto.createHash('sha256').update([data.plan.seedLabel,i.difficulty,i.group,i.scenario,i.replicate,side].join(':')).digest().readUInt32LE(0));const key=JSON.stringify([i.difficulty,i.group,i.scenario,i.replicate]),rows=roots.get(key)||[];rows.push(i.models);roots.set(key,rows);}
assert.equal(roots.size,32);for(const rows of roots.values())assert.deepEqual(rows.map(x=>x.red+':'+x.black).sort(),['baseline:baseline','baseline:candidate','candidate:baseline','candidate:candidate']);
const completed=data.processes.flatMap(p=>{assert(p.completed&&!p.errors.length);assert.deepEqual(p.finished,p.planned);return p.finished;});assert.equal(completed.length,136);assert.equal(new Set(completed).size,136);
const all=data.reports.flatMap(r=>{assert(r.completed&&!r.errors.length&&r.runs.length===68);return r.runs;}),remaining=new Set(data.plan.inputs.map(i=>JSON.stringify(i)));
for(const run of all){assert(remaining.delete(JSON.stringify(run.input)));if(run.input.group==='known'&&run.input.models.red==='baseline'){const old=data.known[run.input.priorIndex];assert.deepEqual(run.commands,old.commands);assert.equal(run.terminalSHA256,old.terminalSHA256);assert.deepEqual(run.pieceActivity,old.pieceActivity);}}assert.equal(remaining.size,0);
const comparisons=[];for(let index=0;index<data.plan.inputs.length;index++){
  const input=data.plan.inputs[index];if(!Object.values(input.models).includes('candidate'))continue;
  const baselineIndex=data.plan.inputs.findIndex(i=>i.models.red==='baseline'&&i.models.black==='baseline'&&JSON.stringify({...i,models:null})===JSON.stringify({...input,models:null}));assert(baselineIndex>=0);
  const before=all.find(r=>JSON.stringify(r.input)===JSON.stringify(data.plan.inputs[baselineIndex])).commands,after=all.find(r=>JSON.stringify(r.input)===JSON.stringify(input)).commands;
  let prefix=0;while(prefix<before.length&&prefix<after.length&&JSON.stringify(before[prefix])===JSON.stringify(after[prefix]))prefix++;
  comparisons.push({index,baselineIndex,identical:prefix===before.length&&prefix===after.length,commonPrefixCommands:prefix,baselineCommand:before[prefix]??null,candidateCommand:after[prefix]??null});
}assert.equal(comparisons.length,100);assert.deepEqual(comparisons,data.traceComparisons);assert.equal(comparisons.filter(r=>!r.identical).length,data.decision.changedTraceComparisons);

for(const difficulty of ['standard','practice'])for(const mode of ['quick','full']){
  const rows=all.filter(r=>r.input.group!=='known'&&r.input.difficulty===difficulty&&r.input.scenario===mode),direct=rows.filter(r=>r.input.models.red!==r.input.models.black),points=direct.map(r=>r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),summary={direct:{games:points.length,wins:points.filter(p=>p===1).length,draws:points.filter(p=>p===.5).length,losses:points.filter(p=>p===0).length,points:points.reduce((a,b)=>a+b,0)}};
  for(const model of ['baseline','candidate']){const self=rows.filter(r=>r.input.models.red===model&&r.input.models.black===model),plies=self.map(r=>r.plies).sort((a,b)=>a-b);summary[model]={games:self.length,meanPlies:plies.reduce((a,b)=>a+b,0)/plies.length,medianPlies:(plies[(plies.length-1)>>1]+plies[plies.length>>1])/2,maxPlies:plies.at(-1),draws:self.filter(r=>r.winner==='draw').length,singleDamageWins:self.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1).length};}
  summary.passedGates=summary.direct.points>=summary.direct.games/2&&summary.candidate.meanPlies<=summary.baseline.meanPlies&&summary.candidate.maxPlies<=summary.baseline.maxPlies;assert.deepEqual(summary,data.summary[difficulty+'-'+mode]);
}
assert.deepEqual(data.decision.failedGates,Object.entries(data.summary).filter(([,r])=>!r.passedGates).map(([key])=>key));assert(data.decision.failedGates.length>0);assert.equal(data.decision.adopted,false);assert.equal(data.decision.independentFollowupStarted,false);
assert.equal(data.regression.rows.length,46);assert(data.regression.rows.every(r=>r.passed&&r.status===0));assert.equal(data.scope.productionChanged,false);
assert.deepEqual(data.scope.acceptance.performance,{maxStateMedianMs:50,maxSampleMs:100,maxOpeningExtraMedianMs:5});assert(data.performance.passed);assert.equal(data.performance.rows.length,11);
for(const row of data.performance.rows){const median=xs=>xs.toSorted((a,b)=>a-b)[xs.length>>1];assert.equal(row.samples.baseline.length,11);assert.equal(row.samples.candidate.length,11);assert.equal(row.baselineMedianMs,median(row.samples.baseline));assert.equal(row.candidateMedianMs,median(row.samples.candidate));assert.equal(row.candidateMaximumMs,Math.max(...row.samples.candidate));assert(row.candidateMedianMs<=50&&row.candidateMaximumMs<=100&&(!row.name.startsWith('opening-')||row.candidateMedianMs-row.baselineMedianMs<=5));}
function model(html){const box=vm.createContext({});for(const [i,script]of scripts(html).slice(0,2).entries())vm.runInContext(i===1?script.replace("return {actions,","return {horseDistances:typeof horseDistances==='undefined'?null:horseDistances,actions,"):script,box);return {E:box.Yiwu,C:box.YiwuComputer};}
function targeted(){
  const baselineModel=model(source),candidateModel=model(candidate),E=baselineModel.E,C=candidateModel.C;
  let first=source;for(const patch of data.firstAttempt.scope.patches){assert.equal(first.split(patch.from).length,2);first=first.replace(patch.from,patch.to);}assert.equal(hash(first),data.firstAttempt.scope.sourceSHA256.candidate);
  assert.equal(JSON.stringify(model(first).C.horseDistances),JSON.stringify(C.horseDistances));assert.equal(data.firstAttempt.primaryPlanCreated,false);
  const median=xs=>xs.toSorted((a,b)=>a-b)[xs.length>>1];
  for(const row of [data.firstAttempt.targeted.initialization,data.targeted.initialization]){assert.equal(row.samples.baseline.length,11);assert.equal(row.samples.candidate.length,11);assert.equal(row.baselineMedianMs,median(row.samples.baseline));assert.equal(row.candidateMedianMs,median(row.samples.candidate));assert.equal(row.candidateMaximumMs,Math.max(...row.samples.candidate));}
  assert(data.firstAttempt.targeted.initialization.candidateMedianMs>data.scope.acceptance.initialization.maxMedianMs);
  assert(data.targeted.initialization.candidateMedianMs<=data.scope.acceptance.initialization.maxMedianMs);assert(data.targeted.initialization.candidateMaximumMs<=data.scope.acceptance.initialization.maxSampleMs);
  let pairs=0;for(let origin=0;origin<90;origin++){
    const dist=Array(90).fill(Infinity),queue=[origin];dist[origin]=0;
    for(let i=0;i<queue.length;i++){const p=E.piece('p','red','horse',queue[i]%9,Math.floor(queue[i]/9));for(const m of E.moves({pieces:[p]},p)){const k=m.y*9+m.x;if(!Number.isFinite(dist[k])){dist[k]=dist[queue[i]]+1;queue.push(k);}}}
    assert.equal(queue.length,90);for(let target=0;target<90;target++){assert.equal(C.horseDistances[origin][target],dist[target]);assert.equal(C.horseDistances[origin][target],C.horseDistances[89-origin][89-target]);assert.equal(C.horseDistances[origin][target],C.horseDistances[target][origin]);pairs++;}
  }
  assert.equal(pairs,8100);assert.equal(data.targeted.checkedPairs,pairs);assert.equal(Math.max(...C.horseDistances.flat()),data.targeted.maxDistance);
  const previous=JSON.parse(priorBytes),games=previous.reports.flatMap(r=>r.runs).filter(r=>r.input.models.red==='baseline'&&r.input.models.black==='baseline'),models={baseline:baselineModel,candidate:candidateModel},rows=[];
  for(const [index,game]of games.entries()){
    let s;for(const [commandIndex,[op,...args]]of game.commands.entries()){
      if(op==='create'){s=E.create(...args);continue;}
      if(s.phase==='board'&&[20,40,60,79].includes(s.quiet)&&s.pieces.some(p=>p.kind==='horse')){
        const before=JSON.stringify(s),ranked=Object.fromEntries(Object.entries(models).map(([name,m])=>[name,m.C.rankedActions(s)])),selected=Object.fromEntries(Object.entries(models).map(([name,m])=>[name,m.C.board(s,()=>.25,game.input.difficulty)])),command=a=>a.type==='rest'?[a.type,a.id,a.card]:[a.type,a.id,a.x,a.y];
        assert(Object.values(ranked).every(r=>r.every(a=>Number.isFinite(a.score))));assert.equal(JSON.stringify(s),before);rows.push({index,ply:s.ply+1,commandIndex,input:game.input,selected,selectionChanged:JSON.stringify(command(selected.baseline))!==JSON.stringify(command(selected.candidate)),top:{baseline:ranked.baseline.slice(0,3),candidate:ranked.candidate.slice(0,3)}});
      }
      E[op](s,...args);
    }assert.equal(hash(JSON.stringify(s)),game.terminalSHA256);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(rows)),data.targeted.rows);assert.equal(rows.length,data.targeted.sampledStates);assert.equal(rows.filter(r=>r.selectionChanged).length,data.targeted.changedSelections);
  const writes=new Map(),mockFs={readFileSync(name){if(name==='github-release/index.html')return Buffer.from(source);if(name==='github-release/docs/data/counter-cost-0.6.122.json')return priorBytes;throw Error('未声明的读取：'+name);},writeFileSync(name,text){assert.equal(name,'/audit/audit.json');assert(!writes.has(name));writes.set(name,text);}};
  const allowed={'node:fs':mockFs,'node:assert/strict':assert,'node:crypto':crypto,'../pace_v0672.cjs':{engine(name){assert.equal(name,'github-release/index.html');return model(source);}}};
  vm.runInNewContext(data.routeAuditSource,{__dirname:'/audit',require(name){assert(Object.hasOwn(allowed,name));return allowed[name];},console:{log(){}}},{timeout:30000});assert.deepEqual(JSON.parse(writes.get('/audit/audit.json')),data.routeAudit);
  return pairs;
}
if(process.argv[3]===undefined){
  const distancePairs=targeted(),totals={games:0,commands:0,boardChoices:0,combatChoices:0,rounds:0};
  for(let shard=0;shard<2;shard++){const run=spawnSync(process.execPath,[__filename,sourcePath,String(shard)],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(run.status,0,run.stderr);process.stdout.write(run.stdout);const row=JSON.parse(run.stdout.trim().split('\n').at(-1));for(const key of Object.keys(totals))totals[key]+=row[key];}
  for(const key of Object.keys(totals))assert.equal(totals[key],data.totals[key]);console.log(JSON.stringify({...totals,distancePairs,allChoicesRecomputed:true,allTerminalHashesMatch:true,recordedRegressionScripts:46,adopted:false}));
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
