const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),bytes=fs.readFileSync(__dirname+'/query-sharing-0.6.134.json.gz'),data=JSON.parse(zlib.gunzipSync(bytes)),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8');
assert.equal(hash(bytes),'2ba20b1c8aac3f1c2edf56f2bbb3d657b011d68f118cef4e7eb9456726d66be4');assert.equal(data.version,'0.6.134');assert.equal(hash(source),data.releaseSHA256,'请提供报告指定的0.6.134入口');
const script=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const baseline=source.replace(script[1],data.baselineComputer).replaceAll('0.6.134','0.6.133').replace('0.6.133 · 电脑查询提速','0.6.133 · 交战解围提示');assert.equal(hash(baseline),data.baselineSHA256);
function model(html){const box=vm.createContext({});for(const m of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);return {E:box.Yiwu,C:box.YiwuComputer};}
const models={baseline:model(baseline),candidate:model(source)};let queries=0;
function query(state){
  const raw=JSON.stringify(state),before=copy(models.baseline.C.rankedActions(state)),after=copy(models.candidate.C.rankedActions(state));
  assert.deepEqual(after.map(a=>({...a,score:Math.round(a.score*1e9)})),before.map(a=>({...a,score:Math.round(a.score*1e9)})));
  for(let i=0;i<after.length;i++)assert(Math.abs(after[i].score-before[i].score)<1e-10);assert.equal(JSON.stringify(state),raw);queries++;
}
for(const {state}of data.cases)query(state);
const history=copy(data.cases.find(r=>r.name==='repetition-attacker-only-2').state),keys=Object.keys(history.repetitions);
for(const count of [1,2,1,0,3]){for(const key of keys)history.repetitions[key]=count;query(history);}
history.pieces=history.pieces.filter(p=>p.kind!=='pawn'||p.side!==history.turn);query(history);
for(const {C}of Object.values(models))assert.throws(()=>C.rankedActions({...data.cases[0].state,repetitions:{invalid:2}}));assert.equal(queries,data.equivalence.queryCount);
const median=xs=>[...xs].sort((a,b)=>a-b)[xs.length>>1],limits={maxStateMedianMs:50,maxSampleMs:100,maxOpeningExtraMedianMs:5};
assert.deepEqual(data.performance.node.limits,limits);
for(const row of data.performance.node.rows){
  assert.equal(row.samples.baseline.length,11);assert.equal(row.samples.candidate.length,11);assert.equal(median(row.samples.baseline),row.baselineMedianMs);assert.equal(median(row.samples.candidate),row.candidateMedianMs);assert.equal(Math.max(...row.samples.candidate),row.candidateMaximumMs);
  assert(row.candidateMedianMs<=50&&row.candidateMaximumMs<=100&&row.cold.candidate<=100);if(row.name.startsWith('opening-'))assert(row.candidateMedianMs-row.baselineMedianMs<=5);
}
for(const row of data.performance.edge.rows){
  assert.equal(row.samples.before.length,11);assert.equal(row.samples.after.length,11);assert.equal(median(row.samples.before),row.beforeMedianMs);assert.equal(median(row.samples.after),row.afterMedianMs);assert.equal(Math.max(...row.samples.after),row.afterMaxMs);assert(row.afterMedianMs<=50&&row.afterMaxMs<=100);if(row.name.startsWith('opening-'))assert(row.afterMedianMs-row.beforeMedianMs<=5);
}
assert.equal(data.performance.node.rows.length,218);assert.equal(data.performance.edge.rows.length,24);assert.equal(data.regressions.length,55);assert(data.regressions.every(r=>r.status===0));assert.equal(data.cache.damageChecks,7500);assert.equal(data.newBalanceGames,0);
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},totals={games:0,commands:0,boardChoices:0,rounds:0};
for(const run of data.replays.runs){
  const E=models.baseline.E,{input}=run,rng=Object.fromEntries(Object.keys(models).map(name=>[name,{[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)}]));let s;
  for(const command of run.commands){
    const [op,...args]=command;totals.commands++;
    if(op==='create'){s=E.create(...args);continue;}
    if(['learn','start'].includes(op)){E[op](s,...args);continue;}
    const raw=JSON.stringify(s),selected={};
    for(const [name,{C}]of Object.entries(models)){
      if(s.phase==='board'){const a=C.board(s,rng[name][s.turn],input.difficulty);selected[name]=[a.type,...(a.type==='pass'?[]:a.type==='rest'?[a.id,a.card]:[a.id,a.x,a.y])];}
      else{assert.equal(s.phase,'duel');const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),x=C.combat(s,a.side,rng[name][a.side],input.difficulty);selected[name]=x==='retreat'?['retreat']:['resolve',x,C.combat(s,d.side,rng[name][d.side],input.difficulty)];}
    }
    assert.deepEqual(selected.candidate,selected.baseline);assert.deepEqual(selected.candidate,command);assert.equal(JSON.stringify(s),raw);if(s.phase==='board')totals.boardChoices++;if(op==='resolve')totals.rounds++;E[op](s,...args);
  }
  assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);totals.games++;console.log(JSON.stringify({game:totals.games,scenario:input.scenario,difficulty:input.difficulty,plies:s.ply}));
}
for(const key of Object.keys(totals))assert.equal(totals[key],data.replays.summary[key]);console.log(JSON.stringify({verified:true,dataSHA256:hash(bytes),queries,...totals}));
