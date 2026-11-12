const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const file=path.join(__dirname,'king-rescue-0.6.119.json'),data=JSON.parse(fs.readFileSync(file)),sourcePath=path.resolve(process.argv[2]||path.join(__dirname,'../../index.html'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),source=fs.readFileSync(sourcePath,'utf8');
assert.equal(hash(fs.readFileSync(file)),'cc71d42101a882098e4992e3f5069672966646492396df39dbdf73e3af9cbae5');
assert.equal(hash(source),data.sourceSHA256.baseline,'请传入报告指定的0.6.119源码');
function apply(rows){let html=source;for(const row of rows){assert.equal(html.split(row.before).length,2);html=html.replace(row.before,row.after);}return html;}
const candidate=apply(data.patch),first=apply(data.firstCandidate.patch);assert.equal(hash(candidate),data.sourceSHA256.candidate);assert.equal(hash(first),data.firstCandidate.sourceSHA256);
const scripts=html=>[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(const html of [candidate,first]){assert.equal(scripts(html)[0],scripts(source)[0]);assert.equal(scripts(html)[2],scripts(source)[2]);}
assert.equal(hash(data.driverSource),data.plan.driverSHA256);assert.equal(data.plan.inputs.length,136);assert.equal(new Set(data.plan.inputs.map(i=>JSON.stringify(i))).size,136);
assert.deepEqual(data.scope.acceptance,{eachDifficultyAndModeDirectScoreAtLeastHalf:true,eachDifficultyAndModeSelfPlayMeanNotLonger:true,eachDifficultyAndModeSelfPlayMaximumNotLonger:true,independentFollowupRequiredBeforeAdoption:true});
const fresh=new Set(data.plan.inputs.filter(i=>i.group!=='known').flatMap(i=>[i.seedA,i.seedB])),excluded=new Set(data.plan.excludedSeeds),roots=new Map();
assert.equal(fresh.size,64);assert.equal(excluded.size,3244);assert([...fresh].every(n=>!excluded.has(n)));assert(data.firstCandidate.reservedSeeds.every(n=>excluded.has(n)));
for(const i of data.plan.inputs.filter(i=>i.group!=='known')){
  for(const [side,key]of [['red','seedA'],['black','seedB']])assert.equal(i[key],crypto.createHash('sha256').update([data.plan.seedLabel,i.difficulty,i.group,i.scenario,i.replicate,side].join(':')).digest().readUInt32LE(0));
  const key=JSON.stringify([i.difficulty,i.group,i.scenario,i.replicate]),list=roots.get(key)||[];list.push(i.models);roots.set(key,list);
}
assert.equal(roots.size,32);for(const rows of roots.values())assert.deepEqual(rows.map(x=>x.red+':'+x.black).sort(),['baseline:baseline','baseline:candidate','candidate:baseline','candidate:candidate']);
assert.equal(data.processes.length,2);const completed=data.processes.flatMap(p=>{assert(p.completed&&!p.errors.length);assert.deepEqual(p.finished,p.planned);return p.finished;});assert.equal(completed.length,136);assert.equal(new Set(completed).size,136);
const all=data.reports.flatMap(r=>{assert(r.completed&&!r.errors.length&&r.runs.length===34);return r.runs;}),remaining=new Set(data.plan.inputs.map(i=>JSON.stringify(i)));
for(const run of all){assert(remaining.delete(JSON.stringify(run.input)));if(run.input.group==='known'&&run.input.models.red==='baseline'){const prior=data.known[run.input.priorIndex];assert.deepEqual(run.commands,prior.commands);assert.equal(run.terminalSHA256,prior.terminalSHA256);assert.deepEqual(run.pieceActivity,prior.pieceActivity);}}
assert.equal(remaining.size,0);
for(const difficulty of ['standard','practice'])for(const mode of ['quick','full']){
  const rows=all.filter(r=>r.input.group!=='known'&&r.input.difficulty===difficulty&&r.input.scenario===mode),direct=rows.filter(r=>r.input.models.red!==r.input.models.black),points=direct.map(r=>r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),summary={direct:{games:points.length,wins:points.filter(p=>p===1).length,draws:points.filter(p=>p===.5).length,losses:points.filter(p=>p===0).length,points:points.reduce((a,b)=>a+b,0)}};
  for(const model of ['baseline','candidate']){const self=rows.filter(r=>r.input.models.red===model&&r.input.models.black===model),plies=self.map(r=>r.plies).sort((a,b)=>a-b);summary[model]={games:self.length,meanPlies:plies.reduce((a,b)=>a+b,0)/plies.length,medianPlies:(plies[(plies.length-1)>>1]+plies[plies.length>>1])/2,maxPlies:plies.at(-1),draws:self.filter(r=>r.winner==='draw').length,singleDamageWins:self.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1).length};}
  summary.passedGates=summary.direct.points>=summary.direct.games/2&&summary.candidate.meanPlies<=summary.baseline.meanPlies&&summary.candidate.maxPlies<=summary.baseline.maxPlies;assert.deepEqual(summary,data.summary[difficulty+'-'+mode]);
}
assert.equal(data.decision.adopted,false);assert.deepEqual(data.decision.failedGates,Object.entries(data.summary).filter(([,r])=>!r.passedGates).map(([k])=>k));assert.equal(data.decision.failedGates.length,4);
assert.equal(data.regression.rows.length,44);assert(data.regression.rows.every(r=>r.passed));assert.equal(data.firstCandidate.fullGamesStarted,0);
assert.deepEqual(data.firstCandidate.regression.rows.filter(r=>!r.passed).map(r=>r.name),['computer-initiative.cjs','computer-king-zero-exit.cjs']);
const limits=data.scope.performanceAcceptance;assert.deepEqual(limits,{maxStateMedianMs:50,maxSampleMs:100,maxOpeningExtraMedianMs:5});
const median=values=>[...values].sort((a,b)=>a-b)[values.length>>1];assert.equal(data.performance.rows.length,11);
for(const row of data.performance.rows){assert.equal(median(row.samples.baseline),row.baselineMedianMs);assert.equal(median(row.samples.candidate),row.candidateMedianMs);assert.equal(Math.max(...row.samples.candidate),row.candidateMaximumMs);assert(row.candidateMedianMs<=limits.maxStateMedianMs&&row.candidateMaximumMs<=limits.maxSampleMs);if(row.name.startsWith('opening-'))assert(row.candidateMedianMs-row.baselineMedianMs<=limits.maxOpeningExtraMedianMs);}
function model(html){const box=vm.createContext({});for(const [i,script]of scripts(html).slice(0,2).entries())vm.runInContext(i===1&&html.includes('function kingAdvanceCost(')?script.replace('return {actions,choices','return {kingAdvanceCost,actions,choices'):script,box);return {E:box.Yiwu,C:box.YiwuComputer};}
function targeted(){
  const {E,C}=model(candidate),fixture=data.targetedFixture;let original;
  for(const [op,...args]of fixture.commands){if(op==='create')original=E.create(...args);else E[op](original,...args);}assert.equal(hash(JSON.stringify(original)),fixture.stateSHA256);
  const threat=(s,side)=>{const king=s.pieces.find(p=>p.side===side&&p.kind==='king');return s.pieces.some(p=>p.side!==side&&E.canMove(s,p,king.x,king.y)&&!C.battleOutlook(s,E.context(s,p,king)).counters.length);};
  const rotate=s=>{s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));return s;};
  let branches=0;
  for(const rotated of [false,true]){
    const s=rotated?rotate(copy(original)):copy(original),before=JSON.stringify(s),xy=(x,y)=>rotated?[8-x,9-y]:[x,y],good={id:'red_guard_1',x:xy(4,9)[0],y:xy(4,9)[1]},bad={id:'red_king_0',x:xy(3,8)[0],y:xy(3,8)[1]};
    assert.equal(C.rankedActions(s)[0].id,good.id);for(const difficulty of ['standard','practice'])for(const roll of [0,.5,.999999]){const a=C.board(s,()=>roll,difficulty);assert.equal(a.id,good.id);assert.equal(a.x,good.x);assert.equal(a.y,good.y);}
    for(const [action,forced]of [[good,false],[bad,true]]){
      const next=copy(s);E.move(next,action.id,action.x,action.y);assert(!threat(next,s.turn));assert.equal(C.kingAdvanceCost(next,E.get(next,bad.id)),forced?8.4:4.2);
      const danger=copy(next),[x,y]=xy(3,9);if(E.at(danger,x,y))continue;E.move(danger,'black_rook_3',x,y);assert(threat(danger,s.turn));let safe=0;
      for(const reply of C.actions(danger).filter(a=>a.type==='rest'||!E.at(danger,a.x,a.y))){const escaped=copy(danger);if(reply.type==='rest')E.rest(escaped,reply.id,reply.card);else E.move(escaped,reply.id,reply.x,reply.y);if(escaped.phase==='ended'?escaped.winner!==E.OTHER[s.turn]:!threat(escaped,s.turn))safe++;branches++;}
      assert.equal(safe===0,forced);
    }
    assert.equal(JSON.stringify(s),before);
  }
  assert.equal(branches,40);return branches;
}
if(process.argv[3]===undefined){
  const quietBranches=targeted(),totals={games:0,commands:0,boardChoices:0,combatChoices:0};
  for(let shard=0;shard<4;shard++){
    const run=spawnSync(process.execPath,[__filename,sourcePath,String(shard)],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(run.status,0,run.stderr);process.stdout.write(run.stdout);
    const row=JSON.parse(run.stdout.trim().split('\n').at(-1));for(const key of Object.keys(totals))totals[key]+=row[key];
  }
  assert.equal(totals.games,136);assert.equal(totals.commands,45788);assert.equal(totals.boardChoices,34499);assert.equal(totals.combatChoices,16749);
  console.log(JSON.stringify({...totals,quietBranches,allChoicesRecomputed:true,allTerminalHashesMatch:true,regressionScriptsCapturedNotRerun:44,performanceCapturedNotRerun:true,adopted:false}));
}else{
  const shard=Number(process.argv[3]);assert(Number.isInteger(shard)&&shard>=0&&shard<4);
  const models={baseline:model(source),candidate:model(candidate)},E=models.baseline.E,random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function setup(s,side,style,variant){
    if(style==='default'){E.auto(s,side,true);return;}
    const ps=s.pieces.filter(p=>p.side===side).sort((a,b)=>side==='red'?a.x-b.x:b.x-a.x),kinds=style==='defense'?['pawn','guard','elephant','horse','cannon','rook','king']:['rook','horse','cannon','pawn','guard','elephant','king'];
    let order=ps.filter(p=>p.kind!=='king').sort((a,b)=>kinds.indexOf(a.kind)-kinds.indexOf(b.kind));if(style==='mixed')order=['rook','pawn','guard','horse','cannon','elephant'].map(kind=>ps.find(p=>p.kind===kind));
    for(let i=0;i<order.length&&s.budget[side];i++){const p=order[i],ids=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind);for(const n of style==='spread'?[(i+variant)%3]:[[0,1],[0,2],[1,2]][variant])if(s.budget[side])E.learn(s,p.id,ids[n]);}
  }
  const totals={games:0,commands:0,boardChoices:0,combatChoices:0},runs=data.reports.find(r=>r.shard===shard).runs;
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
          const dId=controller(d.side).combat(s,d.side,streams[d.side],input.difficulty);totals.combatChoices++;assert.deepEqual([aId,dId],args);assert(!E.availability(s,a,aId,s.duel));assert(!E.availability(s,d,dId,s.duel));stats.rounds++;
          const damage=E.roundDamage(s.duel,...args);activity[a.id].damage+=Math.min(d.hp,damage.toD);activity[d.id].damage+=Math.min(a.hp,damage.toA);if(damage.toD>=d.hp)activity[a.id].captures++;if(damage.toA>=a.hp)activity[d.id].captures++;if(E.CARDS[aId])activity[a.id].cardUses++;if(E.CARDS[dId])activity[d.id].cardUses++;
        }
        assert.equal(JSON.stringify(s),before);
      }
      E[op](s,...args);if(op==='start')assert.equal(JSON.stringify(s),JSON.stringify(expected));
    }
    assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);for(const [key,value]of Object.entries(stats))assert.equal(value,run[key]);totals.games++;
    if(totals.games%6===0)console.log(JSON.stringify({shard,...totals}));
  }
  assert.equal(totals.games,34);console.log(JSON.stringify({shard,...totals,allChoicesRecomputed:true,allTerminalHashesMatch:true}));
}
