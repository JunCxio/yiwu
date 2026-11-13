const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),read=name=>fs.readFileSync(path.join(__dirname,name)),packed=read('battle-score-trial-0.6.137.json.gz');assert.equal(hash(packed),'0718ae085a4c1c9c069d767b9da275ecd62beedf00444b3d7053e5e40684514b');const data=JSON.parse(zlib.gunzipSync(packed)),R=data.records;
const previous=read('battle-forecast-0.6.137.json.gz');assert.equal(hash(previous),data.previousBundleSHA256);const prior=JSON.parse(zlib.gunzipSync(previous));
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'));assert.equal(hash(html),data.sourceSHA256,'请提供报告指定的0.6.137入口');
for(const h of Object.values(data.helpers))assert.equal(hash(h.source),h.SHA256);for(const c of Object.values(data.computers))assert.equal(hash(c.source),c.SHA256);
assert.equal(data.helpers.selective.SHA256,R['scope-selective'].helperSHA256);assert.equal(data.computers.scored.SHA256,R['scope-selective'].candidateComputerSHA256);
const tempParent=path.resolve(os.tmpdir()),root=path.resolve(fs.mkdtempSync(path.join(tempParent,'yiwu-battle-score-')));assert.equal(path.dirname(root),tempParent);assert(path.basename(root).startsWith('yiwu-battle-score-'));
function write(relative,body){const target=path.resolve(root,relative);assert(target.startsWith(root+path.sep));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);}
const current='work/battle-forecast-share-v06137/',old='work/battle-forecast-v06137/';
try{
 write('github-release/index.html',html);
 for(const name of ['merged','selective'])write(current+name+'.cjs',data.helpers[name].source);
 write(current+'scored-computer.js',data.computers.scored.source);
 for(const name of ['scope-merged','scope-selective'])write(current+name+'.json',JSON.stringify(R[name]));
 for(const name of ['verify-merged','verify-scored','verify-history-score','diagnose-score'])write(current+name+'.cjs',data.methods[name]);
 write(old+'prepared.cjs',prior.helpers.prepared.source);write(old+'scope-prepared.json',JSON.stringify(prior.records['scope-prepared']));write(old+'audit-prepared.cjs',prior.methods['audit-prepared']);
 for(const name of ['verification-boundaries-with-fixtures','real-queries','verification-real'])write(old+name+'.json',JSON.stringify(prior.records[name]));
 const stages=[['verify-merged',[],['verification-merged']],['verify-scored',['selective'],['verification-selective-final']],['verify-history-score',['selective'],['selective-history-fixtures','selective-history-verification']],['diagnose-score',[],['score-diagnostic']]];
 for(const [method,args,outputs]of stages){
  const run=spawnSync(process.execPath,[path.join(root,current+method+'.cjs'),...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr||run.stdout);
  for(const name of outputs)assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,current+name+'.json'),'utf8')),R[name],name);
  console.log(JSON.stringify({method,verified:true}));
 }
}finally{
 assert.equal(path.dirname(root),tempParent);assert(path.basename(root).startsWith('yiwu-battle-score-'));fs.rmSync(root,{recursive:true,force:true});
}
const median=values=>{const xs=[...values].sort((a,b)=>a-b);assert.equal(xs.length,10);return (xs[4]+xs[5])/2;};
for(const name of ['dense','merged','indexed','scoped','scored','selective']){
 const timing=R['timing-'+name];assert.equal(timing.cpuProfile,false);assert.equal(timing.serial,true);assert.equal(timing.warmups,3);assert.equal(timing.repetitions,10);assert.deepEqual(timing.gates,{medianMs:50,maxMs:100});assert.equal(timing.rows.length,24);
 for(const row of timing.rows){for(const [mode,summary]of Object.entries(row.summary)){assert.equal(median(row.samples.map(s=>s[mode].elapsedMs)),summary.median);assert.equal(Math.max(...row.samples.map(s=>s[mode].elapsedMs)),summary.maximum);}assert.equal(row.passed,row.summary[name].median<=50&&row.summary[name].maximum<=100);}
 assert.equal(timing.passed,false);assert.equal(timing.rows.filter(r=>r.passed).length,R.summary.timing.find(r=>r.name===name).passed);
}
for(const [index,row]of R['verification-selective-final'].rows.entries())assert(Math.abs(row.score-R['verification-scored-final'].rows[index].score)<1e-10,row.name);
assert.equal(R['verification-merged'].transitionsChecked,50390);assert.equal(R['verification-merged'].branches,9996062);assert.equal(R['verification-merged'].edges,7702308);assert.equal(R['verification-selective-final'].terminalChecks,87099);assert.equal(R['selective-history-verification'].rows.reduce((n,r)=>n+r.checked,0),724);
assert.equal(data.adopted,false);assert.equal(data.productionModified,false);assert.equal(data.newIndependentStarts,0);console.log(JSON.stringify({mergedTransitionsChecked:50390,scoreTerminalsChecked:87099,futureHistoryTerminalsChecked:724,rankings:24,selectivePerformancePassed:18,selectivePerformanceFailed:6,adopted:false,timingRecomputed:false}));
