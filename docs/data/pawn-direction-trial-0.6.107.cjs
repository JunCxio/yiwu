const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
function verify(data,baseline,reference){
  assert.equal(data.format,'yiwu-pawn-direction-trial');assert.equal(data.formatVersion,1);assert.equal(data.decision,'rejected');assert.equal(data.releasedVersion,'0.6.107');
  const plan=data.plan;assert.equal(hash(baseline),plan.sourceSHA256.baseline);assert.equal(data.baselineCommit,plan.baselineCommit);
  let candidate=baseline;
  for(const change of data.sourceChanges){assert.equal(candidate.split(change.from).length-1,change.count||1);candidate=candidate.replaceAll(change.from,change.to);}
  assert.equal(hash(candidate),plan.sourceSHA256.candidate);
  for(const item of Object.values(data.sources))assert.equal(hash(item.source),item.sha256);
  assert.equal(data.sources.driver.sha256,plan.driverSHA256);assert.equal(data.sources.runner.sha256,plan.runnerSHA256);
  const compile=text=>{const box=vm.createContext({});for(const script of [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);return {E:box.Yiwu,C:box.YiwuComputer};};
  const {E,C}=compile(baseline),after=compile(candidate).C;
  const shared=data.sources.sharedDriver.source,allocator=data.sources.allocationRunner.source,allocation=vm.createContext({assert});
  assert(shared.includes('pairs=[[0,1],[0,2],[1,2]]'));
  vm.runInContext('const pairs=[[0,1],[0,2],[1,2]];'+shared.slice(shared.indexOf('function setup('),shared.indexOf('\nfunction engine('))+allocator.slice(allocator.indexOf('function state('),allocator.indexOf('\nfunction play('))+';globalThis.makeState=state;',allocation);
  const matrix=reference('balance-0.6.107'),previous=reference('two-round-capture-0.6.107');
  const normalize=i=>JSON.stringify(['scenario','style','comparator','aVariant','bVariant','replicate','aSide','seedA','seedB','assignment'].map(k=>i[k]??null));
  const controls=new Map([...matrix.reports.flatMap(r=>r.runs),...previous.reports.find(r=>r.group==='known').runs.filter(r=>r.input.models.red==='candidate')].map(r=>[normalize(r.input),r]));
  const prior=new Set(data.priorSeeds.flatMap(p=>p.seeds));assert.equal(prior.size,1024);assert.deepEqual(data.priorSeeds.map(p=>p.folder),plan.priorSeedPlans);
  const fresh=plan.inputs.filter(i=>i.group!=='known'),roots=new Set(fresh.map(i=>JSON.stringify([i.group,i.scenario,i.replicate,i.seedA,i.seedB])));
  assert.equal(fresh.length,64);assert.equal(roots.size,16);assert.equal(new Set(fresh.flatMap(i=>[i.seedA,i.seedB])).size,32);
  for(const root of roots){const group=fresh.filter(i=>JSON.stringify([i.group,i.scenario,i.replicate,i.seedA,i.seedB])===root);assert.deepEqual(group.map(i=>[i.models.red,i.models.black].join('/')).sort(),['baseline/baseline','baseline/candidate','candidate/baseline','candidate/candidate']);assert.equal(new Set(group.map(normalize)).size,1);}
  for(const i of fresh)for(const [key,side]of [['seedA','red'],['seedB','black']]){assert(!prior.has(i[key]));assert.equal(i[key],crypto.createHash('sha256').update(`${plan.seedLabel}:${i.group}:${i.scenario}:${i.replicate}:${side}`).digest().readUInt32LE(0));}
  const runs=data.reports.flatMap(r=>r.runs);let games=0,commands=0,oldControls=0;
  for(const report of data.reports){
    assert(report.completed);assert.deepEqual(report.errors,[]);assert.deepEqual(report.runs.map(r=>r.input),plan.inputs.filter(i=>i.group===report.group));
    for(const run of report.runs){
      let s,activity;const expected=allocation.makeState(E,run.input);E.start(expected);
      const stats={moves:0,rests:0,passes:0,battles:0,rounds:0,retreats:0,reversals:0},lastMoves=new Map();
      for(const [op,...args]of run.commands){
        commands++;if(op==='create'){assert(!s);s=E.create(...args);continue;}
        if(op==='start')activity=Object.fromEntries(Array.from(s.pieces,p=>[p.id,{side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));
        if(op==='move'){
          const p=E.get(s,args[0]),target=E.at(s,args[1],args[2]);
          if(target){stats.battles++;activity[p.id].attacks++;activity[target.id].defenses++;lastMoves.delete(p.id);}
          else{stats.moves++;activity[p.id].moves++;const last=lastMoves.get(p.id);if(last&&last[0]===args[1]&&last[1]===args[2])stats.reversals++;lastMoves.set(p.id,[p.x,p.y]);}
        }
        if(op==='rest'){stats.rests++;activity[args[0]].rests++;}if(op==='pass')stats.passes++;if(op==='retreat')stats.retreats++;
        if(op==='resolve'){
          stats.rounds++;const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args);
          activity[a.id].damage+=Math.min(d.hp,r.toD);activity[d.id].damage+=Math.min(a.hp,r.toA);
          if(r.toD>=d.hp)activity[a.id].captures++;if(r.toA>=a.hp)activity[d.id].captures++;
          if(E.CARDS[args[0]])activity[a.id].cardUses++;if(E.CARDS[args[1]])activity[d.id].cardUses++;
        }
        E[op](s,...args);if(op==='start')assert.deepEqual(copy(s),copy(expected));
      }
      assert.equal(s.phase,'ended');assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);
      for(const [key,value]of Object.entries(stats))assert.equal(run[key],value);assert.equal(stats.moves+stats.rests+stats.passes+stats.battles,s.ply);games++;
      if(report.group==='known'&&run.input.models.red==='baseline'){
        const original=controls.get(normalize(run.input));assert(original);for(const key of ['commands','pieceActivity','winner','reason','plies','terminalSHA256'])assert.deepEqual(run[key],original[key]);oldControls++;
      }
    }
  }
  assert.equal(games,90);assert.equal(commands,25015);assert.equal(oldControls,13);
  const summary=['quick','full'].map(scenario=>{
    const rows=runs.filter(r=>r.input.group!=='known'&&r.input.scenario===scenario);
    const groups=[['baseline','baseline'],['candidate','baseline'],['baseline','candidate'],['candidate','candidate']].map(([red,black])=>{
      const selected=rows.filter(r=>r.input.models.red===red&&r.input.models.black===black),counts={red:0,black:0,draw:0};for(const r of selected)counts[r.winner]++;assert.equal(selected.length,8);
      return {redModel:red,blackModel:black,games:selected.length,...counts,meanPlies:selected.reduce((n,r)=>n+r.plies,0)/selected.length,maxPlies:Math.max(...selected.map(r=>r.plies)),over200:selected.filter(r=>r.plies>200).length,singleDamageWins:selected.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1).length};
    });
    const direct=rows.filter(r=>r.input.models.red!==r.input.models.black);return {scenario,groups,candidateScore:direct.reduce((n,r)=>n+(r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),0),outOf:direct.length};
  });assert.deepEqual(summary,data.verification.summary);
  const known=runs.filter(r=>r.input.group==='known'&&r.input.models.red==='baseline').map(before=>{
    const after=runs.find(r=>r.input.group==='known'&&r.input.priorIndex===before.input.priorIndex&&r.input.models.red==='candidate');assert(after);
    const single=r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1;
    return {priorIndex:before.input.priorIndex,input:before.input,before:{plies:before.plies,winner:before.winner,battles:before.battles},after:{plies:after.plies,winner:after.winner,battles:after.battles},singleDamageBefore:single(before),singleDamageAfter:single(after)};
  });assert.deepEqual(known,data.verification.known);
  let sideways=0,behindNearest=0,misdirected=0,matrixGames=0,matrixCommands=0;const rows=[];
  const distance=(p,q)=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
  for(const report of matrix.reports)for(const game of report.runs){
    let s;for(const [index,[op,...args]]of game.commands.entries()){
      if(op==='create'){s=E.create(...args);matrixCommands++;continue;}
      if(op==='move'&&s.quiet>=20&&!E.at(s,args[1],args[2])){
        const p=E.get(s,args[0]);if(p.kind==='pawn'&&p.y===args[2]){
          sideways++;const enemies=s.pieces.filter(q=>q.side!==p.side),ahead=enemies.filter(q=>p.side==='red'?q.y<=p.y:q.y>=p.y),behind=enemies.filter(q=>!ahead.includes(q)),nearest=Math.min(...enemies.map(q=>distance(p,q))),moved={...p,x:args[1],y:args[2]},nearestBehind=behind.some(q=>distance(p,q)===nearest);
          if(nearestBehind)behindNearest++;
          if(nearestBehind&&ahead.length&&Math.min(...ahead.map(q=>distance(moved,q)))>Math.min(...ahead.map(q=>distance(p,q)))&&Math.min(...behind.map(q=>distance(moved,q)))<Math.min(...behind.map(q=>distance(p,q)))){
            misdirected++;if(rows.filter(r=>r.input.scenario===report.scenario).length<4){
              const original=data.inspection.rows[rows.length],before=JSON.stringify(s),ranked=copy(C.rankedActions(s));
              assert.deepEqual(original.commands,game.commands.slice(0,index));assert.deepEqual(original.input,game.input);assert.equal(original.ply,s.ply+1);assert.equal(original.index,index);assert.equal(original.quiet,s.quiet);assert.deepEqual(original.pawn,copy(p));assert.deepEqual(original.ahead,copy(ahead));assert.deepEqual(original.behind,copy(behind));assert.deepEqual(original.top,ranked.slice(0,5));
              assert.deepEqual(original.actual,ranked.find(a=>a.type==='move'&&a.id===p.id&&a.x===args[1]&&a.y===args[2]));after.rankedActions(s);assert.equal(JSON.stringify(s),before);rows.push({...original,state:copy(s)});
            }
          }
        }
      }
      E[op](s,...args);matrixCommands++;
    }
    assert.equal(hash(JSON.stringify(s)),game.terminalSHA256);matrixGames++;
  }
  for(const [key,value]of Object.entries({games:matrixGames,commands:matrixCommands,sideways,behindNearest,misdirected}))assert.equal(data.inspection[key],value);
  assert.equal(rows.length,8);assert.equal(misdirected,43);
  const fixture=rows.find(r=>r.input.scenario==='full'&&r.ply===265);assert(fixture);assert.deepEqual(fixture.commands,data.regressionFixture.commands);
  const same=a=>a.type===data.regressionFixture.action.type&&a.id===data.regressionFixture.action.id&&a.x===data.regressionFixture.action.x&&a.y===data.regressionFixture.action.y;
  assert(C.rankedActions(fixture.state).find(same).score>0);assert(after.rankedActions(fixture.state).find(same).score<0);
  for(const roll of [0,.25,.5,.75,.999999])assert(!same(after.board(fixture.state,()=>roll,'standard')));
  const samples=[...previous.performanceInputs,...rows.map(({state})=>({state}))];assert.equal(samples.length,60);assert.equal(hash(JSON.stringify(samples)),data.performanceInputsSHA256);
  let rankedActions=0,changedStates=0,changedActions=0;
  const actionKey=a=>JSON.stringify([a.type,a.id,a.x,a.y,a.card]);
  for(const {state}of samples){
    const before=JSON.stringify(state),old=copy(C.rankedActions(state)),next=copy(after.rankedActions(state)),byId=new Map(next.map(a=>[actionKey(a),a]));assert.equal(JSON.stringify(state),before);assert.equal(old.length,next.length);rankedActions+=old.length;
    const changed=old.filter(a=>Math.abs(a.score-byId.get(actionKey(a)).score)>1e-8).length;if(changed)changedStates++;changedActions+=changed;
  }
  for(const [key,value]of Object.entries({rankedActions,changedStates,changedActions}))assert.equal(data.performance[key],value);
  assert.equal(data.tests.length,37);assert(data.tests.every(t=>t.status===0));assert.equal(data.ruleChecks,31);assert.equal(data.uiChecks,143);
  assert.equal(data.browser.sourceSHA256,plan.sourceSHA256.candidate);assert.equal(data.browser.fixtureRandom,0);assert.deepEqual(data.browser.logs,[]);
  assert(data.verification.combatCodeUnchanged&&data.verification.sharedPositionCanAffectStandardCombat);
  for(const [key,value]of Object.entries({games,commands,oldControlsVerified:oldControls,newSeeds:32,priorSeedsChecked:prior.size,newRootGroups:roots.size,diagnosticPositions:rows.length}))assert.equal(data.verification[key],value);
  for(const scenario of summary){const [old,,,next]=scenario.groups;assert(next.meanPlies>old.meanPlies);}
  return {decision:'rejected',games,commands,oldControls,matrixGames,matrixCommands,diagnosticPositions:rows.length,misdirected,rankedActions,changedStates,changedActions,statisticsVerified:true,terminalHashesMatch:true,sourceSHA256:plan.sourceSHA256.baseline,candidateSHA256:plan.sourceSHA256.candidate};
}
module.exports={verify};
if(require.main===module){
  const bytes=fs.readFileSync(path.join(__dirname,'pawn-direction-trial-0.6.107.json')),data=JSON.parse(bytes),baseline=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'),'utf8');
  const reference=name=>{const bytes=fs.readFileSync(path.join(__dirname,data.references[name].file));assert.equal(hash(bytes),data.references[name].sha256);return JSON.parse(bytes);};
  console.log(JSON.stringify({...verify(data,baseline,reference),dataSHA256:hash(bytes)}));
}
