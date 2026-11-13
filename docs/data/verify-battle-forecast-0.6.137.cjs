const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),bytes=fs.readFileSync(path.join(__dirname,'battle-forecast-0.6.137.json.gz'));
assert.equal(hash(bytes),'92c51b7e5fcc92a844f64e26d6f09288d36080666c5cb65c5e167a5e076b998e');const data=JSON.parse(zlib.gunzipSync(bytes)),R=data.records,scope=R['scope-prepared'];
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'),'utf8');assert.equal(hash(html),data.sourceSHA256,'请提供报告指定的0.6.137入口');
const box=vm.createContext({});for(const m of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);const E=box.Yiwu,C=box.YiwuComputer;
assert.equal(hash(fs.readFileSync(path.join(__dirname,'rescue-distribution-compact.cjs'))),scope.baselineHelperSHA256);const {compact,fields}=require('./rescue-distribution-compact.cjs'),{distribution}=require('./rescue-distribution-slow.cjs');
function load(source){const m={exports:{}};vm.runInNewContext(source,{module:m,require:name=>{assert.equal(name,'node:assert/strict');return assert;},performance});return m.exports;}
for(const h of Object.values(data.helpers))assert.equal(hash(h.source),h.SHA256);assert.equal(data.helpers.prepared.SHA256,scope.candidateHelperSHA256);
let instrument=data.helpers.prepared.source;
function replace(from,to){assert.equal(instrument.split(from).length,2);instrument=instrument.replace(from,to);}
replace('  const terminals=new Map(),','  const auditEnds=new Map();let checked=0;\n  const terminals=new Map(),');
replace('    const attacker=E.get(next,a.id),','    auditEnds.set(key,{...after,key:E.key(next),winner:next.winner,quiet:next.quiet,reason:next.reason,retreated});\n    const attacker=E.get(next,a.id),');
replace('    for(let i=0;i<fields.length;i++)totals[i]+=',`    const truth=terminal(e.node,e.row,e.col,e.after);checked++;
    for(let i=0;i<11;i++)assert.equal(values[i],truth[i],fields[i]+': terminal group');
    assert.equal(truth[11],p.ha);assert.equal(truth[12],p.hd);
    for(let i=0;i<fields.length;i++)totals[i]+=`);
