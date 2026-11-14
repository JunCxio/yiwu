const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x)),data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'data','practice-king-guard-0.6.144.json.gz'))));
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(hash(html),data.release.SHA256,'请使用0.6.144对应入口');assert.equal(hash(scripts[0]),data.release.ruleScriptSHA256);assert.equal(hash(scripts[1]),data.release.computerScriptSHA256);
function engine(computer){const box=vm.createContext({});vm.runInContext(scripts[0],box);vm.runInContext(computer,box);return {E:box.Yiwu,C:box.YiwuComputer};}
const old=engine(data.baselineComputer),current=engine(scripts[1]),E=current.E;
function rotate(s){s=copy(s);s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}for(const key of ['origin','target']){s.duel[key].x=8-s.duel[key].x;s.duel[key].y=9-s.duel[key].y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...tail])=>[id,8-x,9-y,...tail])]),n];}));return s;}
const states=data.audit.rows.flatMap(row=>[copy(row.state),rotate(row.state)]),fatal=data.audit.rows.find(row=>row.actualLostNow&&row.safe.length&&!row.safe.includes(row.actual));assert(fatal);
for(const alter of [s=>{s.scenario='challenge-support';},s=>{E.get(s,E.get(s,s.duel.a).kind==='king'?s.duel.a:s.duel.d).kind='rook';},s=>{s.duel.round=6;s.quiet=79;},s=>{E.get(s,s.duel.a).hp=1;E.get(s,s.duel.d).hp=1;},s=>{E.get(s,s.duel.a).hp=18;E.get(s,s.duel.d).hp=18;}]){const state=copy(fatal.state);alter(state);states.push(state);}
const mutual=E.create('attrition');mutual.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',4,0)];mutual.pieces.forEach(p=>p.hp=1);mutual.repetitions={};E.move(mutual,'rk',4,0);states.push(mutual);
let planChecks=0,realBranches=0,changedPlans=0;
for(const s of states){const before=JSON.stringify(s),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);for(const p of [a,d]){
  let expected=copy(old.C.practicePlan(s,p.side));const previous=JSON.stringify(expected);
  if(p.kind==='king'&&!E.CHALLENGES[s.scenario]&&!expected.some(x=>x.id==='retreat')){
    const enemy=p.id===a.id?d:a,ids=current.C.choices(s,p,s.duel),replies=current.C.choices(s,enemy,s.duel),safe=ids.filter(id=>replies.every(reply=>{const next=copy(s);E.resolve(next,p.id===a.id?id:reply,p.id===a.id?reply:id);realBranches++;return !(next.phase==='ended'&&next.winner===enemy.side);}));
    if(safe.length){const types=[...new Set(safe.map(id=>(E.BASE[id]||E.CARDS[id]).type))];expected=safe.map(id=>({id,weight:1/types.length/safe.filter(other=>(E.BASE[other]||E.CARDS[other]).type===(E.BASE[id]||E.CARDS[id]).type).length}));}
  }
  const actual=copy(current.C.practicePlan(s,p.side));assert.deepEqual(actual,copy(expected));if(JSON.stringify(actual)!==previous)changedPlans++;assert(actual.length&&actual.every(x=>Number.isFinite(x.weight)&&x.weight>0));assert(Math.abs(actual.reduce((n,x)=>n+x.weight,0)-1)<1e-9);assert.deepEqual(copy(current.C.combatPlan(s,p.side)),copy(old.C.combatPlan(s,p.side)));assert.equal(JSON.stringify(s),before);planChecks++;
}}
assert.equal(states.length,400);assert.equal(planChecks,800);assert.equal(realBranches,6071);assert.equal(changedPlans,17);
const random=value=>()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};let commands=0,boardChoices=0,combatChoices=0,rounds=0,games=0;
for(const [index,run]of data.runs.entries()){
  if(index<128)assert.deepEqual(run.input,data.trialPlan.inputs[index]);
  const {E,C}=engine(data.baselineComputer),candidate=engine(scripts[1]).C,controller=side=>run.input.models[side]==='candidate'?candidate:C,rng={[run.input.aSide]:random(run.input.seedA),[E.OTHER[run.input.aSide]]:random(run.input.seedB)};let s,activity,started=false,reversals=0;const last=new Map();
  for(const [commandIndex,[op,...args]]of run.commands.entries()){
    if(s?.phase==='board'){const action=controller(s.turn).board(s,rng[s.turn],run.input.difficulty);assert.equal(action.type,op);if(op==='move')assert.deepEqual([action.id,action.x,action.y],args);else if(op==='rest')assert.deepEqual([action.id,action.card],args);else assert.equal(op,'pass');boardChoices++;}
    else if(s?.phase==='duel'){const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),choice=controller(a.side).combat(s,a.side,rng[a.side],run.input.difficulty);combatChoices++;if(op==='retreat')assert.equal(choice,'retreat');else{assert.equal(op,'resolve');assert.equal(choice,args[0]);assert.equal(controller(d.side).combat(s,d.side,rng[d.side],run.input.difficulty),args[1]);combatChoices++;}}
    if(op==='create'){assert.equal(commandIndex,0);s=E.create(...args);activity=Object.fromEntries(Array.from(s.pieces,p=>[p.id,{side:p.side,kind:p.kind,cards:[],moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));}
    else{
      assert(s.phase!=='ended');
      if(op==='move'){const p=E.get(s,args[0]),target=E.at(s,args[1],args[2]);if(target){activity[p.id].attacks++;activity[target.id].defenses++;last.delete(p.id);}else{activity[p.id].moves++;const prev=last.get(p.id);if(prev&&prev[0]===args[1]&&prev[1]===args[2])reversals++;last.set(p.id,[p.x,p.y]);}}
      if(op==='rest')activity[args[0]].rests++;
      if(op==='resolve'){const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args);activity[a.id].damage+=Math.min(d.hp,r.toD);activity[d.id].damage+=Math.min(a.hp,r.toA);if(r.toD>=d.hp)activity[a.id].captures++;if(r.toA>=a.hp)activity[d.id].captures++;if(E.CARDS[args[0]])activity[a.id].cardUses++;if(E.CARDS[args[1]])activity[d.id].cardUses++;rounds++;}
      E[op](s,...args);if(op==='start'){assert(!started);assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);assert(s.pieces.every(p=>p.learned.length<=2&&p.hp===18));for(const p of s.pieces)activity[p.id].cards=Array.from(p.learned);started=true;}
    }commands++;
  }
  assert(started);assert.equal(s.phase,'ended');assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);assert.equal(reversals,run.reversals);games++;if(games%16===0)console.log(JSON.stringify({verifiedGames:games,total:data.runs.length}));
}
assert.equal(games,142);assert.equal(commands,45743);assert.equal(boardChoices,33380);assert.equal(combatChoices,18579);assert.equal(rounds,8972);
console.log(JSON.stringify({games,newRandomGames:0,reusedTrialGames:128,knownGames:14,commands,boardChoices,combatChoices,rounds,states:states.length,planChecks,realBranches,changedPlans,allChoicesMatch:true,terminalHashesAndPieceActivityMatch:true}));
