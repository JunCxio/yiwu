const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'data/opening-value-0.6.146.json.gz')))),html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(r=>r[1]);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),plan=data.trialPlan,runs=data.runs,groups=['primary','confirmation'],read=name=>data[name.replace('.json','')],paths={baseline:'baseline',candidate:'candidate'};
assert.equal(hash(html),data.releaseSHA256);assert.equal(hash(scripts[0]),data.ruleScriptSHA256);assert.equal(hash(scripts[1]),data.computerScriptSHA256);assert.equal(hash(data.baselineComputer),data.baselineComputerSHA256);assert.equal(runs.length,128);
function engine(model){const box=vm.createContext({});vm.runInContext(scripts[0],box);vm.runInContext(model==='baseline'?data.baselineComputer:scripts[1],box);return {E:box.Yiwu,C:box.YiwuComputer};}
const fresh=new Set(),excluded=new Set(plan.excludedSeeds),inputs=[];
for(const root of plan.roots){
  for(const role of ['A','B']){const n=crypto.createHash('sha256').update([plan.seedLabel,root.group,root.scenario,root.replicate,role].join(':')).digest().readUInt32LE(0);assert.equal(n,root['seed'+role]);assert(!fresh.has(n)&&!excluded.has(n));fresh.add(n);}
  for(const models of [{red:'baseline',black:'baseline'},{red:'candidate',black:'baseline'},{red:'baseline',black:'candidate'},{red:'candidate',black:'candidate'}])inputs.push({...root,models});
}
assert.deepEqual(plan.inputs,inputs);assert.deepEqual(plan.newSeeds,[...fresh].sort((a,b)=>a-b));assert.equal(fresh.size,64);assert.equal(plan.roots.length,32);
for(const group of groups){
  const summary=read(group+'.json'),subset=runs.filter(r=>r.input.group===group);assert.equal(subset.length,64);assert.equal(summary.commands,subset.reduce((n,r)=>n+r.commands.length,0));
  for(const row of summary.summary){
    const rs=subset.filter(r=>r.input.scenario===row.scenario),baseline=rs.filter(r=>Object.values(r.input.models).every(v=>v==='baseline')),candidate=rs.filter(r=>Object.values(r.input.models).every(v=>v==='candidate')),direct=rs.filter(r=>r.input.models.red!==r.input.models.black);
    assert.equal(direct.length,16);assert.equal(direct.reduce((n,r)=>n+(r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),0),row.direct.points);
    for(const [name,values]of [['baseline',baseline],['candidate',candidate]]){assert.equal(values.length,8);assert.equal(values.reduce((n,r)=>n+r.plies,0)/values.length,row[name].mean);assert.equal(values.filter(r=>r.winner==='draw').length,row[name].draws);assert.equal(Math.max(...values.map(r=>r.plies)),row[name].max);}
    assert.equal(row.checks.direct,row.direct.points>=plan.acceptance.primary.directPointsPerScenarioAtLeast);
    assert.equal(row.checks.mean,row.candidate.mean<=row.baseline.mean*plan.acceptance.primary.selfPlayMeanRatioAtMost);
    assert.equal(row.checks.draws,row.candidate.draws<=row.baseline.draws+plan.acceptance.primary.selfPlayExtraDrawsPerScenarioAtMost);
    assert.equal(row.passed,Object.values(row.checks).every(Boolean));
  }
  assert.equal(summary.passed,summary.summary.every(r=>r.passed));
}
const random=value=>()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
let games=0,commands=0,boardChoices=0,combatChoices=0,rounds=0;const results=[];
for(const run of runs){
  const {E,C}=engine(paths.baseline),other=engine(paths.candidate).C,controller=side=>run.input.models[side]==='candidate'?other:C,rng={[run.input.aSide]:random(run.input.seedA),[E.OTHER[run.input.aSide]]:random(run.input.seedB)};let s,activity,started=false,reversals=0;const last=new Map();
  for(const [index,[op,...args]]of run.commands.entries()){
    if(s?.phase==='board'){
      const action=controller(s.turn).board(s,rng[s.turn],run.input.difficulty);assert.equal(action.type,op);
      if(op==='move')assert.deepEqual([action.id,action.x,action.y],args);else if(op==='rest')assert.deepEqual([action.id,action.card],args);else assert.equal(op,'pass');boardChoices++;
    }else if(s?.phase==='duel'){
      const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),choice=controller(a.side).combat(s,a.side,rng[a.side],run.input.difficulty);combatChoices++;
      if(op==='retreat')assert.equal(choice,'retreat');else{assert.equal(op,'resolve');assert.equal(choice,args[0]);assert.equal(controller(d.side).combat(s,d.side,rng[d.side],run.input.difficulty),args[1]);combatChoices++;}
    }
    if(op==='create'){assert.equal(index,0);s=E.create(...args);activity=Object.fromEntries(Array.from(s.pieces,p=>[p.id,{side:p.side,kind:p.kind,cards:[],moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));}
    else{
      assert(s.phase!=='ended');
      if(op==='move'){const p=E.get(s,args[0]),target=E.at(s,args[1],args[2]);if(target){activity[p.id].attacks++;activity[target.id].defenses++;last.delete(p.id);}else{activity[p.id].moves++;const prev=last.get(p.id);if(prev&&prev[0]===args[1]&&prev[1]===args[2])reversals++;last.set(p.id,[p.x,p.y]);}}
      if(op==='rest')activity[args[0]].rests++;
      if(op==='resolve'){
        const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args);activity[a.id].damage+=Math.min(d.hp,r.toD);activity[d.id].damage+=Math.min(a.hp,r.toA);
        if(r.toD>=d.hp)activity[a.id].captures++;if(r.toA>=a.hp)activity[d.id].captures++;if(E.CARDS[args[0]])activity[a.id].cardUses++;if(E.CARDS[args[1]])activity[d.id].cardUses++;rounds++;
      }
      E[op](s,...args);
      if(op==='start'){assert(!started);assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);assert(s.pieces.every(p=>p.learned.length<=2&&p.hp===18));for(const p of s.pieces)activity[p.id].cards=Array.from(p.learned);started=true;}
    }
    commands++;
  }
  assert(started);assert.equal(s.phase,'ended');assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);assert.equal(reversals,run.reversals);
  for(const key of ['moves','rests'])assert.equal(Object.values(activity).reduce((n,p)=>n+p[key],0),run[key]);assert.equal(Object.values(activity).reduce((n,p)=>n+p.attacks,0),run.battles);assert.equal(run.moves+run.rests+run.passes+run.battles,run.plies);
  for(const [op,key]of [['resolve','rounds'],['retreat','retreats'],['pass','passes']])assert.equal(run.commands.filter(c=>c[0]===op).length,run[key]);
  games++;results.push({input:run.input,terminalSHA256:run.terminalSHA256});if(games%8===0)console.log(JSON.stringify({verified:games,total:runs.length}));
}
assert.equal(games,128);assert(data.primary.passed&&data.confirmation.passed);for(const key of ['games','commands','boardChoices','combatChoices','rounds'])assert.equal({games,commands,boardChoices,combatChoices,rounds}[key],data.verification[key]);console.log(JSON.stringify({passed:true,games,commands,boardChoices,combatChoices,rounds,allChoicesAndActivityAndTerminalStatesMatch:true}));