replace('  return {probabilities:result,','  return {checked,auditEnds:[...auditEnds.values()],transitionKeys:[...transitions.keys()],probabilities:result,');
assert.equal(hash(instrument),R['verification-boundaries-with-fixtures'].instrumentSHA256);assert.equal(hash(instrument),R['verification-real'].instrumentSHA256);const audited=load(instrument).prepared;
let checked=0,branches=0,slowBranches=0,forceTwoQueries=0;
function verify(entry,action,expected){
 const before=JSON.stringify(entry),actual=audited(E,C,entry,action),old=compact(E,C,entry,action);
 for(const field of fields){assert(Math.abs(actual.probabilities[field]-expected.probabilities[field])<1e-10,field);assert(Math.abs(actual.probabilities[field]-old.probabilities[field])<1e-10,field);}
 for(const field of ['states','branches','terminalShapes']){assert.equal(actual[field],old[field]);assert.equal(actual[field],expected[field]);}
 assert.equal(actual.checked,actual.terminalShapes);assert.equal(JSON.stringify(entry),before);checked+=actual.checked;branches+=actual.branches;return actual;
}
for(const f of R['verification-boundaries-with-fixtures'].rows){
 const actual=verify(f.entry,f.action,f);
 if(f.slowRecomputed){const slow=distribution(E,C,f.entry,f.action);slowBranches+=slow.branches;for(const field of fields)assert(Math.abs(actual.probabilities[field]-slow.probabilities[field])<1e-10);}
 for(const key of actual.transitionKeys){const ma=key>>1&3,md=key>>3&3,fa=key>>5&3,fd=key>>7&3;if(fa===2||fd===2)forceTwoQueries++;
  const next=copy(f.entry);E.move(next,f.action.id,f.action.x,f.action.y);for(const [id,mask,force]of [[next.duel.a,ma,fa],[next.duel.d,md,fd]]){const p=E.get(next,id);p.hp=18;p.exhausted=p.learned.filter((card,i)=>mask&1<<i);next.duel[id===next.duel.a?'forceA':'forceD']=force;}
  for(const [side,force]of [[f.entry.turn,fa],[E.OTHER[f.entry.turn],fd]])if(force===2)assert(C.practicePlan(next,side).every(p=>(E.BASE[p.id]||E.CARDS[p.id]).type!=='focus'));
 }
 console.log(JSON.stringify({case:f.name,checked:actual.checked}));
}
assert.equal(checked,39162);assert.equal(branches,4765617);assert.equal(slowBranches,16002);assert.equal(forceTwoQueries,673);
const invalidBase=R['verification-boundaries-with-fixtures'].rows.find(r=>r.name==='pawn-cannon-supported');
const invalids=[e=>E.get(e,'a').hp=19,e=>E.get(e,'a').learned.push('pawn_other'),e=>E.get(e,'a').kind='king',e=>e.scenario='challenge-support',e=>e.pieces=e.pieces.filter(p=>p.id!=='red_king'),e=>e.pieces=e.pieces.filter(p=>p.id!=='black_king')];
for(const change of invalids){const entry=copy(invalidBase.entry);change(entry);const before=JSON.stringify(entry);assert.throws(()=>audited(E,C,entry,invalidBase.action));assert.equal(JSON.stringify(entry),before);}
const original=require('./rescue-distribution-0.6.133.json').cases;
for(const [name,helper]of [['forward',load(data.helpers.forward.source).forward],['grouped',load(data.helpers.grouped.source).grouped]])for(const f of original){const actual=helper(E,C,f.entry,f.action);for(const field of fields)assert(Math.abs(actual.probabilities[field]-f.slow.probabilities[field])<1e-10,name+': '+field);}
const matrixBytes=fs.readFileSync(path.join(__dirname,'balance-0.6.136.json.gz'));assert.equal(hash(matrixBytes),R['real-query-plan'].matrixSHA256);const matrix=JSON.parse(zlib.gunzipSync(matrixBytes)),runs=matrix.reports.flatMap(r=>r.runs),selected=[];let replayed=0,boardStates=0;
for(const scenario of ['quick','full']){
 const group=runs.filter(r=>r.input.difficulty==='practice'&&r.input.scenario===scenario);
 for(let n=0;n<6;n++){
  const index=Math.round(n*(group.length-1)/5),run=group[index];let state,most=null,last=null;
  for(const [commandIndex,[op,...args]]of run.commands.entries()){
   if(state?.phase==='board'){
    boardStates++;const attacks=state.pieces.filter(p=>p.side===state.turn&&p.kind!=='king').flatMap(p=>E.moves(state,p).filter(m=>m.capture&&E.at(state,m.x,m.y).kind!=='king').map(m=>({type:'move',id:p.id,x:m.x,y:m.y}))),eligible=attacks.filter(a=>{const outlook=C.battleOutlook(state,E.context(state,E.get(state,a.id),E.at(state,a.x,a.y)));return !outlook.finishes.length&&!outlook.counters.length;});
    if(eligible.length){const row={scenario,index,input:run.input,commandIndex,stateSHA256:hash(JSON.stringify(state)),entry:copy(state),attacks:copy(attacks),eligible:copy(eligible),historyKeys:Object.keys(state.repetitions).length};if(!most||eligible.length>most.eligible.length)most=row;last=row;}
   }
   if(op==='create')state=E.create(...args);else E[op](state,...args);replayed++;
  }
  assert.equal(hash(JSON.stringify(state)),run.terminalSHA256);selected.push({...most,selectedFor:'most-forecasts'});if(last.commandIndex!==most.commandIndex)selected.push({...last,selectedFor:'latest-with-forecast'});
 }
}
assert.deepEqual(selected,R['real-queries'].selected);assert.equal(replayed,4634);assert.equal(boardStates,3496);
for(const [index,f]of selected.entries())for(const [i,action]of f.attacks.entries()){const expected=R['verification-real'].rows[index].results[i];assert.deepEqual(action,expected.action);verify(f.entry,action,expected);}
assert.equal(checked,87099);assert.equal(branches,9996062);
const median=values=>{const xs=[...values].sort((a,b)=>a-b);assert.equal(xs.length,10);return (xs[4]+xs[5])/2;};
for(const name of ['timing','timing-grouped','timing-prepared','timing-real-with-selection-overhead','timing-real']){
 const timing=R[name];assert.equal(timing.cpuProfile,false);assert.equal(timing.serial,true);assert.equal(timing.warmups,3);assert.equal(timing.repetitions,10);
 for(const row of timing.rows)for(const [mode,summary]of Object.entries(row.summary)){assert.equal(median(row.samples.map(s=>s[mode].elapsedMs)),summary.median);assert.equal(Math.max(...row.samples.map(s=>s[mode].elapsedMs)),summary.maximum);}
}
const timing=R['timing-real'];assert.deepEqual(timing.gates,{medianMs:50,maxMs:100});assert.equal(timing.rows.length,24);
for(const row of timing.rows)assert.equal(row.passed,row.summary.prepared.median<=50&&row.summary.prepared.maximum<=100);assert.equal(timing.rows.filter(r=>r.passed).length,18);assert.equal(timing.passed,false);
assert.equal(data.adopted,false);assert.equal(data.productionModified,false);assert.equal(data.newIndependentStarts,0);assert.equal(16*original.slice(0,4).reduce((n,f)=>n+f.compact.branches,0),8739968);
console.log(JSON.stringify({boundaryCases:39,realQueries:24,realForecasts:76,terminalChecks:checked,branches,slowBranches,replayed,boardStates,performanceQueriesPassed:18,performanceQueriesFailed:6,adopted:false,timingRecomputed:false}));
