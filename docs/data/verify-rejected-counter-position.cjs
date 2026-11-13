const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),vm=require('node:vm'),assert=require('node:assert/strict'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const bytes=fs.readFileSync(__dirname+'/rejected-counter-position-0.6.133.json.gz');assert.equal(hash(bytes),'8c03dd71d258de2aa08e40a5d9fe9e9e957bacdce454aef952d40594b33010fa');const data=JSON.parse(zlib.gunzipSync(bytes));
const source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8'),script=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];assert.equal(hash(script),data.engineSHA256,'规则版本不一致');const box=vm.createContext({});vm.runInContext(script,box);const E=box.Yiwu;
assert.equal(data.runs.length,136);assert.equal(data.plan.excludedSeeds.length,5724);assert.equal(new Set(data.plan.newSeeds).size,64);assert(data.plan.newSeeds.every(seed=>!data.plan.excludedSeeds.includes(seed)));assert.equal(new Set([...data.plan.excludedSeeds,...data.plan.newSeeds]).size,5788);
let commands=0,plies=0,rounds=0;
for(const [index,run]of data.runs.entries()){
  assert.deepEqual(run.input,data.plan.inputs[index]);let s;
  for(const [op,...args]of run.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);commands++;if(op==='resolve')rounds++;}
  assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);plies+=s.ply;
}
for(const [name,row]of Object.entries(data.summary.summary))assert.equal(row.passedGates,row.direct.points>=8&&row.candidate.meanPlies<=row.baseline.meanPlies&&row.candidate.maxPlies<=row.baseline.maxPlies,name);
assert.equal(commands,48036);assert.equal(plies,36530);assert.equal(rounds,8254);assert.deepEqual(data.summary.decision.failedGates,['standard-full','practice-full']);assert.equal(data.summary.decision.adopted,false);console.log(JSON.stringify({verified:true,games:136,commands,plies,rounds,adopted:false}));
