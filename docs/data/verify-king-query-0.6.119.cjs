const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
const source=fs.readFileSync(process.argv[2]||path.join(root,'index.html'),'utf8');
const baseline=(process.argv[3]?fs.readFileSync(process.argv[3]):execFileSync('git',['show','e7c89cdbaccb062e8cbd00f4340dea29bc47aff3:index.html'],{cwd:root,maxBuffer:1024*1024})).toString();
assert.equal(hash(baseline),'18c0c27338fe557deea91d1a57445446d11c2522c6f00d73cdba3d7eb0744230');
const block=html=>html.match(/  function advanceTrapsKing\([^]*?\n  \}/)[0];
assert.equal(source.replaceAll('0.6.119','0.6.118').replace('· 协同查询提速','· 结算按钮适配').replace(block(source),'FUNCTION'),baseline.replace(block(baseline),'FUNCTION'),'改动范围只能包含协同预筛与版本标识');
function model(html){const box=vm.createContext({});for(const m of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);return {E:box.Yiwu,C:box.YiwuComputer};}
const before=model(baseline),after=model(source),E=before.E;
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const packet=JSON.parse(fs.readFileSync(path.join(__dirname,'capture-followup-0.6.118.json'))),totals={games:0,commands:0,boardChoices:0,combatChoices:0,rankings:0,randomBoundaries:0};
assert.equal(hash(fs.readFileSync(path.join(__dirname,'capture-followup-0.6.118.json'))),'bf66530fa95652baf9ec829cce02a12a9b8f548c27daa3f0fda69f3275878f2d');
const commandFor=a=>[a.type,...(a.type==='pass'?[]:a.type==='rest'?[a.id,a.card]:[a.id,a.x,a.y])];
for(const [runIndex,run]of packet.report.runs.entries()){
  const input=run.input,makeRandom=()=>({[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)}),rng={before:makeRandom(),after:makeRandom()};let s;
  for(const [index,command]of run.commands.entries()){
    const [op,...args]=command;totals.commands++;
    if(op==='create'){s=E.create(...args);continue;}
    if(['learn','start'].includes(op)){E[op](s,...args);continue;}
    const raw=JSON.stringify(s);
    if(s.phase==='board'){
      if(index%41===0){
        assert.deepEqual(copy(after.C.rankedActions(s)),copy(before.C.rankedActions(s)));totals.rankings++;
        // 两种近分池边界共用原有采样代码；定点比较练习与标准的选择和评分。
        if(totals.rankings%9===0)for(const difficulty of ['practice','standard'])for(const roll of [0,.25,.5,.75,.999999]){
          assert.deepEqual(copy(after.C.board(s,()=>roll,difficulty)),copy(before.C.board(s,()=>roll,difficulty)));totals.randomBoundaries++;
        }
      }
      let a=after.C.board(s,rng.after[s.turn],'standard'),b=before.C.board(s,rng.before[s.turn],'standard');totals.boardChoices++;
      assert.deepEqual(copy(a),copy(b));
      if(input.force&&s.ply+1===input.force.ply){assert.equal(index,input.force.index);assert.deepEqual(copy(a),input.force.expected);a=input.force.action;}
      assert.deepEqual(commandFor(a),command);
    }else{
      assert.equal(s.phase,'duel');const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
      const id=after.C.combat(s,a.side,rng.after[a.side],'standard');assert.equal(id,before.C.combat(s,a.side,rng.before[a.side],'standard'));totals.combatChoices++;
      if(id==='retreat')assert.deepEqual(command,['retreat']);
      else{
        const reply=after.C.combat(s,d.side,rng.after[d.side],'standard');assert.equal(reply,before.C.combat(s,d.side,rng.before[d.side],'standard'));totals.combatChoices++;
        assert.deepEqual(command,['resolve',id,reply]);
      }
    }
    assert.equal(JSON.stringify(s),raw);E[op](s,...args);
  }
  assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);totals.games++;
  console.log(JSON.stringify({verified:totals.games,plies:s.ply,winner:s.winner}));
}
assert.equal(totals.games,9);assert.equal(totals.commands,4939);assert.equal(totals.boardChoices,3946);assert.equal(totals.combatChoices,1513);
console.log(JSON.stringify({sourceSHA256:hash(source),...totals,identical:true}));
