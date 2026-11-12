const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const file=name=>path.join(__dirname,name),hash=value=>crypto.createHash('sha256').update(value).digest('hex'),copy=value=>JSON.parse(JSON.stringify(value));
const packet=JSON.parse(fs.readFileSync(process.argv[3]||file('capture-followup-0.6.118.json'))),plan=packet.plan,report=packet.report,source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'));
assert.equal(plan.sourceSHA256,'18c0c27338fe557deea91d1a57445446d11c2522c6f00d73cdba3d7eb0744230');assert.equal(hash(source),plan.sourceSHA256);assert(report.completed);assert.equal(report.errors.length,0);assert.equal(report.runs.length,9);assert.equal(plan.newRandomRoots,0);
const previousBytes=fs.readFileSync(file('balance-0.6.113.json'));assert.equal(hash(previousBytes),'468fe5f3222f084484232bfad03e3729314730c2d22e9b5f6612411712bbdf26');
const previous=JSON.parse(previousBytes),audit=previous.longGameAudit.runs.find(r=>r.input.scenario==='full'),control=previous.reports.flatMap(r=>r.runs).find(r=>JSON.stringify(r.input)===JSON.stringify(audit.input));
assert(control);assert.equal(control.plies,622);assert.equal(plan.controlSourceSHA256,previous.sourceSHA256);
const models={red:'baseline',black:'baseline'},expectedInputs=[{...control.input,models}];
for(const row of audit.rows)if(!row.battle)for(const attack of row.attacks.filter(a=>a.finishes.length&&!a.captureLosesKing))expectedInputs.push({...control.input,models,force:{ply:row.ply,index:row.index,expected:row.actual,action:{type:'move',id:attack.id,x:attack.x,y:attack.y},target:attack.target,finishes:attack.finishes}});
assert.equal(expectedInputs.length,9);assert.deepEqual(plan.inputs,expectedInputs);
const totals={games:0,commands:0,boardChoices:0,combatChoices:0,overrides:0,firstRoundResponses:0};
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const commandFor=action=>[action.type,...(action.type==='pass'?[]:action.type==='rest'?[action.id,action.card]:[action.id,action.x,action.y])];
for(const [runIndex,run] of report.runs.entries()){
  assert.deepEqual(run.input,plan.inputs[runIndex]);
  const box=vm.createContext({}),scripts=[...source.toString().matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  vm.runInContext(scripts[0],box);vm.runInContext(scripts[1],box);const E=box.Yiwu,C=box.YiwuComputer;
  const input=run.input,rng={[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)};
  const activity={},stats={moves:0,rests:0,passes:0,battles:0,rounds:0,retreats:0,reversals:0},last=new Map();let s,started=false,overrides=0;
  for(const [index,command] of run.commands.entries()){
    const [op,...args]=command;totals.commands++;
    if(op==='create'){assert(!s);s=E.create(...args);continue;}
    if(!started){
      assert(['learn','start'].includes(op));E[op](s,...args);
      if(op==='start'){
        started=true;assert.equal(s.points,12);assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);
        assert(s.pieces.every(p=>p.hp===18&&p.learned.length<=2&&!p.exhausted.length));
        for(const p of s.pieces)activity[p.id]={side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0};
      }
      continue;
    }
    const before=JSON.stringify(s);
    if(s.phase==='board'){
      let action=C.board(s,rng[s.turn],'standard');totals.boardChoices++;
      if(input.force&&s.ply+1===input.force.ply){
        assert.equal(index,input.force.index);assert.deepEqual(copy(action),input.force.expected);
        action=input.force.action;overrides++;
        const a=E.get(s,action.id),d=E.at(s,action.x,action.y),ctx=E.context(s,a,d),outlook=C.battleOutlook(s,ctx);
        assert.equal(d.id,input.force.target.id);assert.equal(d.hp,1);assert(E.canMove(s,a,d.x,d.y));
        assert.deepEqual(copy(outlook.finishes),input.force.finishes);assert.equal(C.captureLosesKing(s,ctx,outlook.finishes),false);
        for(const id of outlook.finishes)for(const reply of C.choices(s,d,ctx)){
          const next=copy(s);E.move(next,a.id,d.x,d.y);E.resolve(next,id,reply);
          assert(E.get(next,a.id));assert(!E.get(next,d.id));totals.firstRoundResponses++;
        }
      }
      assert.deepEqual(commandFor(action),command);
      if(op==='pass')stats.passes++;
      else if(op==='rest'){stats.rests++;activity[args[0]].rests++;}
      else{
        assert.equal(op,'move');const p=E.get(s,args[0]),d=E.at(s,args[1],args[2]);
        if(d){stats.battles++;activity[p.id].attacks++;activity[d.id].defenses++;last.delete(p.id);}
        else{stats.moves++;activity[p.id].moves++;const previous=last.get(p.id);if(previous&&previous[0]===args[1]&&previous[1]===args[2])stats.reversals++;last.set(p.id,[p.x,p.y]);}
      }
    }else{
      assert.equal(s.phase,'duel');const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),id=C.combat(s,a.side,rng[a.side],'standard');totals.combatChoices++;
      if(id==='retreat'){assert.deepEqual(command,['retreat']);stats.retreats++;}
      else{
        const other=C.combat(s,d.side,rng[d.side],'standard');totals.combatChoices++;assert.deepEqual(command,['resolve',id,other]);stats.rounds++;
        const damage=E.roundDamage(s.duel,id,other);activity[a.id].damage+=Math.min(d.hp,damage.toD);activity[d.id].damage+=Math.min(a.hp,damage.toA);
        if(damage.toD>=d.hp)activity[a.id].captures++;if(damage.toA>=a.hp)activity[d.id].captures++;
        if(E.CARDS[id])activity[a.id].cardUses++;if(E.CARDS[other])activity[d.id].cardUses++;
      }
    }
    assert.equal(JSON.stringify(s),before);E[op](s,...args);
  }
  assert.equal(overrides,input.force?1:0);assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);
  assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);for(const [key,value]of Object.entries(stats))assert.equal(value,run[key]);
  if(input.force){const index=input.force.index;assert.equal(run.firstDifferenceCommandIndex,index);assert.deepEqual(run.commands.slice(0,index),control.commands.slice(0,index));assert.notDeepEqual(run.commands[index],control.commands[index]);}
  else{assert.deepEqual(run.commands,control.commands);assert.equal(run.terminalSHA256,control.terminalSHA256);}
  totals.games++;totals.overrides+=overrides;console.log(JSON.stringify({verified:totals.games,plies:run.plies,winner:run.winner}));
}
assert.equal(totals.games,9);assert.equal(totals.overrides,8);
assert.deepEqual({...totals,allSubsequentChoicesRecomputed:true,originalQueryConsumesRandom:true,allTerminalHashesMatch:true,allPieceActivityMatches:true},packet.verification);
console.log(JSON.stringify(totals));
