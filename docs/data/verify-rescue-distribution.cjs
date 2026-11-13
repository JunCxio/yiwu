const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),copy=value=>JSON.parse(JSON.stringify(value));
const bytes=fs.readFileSync(path.join(__dirname,'rescue-distribution-0.6.133.json'));assert.equal(hash(bytes),'00d382dcc9487fb67cc1b244cea48f4fb37d023ab4dcab12c685b6c31377db91');const data=JSON.parse(bytes);
assert.equal(hash(fs.readFileSync(path.join(__dirname,'rescue-distribution-slow.cjs'))),data.helpers.slow);assert.equal(hash(fs.readFileSync(path.join(__dirname,'rescue-distribution-compact.cjs'))),data.helpers.compact);
const {distribution}=require('./rescue-distribution-slow.cjs'),{compact,fields}=require('./rescue-distribution-compact.cjs');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'),'utf8');assert.equal(hash(html),data.sourceSHA256,'请提供报告指定的0.6.133入口');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});for(const script of scripts.slice(0,2))vm.runInContext(script,box);const E=box.Yiwu,C=box.YiwuComputer;
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},command=a=>a.type==='move'?['move',a.id,a.x,a.y]:a.type==='rest'?['rest',a.id,a.card]:['pass'];
const ref=data.reference,rng={[ref.input.aSide]:random(ref.input.seedA),[E.OTHER[ref.input.aSide]]:random(ref.input.seedB)},states=new Map();let state,choices=0;
for(const [op,...args]of ref.commands){
  if(op==='create'){state=E.create(...args);continue;}const before=JSON.stringify(state);
  if(state.phase==='board'){
    if([16,18].includes(state.ply+1))states.set(state.ply+1,copy(state));
    assert.deepEqual(copy(command(C.board(state,rng[state.turn],ref.input.difficulty))),[op,...args]);choices++;
  }else if(state.phase==='duel'){
    const a=E.get(state,state.duel.a),d=E.get(state,state.duel.d),first=C.combat(state,a.side,rng[a.side],ref.input.difficulty);choices++;
    if(first==='retreat')assert.equal(op,'retreat');else{assert.equal(op,'resolve');assert.deepEqual([first,C.combat(state,d.side,rng[d.side],ref.input.difficulty)],args);choices++;}
  }
  assert.equal(JSON.stringify(state),before);E[op](state,...args);
}
assert.equal(state.phase,'ended');assert.equal(state.ply,19);assert.equal(state.winner,'red');assert.equal(hash(JSON.stringify(state)),ref.terminalSHA256);
const cases=[];for(const [ply,entry]of states)for(const action of copy(C.rankedActions(entry)).filter(a=>a.type==='move'&&E.at(entry,a.x,a.y)&&E.get(entry,a.id).kind!=='king'))cases.push({name:'natural-'+ply+'-'+entry.turn+'-'+action.id+'-'+action.x+'-'+action.y,entry,action});
const base=cases[0];for(const [hpA,hpD]of [[1,1],[2,3],[4,6],[6,4]]){const entry=copy(base.entry);E.get(entry,base.action.id).hp=hpA;E.at(entry,base.action.x,base.action.y).hp=hpD;cases.push({name:'boundary-'+hpA+'-'+hpD,entry,action:base.action});}
const mirrored=copy(base.entry);mirrored.turn=E.OTHER[mirrored.turn];for(const p of mirrored.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
mirrored.repetitions=Object.fromEntries(Object.entries(mirrored.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));cases.push({name:'rotated',entry:mirrored,action:{...base.action,x:8-base.action.x,y:9-base.action.y}});
assert.equal(cases.length,13);assert.equal(data.cases.length,13);let slowBranches=0,compactBranches=0;
for(const [index,fixture]of cases.entries()){
  const expected=data.cases[index];assert.deepEqual({name:fixture.name,entry:fixture.entry,action:fixture.action},{name:expected.name,entry:expected.entry,action:expected.action});const before=JSON.stringify(fixture.entry);
  const slow=distribution(E,C,fixture.entry,fixture.action),fast=compact(E,C,fixture.entry,fixture.action);
  for(const field of fields){assert(Math.abs(slow.probabilities[field]-expected.slow.probabilities[field])<1e-10,fixture.name+': '+field);assert(Math.abs(fast.probabilities[field]-slow.probabilities[field])<1e-10);assert(Math.abs(expected.compact.probabilities[field]-slow.probabilities[field])<1e-10);}
  assert.equal(slow.branches,expected.slow.branches);assert.equal(fast.branches,expected.compact.branches);assert.equal(slow.states,expected.slow.states);assert.equal(fast.states,expected.compact.states);assert.equal(JSON.stringify(fixture.entry),before);slowBranches+=slow.branches;compactBranches+=fast.branches;console.log(JSON.stringify({case:fixture.name,verified:true}));
}
assert.equal(slowBranches,794921);assert.equal(compactBranches,789403);assert.equal(data.newIndependentStarts,0);assert.equal(data.productionModified,false);assert.equal(data.timing.cpuProfileEnabled,false);
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[4]+sorted[5])/2;};
for(const row of data.timing.rows){assert.equal(row.samples.length,10);assert.equal(median(row.samples.map(s=>s.baseline.elapsedMs)),row.baselineMedianMs);assert.equal(median(row.samples.map(s=>s.extended.elapsedMs)),row.extendedMedianMs);assert.equal(Math.max(...row.samples.map(s=>s.extended.elapsedMs)),row.extendedMaxMs);assert(row.extendedMedianMs>data.timing.gates.medianMs&&row.extendedMaxMs>data.timing.gates.maxMs);}
assert.equal(data.timing.passed,false);console.log(JSON.stringify({cases:cases.length,referenceChoices:choices,slowBranches,compactBranches,allProbabilitiesMatch:true,performanceGatePassed:false,adopted:false}));
