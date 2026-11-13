const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),read=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,name))));
const recorded=read('formation-warning-0.6.137.json.gz'),matrix=read('balance-0.6.136.json.gz'),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8');
assert.equal(hash(source),recorded.sourceSHA256,'请传入报告指定的0.6.137源码');assert.equal(hash(matrix.sourceText),recorded.baselineSHA256);
function engine(html){const box=vm.createContext({});for(const m of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);return {E:box.Yiwu,C:box.YiwuComputer};}
const legacy=engine(matrix.sourceText),current=engine(source),{E,C}=current,all=matrix.reports.flatMap(r=>r.runs),snapshots=[],queryRows=[],groups={};let commands=0,queries=0,projections=0,boardChoices=0;
for(const [group,pace]of Object.entries(matrix.paceAudit.summary)){
 const index=matrix.plan.inputs.findIndex(input=>JSON.stringify(input)===JSON.stringify(pace.longest.input)),run=all.find(r=>JSON.stringify(r.input)===JSON.stringify(pace.longest.input));assert(index>=0&&run);let s;groups[group]=0;
 for(const [commandIndex,command]of run.commands.entries()){
  if(s?.phase==='board'&&s.ply>=run.plies-80){
   const raw=JSON.stringify(s),ranked=copy(C.rankedActions(s));assert.deepEqual(ranked,copy(legacy.C.rankedActions(s)));queries++;
   const own=new Set(s.pieces.filter(p=>p.side===s.turn).map(p=>p.id)),form=key=>{const [turn,ps]=JSON.parse(key);return JSON.stringify([turn,ps.map(([id,x,y,...rest])=>own.has(id)?[id,x,y,...rest]:[id,...rest])]);};
   const count=next=>{const key=form(E.key(next));return Object.entries(s.repetitions).reduce((n,[historical,times])=>n+(form(historical)===key?times:0),0);};
   for(const a of ranked.filter(a=>a.type!=='move'||!E.at(s,a.x,a.y))){const next=copy(s);E[a.type](next,...(a.type==='move'?[a.id,a.x,a.y]:[a.id,a.card]));if(next.phase!=='board'){assert.equal(C.formationRepeats(s,next),0);continue;}assert.equal(C.formationRepeats(s,next),count(next));projections++;}
   const [op,...args]=command,next=copy(s);E[op](next,...args);const battle=op==='move'&&!!E.at(s,args[1],args[2]);if(!battle&&next.phase==='board'&&count(next)>0&&!s.repetitions[E.key(next)])groups[group]++;
   assert.equal(JSON.stringify(s),raw);if(!snapshots.some(r=>r.index===index))snapshots.push({index,state:copy(s)});queryRows.push({index,commandIndex,stateSHA256:hash(raw),rankedSHA256:hash(JSON.stringify(ranked))});
  }
  const [op,...args]=command;if(op==='create')s=E.create(...args);else E[op](s,...args);commands++;
 }
 assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);
}
for(const {state}of snapshots)for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){const before=JSON.stringify(state);assert.deepEqual(copy(C.board(state,()=>roll,difficulty)),copy(legacy.C.board(state,()=>roll,difficulty)));assert.equal(JSON.stringify(state),before);boardChoices++;}
const result={oldHistoryGames:snapshots.length,commands,queries,projections,boardChoices,inputUnchanged:true,allRankingsExactlyMatch:true};
for(const [key,value]of Object.entries(result))assert.equal(recorded.verification[key],value);assert.deepEqual(queryRows,recorded.verification.queryRows);
for(const [group,n]of Object.entries(groups))assert.equal(recorded.audit.summary[group].repeatedOwnButNewFull,n);
assert.equal(Object.values(groups).reduce((a,b)=>a+b,0),40);console.log(JSON.stringify({...result,newFullPositionWithRepeatedOwnFormation:groups}));
