const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path'),dir=__dirname+'/',dataBytes=fs.readFileSync(dir+'king-threat-query-0.6.132.json');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
assert.equal(hash(dataBytes),'d072826b396ed36b43d5349c7b07c78ed3801cb01e12e531f805d946e38b14e7');const data=JSON.parse(dataBytes),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8');
assert.equal(hash(source),data.releaseSHA256,'请提供报告指定的0.6.132入口');
const baseline=source.replaceAll('0.6.132','0.6.131').replace('· 防线查询提速','· 选招状态辨识').replace(data.patch.after,data.patch.before);
assert.equal(hash(baseline),data.baselineSHA256);const models={};
for(const [name,html]of [['baseline',baseline],['candidate',source]]){const box=vm.createContext({});for(const m of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1].replace('return {actions,choices,','return {threatCost,actions,choices,'),box);models[name]={E:box.Yiwu,C:box.YiwuComputer};}
for(const {state}of data.cases)assert.deepEqual(copy(models.candidate.C.rankedActions(state)),copy(models.baseline.C.rankedActions(state)));
for(const model of ['node','chromium'])for(const row of data.performance[model].rows){const median=x=>[...x].sort((a,b)=>a-b)[x.length>>1];assert.equal(row.samples.baseline.length,31);assert.equal(row.samples.candidate.length,31);assert.equal(median(row.samples.baseline),row.baselineMedianMs);assert.equal(median(row.samples.candidate),row.candidateMedianMs);assert.equal(Math.max(...row.samples.candidate),row.candidateMaximumMs);assert(row.candidateMedianMs<=50&&row.candidateMaximumMs<=100);if(row.name.startsWith('opening-'))assert(row.candidateMedianMs-row.baselineMedianMs<=5);}
assert.equal(data.regressions.length,54);assert(data.regressions.every(r=>r.status===0));assert.equal(data.newBalanceGames,0);
const runs=data.replays.runs;assert.equal(new Set(runs.map(r=>r.input.difficulty+'-'+r.input.scenario)).size,4);
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const totals={games:0,commands:0,boardChoices:0,combatChoices:0,fullRankings:0,randomBoundaries:0,threatChecks:0},rows=[],E=models.baseline.E;
for(const run of runs){
  const {input}=run,makeRandom=()=>({[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)}),rng={baseline:makeRandom(),candidate:makeRandom()};let s;
  for(const [index,command]of run.commands.entries()){
    const [op,...args]=command;totals.commands++;
    if(op==='create'){s=E.create(...args);continue;}
    if(['learn','start'].includes(op)){E[op](s,...args);continue;}
    const raw=JSON.stringify(s);
    for(const p of s.pieces)for(const repeated of [false,true]){assert.equal(models.candidate.C.threatCost(s,p,repeated),models.baseline.C.threatCost(s,p,repeated));totals.threatChecks++;}
    if(s.phase==='board'){
      if(index%29===0){
        assert.deepEqual(copy(models.candidate.C.rankedActions(s)),copy(models.baseline.C.rankedActions(s)));totals.fullRankings++;
        if(totals.fullRankings%11===0)for(const difficulty of ['practice','standard'])for(const roll of [0,.25,.5,.75,.999999]){assert.deepEqual(copy(models.candidate.C.board(s,()=>roll,difficulty)),copy(models.baseline.C.board(s,()=>roll,difficulty)));totals.randomBoundaries++;}
      }
      const actions=Object.fromEntries(Object.entries(models).map(([name,{C}])=>[name,copy(C.board(s,rng[name][s.turn],input.difficulty))]));totals.boardChoices++;
      assert.deepEqual(actions.candidate,actions.baseline);const a=actions.candidate,expected=[a.type,...(a.type==='pass'?[]:a.type==='rest'?[a.id,a.card]:[a.id,a.x,a.y])];assert.deepEqual(expected,command);
    }else{
      assert.equal(s.phase,'duel');const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
      const x=models.candidate.C.combat(s,a.side,rng.candidate[a.side],input.difficulty);assert.equal(x,models.baseline.C.combat(s,a.side,rng.baseline[a.side],input.difficulty));totals.combatChoices++;
      if(x==='retreat')assert.deepEqual(command,['retreat']);else{const y=models.candidate.C.combat(s,d.side,rng.candidate[d.side],input.difficulty);assert.equal(y,models.baseline.C.combat(s,d.side,rng.baseline[d.side],input.difficulty));totals.combatChoices++;assert.deepEqual(command,['resolve',x,y]);}
    }
    assert.equal(JSON.stringify(s),raw);E[op](s,...args);
  }
  assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(s.ply,run.plies);totals.games++;
  const row={difficulty:input.difficulty,scenario:input.scenario,winner:s.winner,plies:s.ply,commands:run.commands.length,terminalSHA256:run.terminalSHA256};rows.push(row);console.log(JSON.stringify({row,totals}));
}
assert.deepEqual(totals,data.replays.totals);assert.deepEqual(rows,data.replays.rows);console.log(JSON.stringify({verified:true,sourceSHA256:hash(source),...totals}));
