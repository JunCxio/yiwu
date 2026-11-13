const assert=require('node:assert/strict');
const fields=['mass','captures','attackerDead','bothDead','bothSurvive','retreats','sixRounds','kingExposed','ownWin','ownLoss','draw','hpA','hpD'];
function distribution(E,C,entry,action){
  const source=JSON.stringify(entry),a=E.get(entry,action.id),d=E.at(entry,action.x,action.y),side=a.side,memo=new Map(),ends=new Map();let branches=0;
  function copy(state){return {...state,pieces:state.pieces.map(p=>({...p,exhausted:[...p.exhausted]})),repetitions:{...state.repetitions},log:[...state.log],duel:{...state.duel,history:[...state.duel.history]}};}
  function terminal(state,retreated){
    const key=JSON.stringify([E.key(state),state.phase,state.winner,state.quiet,retreated]);if(ends.has(key))return ends.get(key);
    const attacker=E.get(state,a.id),defender=E.get(state,d.id),king=state.pieces.find(p=>p.side===side&&p.kind==='king');
    const exposed=state.phase==='board'&&state.pieces.some(p=>p.side!==side&&E.canMove(state,p,king.x,king.y)&&(p.hp>1||!C.battleOutlook(state,E.context(state,p,king)).counters.length));
    const result={mass:1,captures:+!defender,attackerDead:+!attacker,bothDead:+(!attacker&&!defender),bothSurvive:+!!(attacker&&defender),retreats:+retreated,sixRounds:+!!(!retreated&&attacker&&defender),kingExposed:+exposed,ownWin:+(state.winner===side),ownLoss:+(state.winner===E.OTHER[side]),draw:+(state.winner==='draw'),hpA:attacker?.hp||0,hpD:defender?.hp||0};
    ends.set(key,result);return result;
  }
  function search(state){
    const ctx=state.duel,attacker=E.get(state,a.id),defender=E.get(state,d.id),key=JSON.stringify([ctx.round,attacker.hp,defender.hp,attacker.exhausted,defender.exhausted,ctx.forceA,ctx.forceD,ctx.totalDamage===0]);
    if(memo.has(key))return memo.get(key);
    const rows=C.practicePlan(state,side),cols=C.practicePlan(state,d.side),result=Object.fromEntries(fields.map(f=>[f,0]));
    for(const plan of [rows,cols])assert(Math.abs(plan.reduce((n,p)=>n+p.weight,0)-1)<1e-12);
    for(const row of rows)for(const col of row.id==='retreat'?[{id:null,weight:1}]:cols){
      const next=copy(state);if(row.id==='retreat')E.retreat(next);else E.resolve(next,row.id,col.id);branches++;
      const value=next.phase==='duel'?search(next):terminal(next,row.id==='retreat'),weight=row.weight*col.weight;
      for(const f of fields)result[f]+=value[f]*weight;
    }
    assert(Math.abs(result.mass-1)<1e-10);memo.set(key,result);return result;
  }
  const duel=JSON.parse(source);E.move(duel,a.id,d.x,d.y);const start=performance.now(),result=search(duel);
  assert.equal(JSON.stringify(entry),source);assert(Math.abs(result.captures+result.attackerDead+result.bothSurvive-result.bothDead-1)<1e-10);assert(Math.abs(result.retreats+result.sixRounds-result.bothSurvive)<1e-10);
  return {ply:entry.ply+1,action,powerA:E.power(duel.duel,true),powerD:E.power(duel.duel,false),hpA:a.hp,hpD:d.hp,probabilities:result,states:memo.size,terminalShapes:ends.size,branches,elapsedMs:performance.now()-start};
}
module.exports={distribution,fields};
