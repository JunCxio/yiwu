const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const bytes=fs.readFileSync(path.join(__dirname,'move-validation-0.6.122.json')),data=JSON.parse(bytes);
assert.equal(hash(bytes),'85d19bc8e23454e900976e2189a0854f9dcaf129aba7d3e917f1c63f9c053789');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'),'utf8');assert.equal(hash(html),data.releaseSHA256,'请提供报告指定的0.6.122入口');
const candidate=html.replaceAll('0.6.122','0.6.121').replace('走法查询优化</span></footer>','逐招气势对照</span></footer>');
assert.equal(hash(candidate),data.candidateSHA256);assert.equal(candidate.split(data.patch.after).length,2);
const original=candidate.replace(data.patch.after,data.patch.before);assert.equal(hash(original),data.baselineSHA256);
const scripts=h=>[...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts(original)[1],scripts(candidate)[1]);assert.equal(scripts(original)[2],scripts(candidate)[2]);
function engine(source){const box=vm.createContext({});for(const script of scripts(source).slice(0,2))vm.runInContext(script,box);return {E:box.Yiwu,C:box.YiwuComputer};}
const baseline=engine(original),release=engine(html);
for(const {name,state}of data.cases){
  const before=JSON.stringify(state);assert.equal(JSON.stringify(release.C.rankedActions(state)),JSON.stringify(baseline.C.rankedActions(state)),name);
  for(const difficulty of ['practice','standard'])for(const roll of [0,.25,.5,.75,.999999])assert.equal(JSON.stringify(release.C.board(state,()=>roll,difficulty)),JSON.stringify(baseline.C.board(state,()=>roll,difficulty)),name);
  assert.equal(JSON.stringify(state),before);
}
for(const result of [data.performance,data.browserPerformance]){
  for(const row of result.rows){const median=xs=>xs.toSorted((a,b)=>a-b)[xs.length>>1];assert.equal(row.baselineMedianMs,median(row.samples.baseline));assert.equal(row.candidateMedianMs,median(row.samples.candidate));assert.equal(row.candidateMaximumMs,Math.max(...row.samples.candidate));}
  assert(result.passed);assert(result.rows.every(r=>r.candidateMedianMs<=50&&r.candidateMaximumMs<=100&&(!r.name.startsWith('opening-')||r.candidateMedianMs-r.baselineMedianMs<=5)));
}
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const run of data.fullDecisionReplays){
  const {E,C}=engine(html),rng={[run.input.aSide]:random(run.input.seedA),[E.OTHER[run.input.aSide]]:random(run.input.seedB)};let state;
  for(const command of run.commands){
    const [op,...args]=command;
    if(op==='create'){state=E.create(...args);continue;}
    if(state.phase==='board'){
      let action=C.board(state,rng[state.turn],'standard');
      if(run.input.force&&state.ply+1===run.input.force.ply){assert.deepEqual(JSON.parse(JSON.stringify(action)),run.input.force.expected);action=run.input.force.action;}
      const expected=action.type==='pass'?['pass']:action.type==='rest'?['rest',action.id,action.card]:['move',action.id,action.x,action.y];assert.deepEqual(expected,command);
    }else if(state.phase==='duel'){
      const a=E.get(state,state.duel.a),d=E.get(state,state.duel.d),attack=C.combat(state,a.side,rng[a.side],'standard');
      assert.deepEqual(attack==='retreat'?['retreat']:['resolve',attack,C.combat(state,d.side,rng[d.side],'standard')],command);
    }
    E[op](state,...args);
  }
  assert.equal(state.phase,'ended');assert.equal(state.winner,run.winner);assert.equal(state.ply,run.plies);assert.equal(hash(JSON.stringify(state)),run.terminalSHA256);
}
assert(data.regression.rows.every(r=>r.passed&&r.status===0));assert.equal(data.newBalanceGames,0);
console.log(JSON.stringify({sourceVerified:true,states:data.cases.length,recordedScripts:data.regression.rows.length,geometryChecks:data.geometryChecks,fullDecisionReplays:data.fullDecisionReplays.length,decisionPlies:data.fullDecisionReplays.reduce((n,r)=>n+r.plies,0),newBalanceGames:0}));
