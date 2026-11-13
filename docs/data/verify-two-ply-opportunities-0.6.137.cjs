const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const read=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,name)))),recorded=read('two-ply-opportunities-0.6.137.json.gz'),audit=recorded.audit,hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8'),matrix=read('balance-0.6.136.json.gz'),box=vm.createContext({});assert.equal(hash(source),recorded.sourceSHA256,'请传入报告指定的0.6.137源码');
for(const m of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);const E=box.Yiwu,V={king:60,rook:9,cannon:8,horse:8,pawn:6,guard:6,elephant:6};
const actions=s=>s.pieces.filter(p=>p.side===s.turn).flatMap(p=>[...E.moves(s,p).map(m=>({type:'move',id:p.id,x:m.x,y:m.y})),...p.exhausted.map(card=>({type:'rest',id:p.id,card}))]),legal=(s,p)=>Object.keys(E.BASE).concat(p.learned).filter(id=>!E.availability(s,p,id,s.duel));
function apply(state,a){const next=copy(state);E[a.type](next,...(a.type==='move'?[a.id,a.x,a.y]:a.type==='rest'?[a.id,a.card]:[]));return next;}
const certificates=[];let commandCount=0,alternativeCount=0,replyCount=0,roundBranches=0,noAttackWitnesses=0,terminalAlternatives=0;
function verifyNoOpportunity(state){
 const counters=[];let attacks=0;
 for(const a of actions(state)){
  if(a.type!=='move')continue;const target=E.at(state,a.x,a.y);if(!target)continue;attacks++;const attacker=E.get(state,a.id),duel=apply(state,a),mine=legal(duel,E.get(duel,a.id)),theirs=legal(duel,E.get(duel,target.id));
  for(const id of mine){let deniesCapture=null,deniesExchange=null;
   for(const reply of theirs){
    const next=copy(duel);E.resolve(next,id,reply);roundBranches++;const hpA=E.get(next,a.id)?.hp||0,hpD=E.get(next,target.id)?.hp||0,margin=(target.hp-hpD)*V[target.kind]-(attacker.hp-hpA)*V[attacker.kind];
    if(!deniesCapture&&(hpA===0||hpD>0))deniesCapture={reply,hpA,hpD};
    if(!deniesExchange&&(hpA===0||hpD===target.hp||margin<0))deniesExchange={reply,hpA,hpD,margin};
   }
   assert(deniesCapture,'反例中仍有首轮存活吃子，需展开战后安全');assert(deniesExchange,'反例中仍有首轮非负交换');counters.push({action:a,id,deniesCapture,deniesExchange});
  }
 }
 if(!attacks)noAttackWitnesses++;return counters;
}
for(const [group,pace]of Object.entries(matrix.paceAudit.summary)){
 const run=matrix.reports.flatMap(r=>r.runs).find(r=>JSON.stringify(r.input)===JSON.stringify(pace.longest.input));let s;
 for(const [commandIndex,[op,...args]]of run.commands.entries()){
  if(s?.phase==='board'&&s.ply>=run.plies-80){
   const before=JSON.stringify(s),row=audit.rows.find(r=>r.group===group&&r.commandIndex===commandIndex);assert(row);const quiet=actions(s).filter(a=>a.type!=='move'||!E.at(s,a.x,a.y));assert.deepEqual(copy(quiet),row.alternatives.map(a=>a.action));
   for(const alt of row.alternatives){alternativeCount++;const next=apply(s,alt.action);
    if(next.phase==='ended'){assert.equal(next.winner,alt.terminal);assert.notEqual(next.winner,s.turn);terminalAlternatives++;continue;}
    let responses=actions(next);if(!responses.length)responses=[{type:'pass'}];replyCount+=responses.length;
    assert.equal(responses.filter(a=>a.type==='move'&&E.at(next,a.x,a.y)).length,alt.opponentCombat);const quietResponses=responses.filter(a=>a.type!=='move'||!E.at(next,a.x,a.y));assert.deepEqual(copy(quietResponses),alt.branches.map(b=>b.reply));
    const witness=alt.branches.find(b=>!b.capture&&!b.exchange&&b.terminal!==s.turn);assert(witness);const after=apply(next,witness.reply);let counters=[];
    if(after.phase==='ended')assert.notEqual(after.winner,s.turn);else counters=verifyNoOpportunity(after);
    certificates.push({group,commandIndex,ply:s.ply,side:s.turn,stateSHA256:hash(before),action:alt.action,response:witness.reply,terminal:after.phase==='ended'?after.winner:null,counters});
   }
   assert.equal(JSON.stringify(s),before);
  }
  if(op==='create')s=E.create(...args);else E[op](s,...args);commandCount++;
 }assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);
}
assert.equal(commandCount,audit.commands);assert.equal(alternativeCount,audit.positions);assert.equal(replyCount,audit.responses);assert.equal(certificates.length+terminalAlternatives,2697);
const result={sourceSHA256:hash(source),sourceStates:audit.rows.length,commandCount,alternativeCount,replyCount,roundBranches,noAttackWitnesses,terminalAlternatives,certificates};assert.deepEqual(result,recorded.verification);console.log(JSON.stringify({...result,certificates:undefined}));
