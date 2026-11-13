const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
function audit(source){
  const bytes=fs.readFileSync(__dirname+'/king-query-0.6.136.json.gz');
  assert.equal(hash(bytes),'70c81888da81d0e21e9d955e136e01821d8fd659bad1f01caa4eaaf45a464704');
  const data=JSON.parse(zlib.gunzipSync(bytes));assert.equal(hash(source),data.releaseSHA256,'请提供报告指定的0.6.136入口');
  const box=vm.createContext({});for(const m of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);
  const E=box.Yiwu,C=box.YiwuComputer,rows=[];let totalCommands=0;
  for(const [index,run]of data.trial.runs.entries()){
    if(index%4!==0)continue;
    assert.equal(run.input.models.red,'baseline');assert.equal(run.input.models.black,'baseline');
    assert.deepEqual(run.input,data.trial.plan.inputs[index]);
    const roles={},tail=[];let s,initialHP=0;
    for(const [commandIndex,command]of run.commands.entries()){
      const [op,...args]=command;
      if(op==='create'){
        assert(!s);s=E.create(...args);initialHP=s.pieces.reduce((n,p)=>n+p.hp,0);
        for(const p of s.pieces)roles[p.id]={side:p.side,kind:p.kind,cards:[],moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0,attackingDamage:0,counterDamage:0,damageTaken:0,eligibleSupportBattles:0,cappedSupportBattles:0,friendlyScreenBattles:0,enemyScreenBattles:0};
      }else{
        if(op==='start'){
          for(const side of ['red','black']){assert.equal(s.budget[side],0);assert.equal(s.pieces.filter(p=>p.side===side).reduce((n,p)=>n+p.learned.length,0),s.points);}
          for(const p of s.pieces)roles[p.id].cards=Array.from(p.learned);
        }
        if(s.phase==='board'){
          const p=E.get(s,args[0]),target=op==='move'?E.at(s,args[1],args[2]):null;
          if(run.winner==='draw'&&s.ply>=run.plies-80){
            const raw=JSON.stringify(s),attacks=C.actions(s).filter(a=>a.type==='move'&&E.at(s,a.x,a.y));
            const finishes=attacks.flatMap(action=>{
              const a=E.get(s,action.id),d=E.at(s,action.x,action.y),ctx=E.context(s,a,d),out=C.battleOutlook(s,ctx);
              return out.finishes.length?[{action:copy(action),target:d.id,firstChoices:copy(out.finishes),captureAlwaysLosesKing:C.captureLosesKing(s,ctx,out.finishes,3)}]:[];
            });
            tail.push({commandIndex,ply:s.ply+1,side:s.turn,quiet:s.quiet,command,from:p?[p.x,p.y]:null,attack:!!target,attackOptions:attacks.length,finishes});
            assert.equal(JSON.stringify(s),raw);
          }
          if(op==='rest')roles[p.id].rests++;
          if(op==='move'){
            if(target){
              roles[p.id].attacks++;roles[target.id].defenses++;
              const ctx=E.context(s,p,target);
              for(const ids of [ctx.supportA,ctx.supportD]){
                for(const id of ids)roles[id].eligibleSupportBattles++;
                for(const id of ids.slice(0,2))roles[id].cappedSupportBattles++;
              }
              if(ctx.screen)roles[ctx.screen][E.get(s,ctx.screen).side===p.side?'friendlyScreenBattles':'enemyScreenBattles']++;
            }else roles[p.id].moves++;
          }
        }
        let combat;
        if(op==='resolve'){
          const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args),toA=Math.min(a.hp,r.toA),toD=Math.min(d.hp,r.toD);
          roles[a.id].attackingDamage+=toD;roles[d.id].counterDamage+=toA;
          roles[a.id].damage+=toD;roles[d.id].damage+=toA;roles[a.id].damageTaken+=toA;roles[d.id].damageTaken+=toD;
          for(const [p,id]of [[a,args[0]],[d,args[1]]])if(E.CARDS[id])roles[p.id].cardUses++;
          combat={a:a.id,d:d.id};
        }
        E[op](s,...args);
        if(combat){if(!E.get(s,combat.d))roles[combat.a].captures++;if(!E.get(s,combat.a))roles[combat.d].captures++;}
      }
      totalCommands++;
    }
    assert.equal(s.phase,'ended');assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.equal(s.winner,run.winner);assert.equal(s.ply,run.plies);
    assert.equal(Object.values(roles).reduce((n,p)=>n+p.damage,0),initialHP-s.pieces.reduce((n,p)=>n+p.hp,0));
    for(const side of ['red','black'])assert.equal(Object.values(roles).filter(p=>p.side===side).reduce((n,p)=>n+p.damageTaken,0),Object.values(roles).filter(p=>p.side===side).length*18-s.pieces.filter(p=>p.side===side).reduce((n,p)=>n+p.hp,0));
    for(const [id,expected]of Object.entries(run.pieceActivity)){
      const actual=Object.fromEntries(Object.keys(expected).map(key=>[key,roles[id][key]]));assert.deepEqual(actual,expected);
      assert.equal(roles[id].attackingDamage+roles[id].counterDamage,roles[id].damage);
    }
    const winners=Object.entries(roles).filter(([,p])=>p.side===s.winner),damagePieces=winners.filter(([,p])=>p.damage>0).length,attackers=winners.filter(([,p])=>p.attacks>0);
    const winnerRoles=s.winner==='draw'?null:{damagePieces,attackingPieces:attackers.length,nonAttackerDamage:winners.filter(([,p])=>!p.attacks).reduce((n,[,p])=>n+p.damage,0),supportPieces:winners.filter(([,p])=>p.cappedSupportBattles>0).length,friendlyScreenPieces:winners.filter(([,p])=>p.friendlyScreenBattles>0).length};
    let reversals=0;const lastMoves=new Map();
    for(const event of tail)if(event.command[0]==='move'&&!event.attack){const [,id,x,y]=event.command,old=lastMoves.get(id);if(old&&old[0]===x&&old[1]===y)reversals++;lastMoves.set(id,event.from);}
    if(s.winner==='draw'){assert.equal(s.reason,'连续 80 次行动未造成伤害');assert.equal(tail.length,80);assert.equal(tail[0].quiet,0);assert.equal(tail.at(-1).quiet,79);}
    rows.push({index,input:run.input,winner:s.winner,reason:s.reason,plies:s.ply,commands:run.commands.length,terminalSHA256:run.terminalSHA256,winnerRoles,roles,tail:{actions:tail.length,withAttack:tail.filter(e=>e.attackOptions>0).length,chosenAttacks:tail.filter(e=>e.attack).length,withFirstRoundFinish:tail.filter(e=>e.finishes.length>0).length,reversals,events:tail}});
  }
  assert.equal(rows.length,32);assert.equal(totalCommands,data.traces.commands);
  const groups=[];
  for(const difficulty of ['standard','practice'])for(const scenario of ['quick','full']){
    const rs=rows.filter(r=>r.input.difficulty===difficulty&&r.input.scenario===scenario),wins=rs.filter(r=>r.winner!=='draw'),draws=rs.filter(r=>r.winner==='draw');assert.equal(rs.length,8);
    const sum=fn=>rs.reduce((n,r)=>n+fn(r),0);
    groups.push({difficulty,scenario,games:rs.length,decisive:wins.length,draws:draws.length,meanPlies:sum(r=>r.plies)/rs.length,maxPlies:Math.max(...rs.map(r=>r.plies)),singleDamageWins:wins.filter(r=>r.winnerRoles.damagePieces===1).length,singleAttackerWins:wins.filter(r=>r.winnerRoles.attackingPieces===1).length,tailActions:sum(r=>r.tail.actions),tailWithAttack:sum(r=>r.tail.withAttack),tailChosenAttacks:sum(r=>r.tail.chosenAttacks),tailWithFirstRoundFinish:sum(r=>r.tail.withFirstRoundFinish),tailReversals:sum(r=>r.tail.reversals)});
  }
  return copy({sourceSHA256:hash(source),archiveSHA256:hash(bytes),games:rows.length,commands:totalCommands,newBalanceGames:0,allOriginalPieceStatisticsMatch:true,groups,rows});
}
module.exports={audit};
if(require.main===module){
  const source=fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../../index.html'),'utf8'),report=audit(source),expected=JSON.parse(zlib.gunzipSync(fs.readFileSync(__dirname+'/team-role-0.6.136.json.gz')));
  assert.deepEqual(report,expected);console.log(JSON.stringify({verified:true,games:report.games,commands:report.commands,newBalanceGames:0,groups:report.groups}));
}
