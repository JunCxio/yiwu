const assert=require('node:assert/strict');
const fields=['mass','captures','attackerDead','bothDead','bothSurvive','retreats','sixRounds','kingExposed','ownWin','ownLoss','draw','hpA','hpD'];
function compact(E,C,entry,action){
  const started=performance.now(),before=JSON.stringify(entry),a=E.get(entry,action.id),d=E.at(entry,action.x,action.y),side=a.side;
  assert.equal(entry.phase,'board');assert(!E.CHALLENGES[entry.scenario]);assert(a.kind!=='king'&&d.kind!=='king');assert(E.canMove(entry,a,d.x,d.y));
  for(const p of [a,d])assert(p.hp>=1&&p.hp<=18&&p.learned.length<=2);
  const initial=JSON.parse(before);E.move(initial,a.id,d.x,d.y);
  const ids=[a,d].map(p=>Object.keys(E.BASE).concat(p.learned)),cards=[a,d].map(p=>new Map(p.learned.map((id,i)=>[id,1<<i]))),initialMask=p=>p.learned.reduce((mask,id,i)=>mask|(p.exhausted.includes(id)?1<<i:0),0);
  const memo=new Map(),terminals=new Map(),plans=[new Map(),new Map()],damage=new Map();let branches=0;
  function state(node){
    const next={...initial,pieces:initial.pieces.map(p=>({...p,exhausted:[...p.exhausted]})),repetitions:{...initial.repetitions},log:[...initial.log],duel:{...initial.duel,history:[]}};
    for(const [index,id]of [a.id,d.id].entries()){
      const p=E.get(next,id),mask=index?node.md:node.ma;p.hp=index?node.hd:node.ha;p.exhausted=p.learned.filter(card=>mask&cards[index].get(card));
    }
    Object.assign(next.duel,{round:node.round,forceA:node.fa,forceD:node.fd,totalDamage:node.damaged?1:0});return next;
  }
  function plan(index,mask,force){
    const key=mask*3+force;if(plans[index].has(key))return plans[index].get(key);
    const fake=state({round:1,ha:18,hd:18,ma:index?initialMask(a):mask,md:index?mask:initialMask(d),fa:index?0:force,fd:index?force:0,damaged:false});
    const result=C.practicePlan(fake,index?d.side:side).map(p=>({...p,slot:ids[index].indexOf(p.id),mask:mask|(cards[index].get(p.id)||0)}));assert(result.every(p=>p.id!=='retreat'));assert(Math.abs(result.reduce((n,p)=>n+p.weight,0)-1)<1e-12);plans[index].set(key,result);return result;
  }
  function hit(node,row,col){
    const key=(node.round===1?1:0)|(node.fa<<1)|(node.fd<<3)|(row.slot<<5)|(col.slot<<8);if(!damage.has(key))damage.set(key,E.roundDamage({...initial.duel,round:node.round,forceA:node.fa,forceD:node.fd},row.id,col.id));return damage.get(key);
  }
  function terminal(node,row,col,after){
    const retreated=!row,key=after.ha|(after.hd<<5)|(after.ma<<10)|(after.md<<12)|(after.damaged?1<<14:0)|(retreated?1<<15:0);if(terminals.has(key))return terminals.get(key);
    const next=state(node);if(retreated)E.retreat(next);else E.resolve(next,row.id,col.id);
    const attacker=E.get(next,a.id),defender=E.get(next,d.id),king=next.pieces.find(p=>p.side===side&&p.kind==='king');
    assert.equal(attacker?.hp||0,after.ha);assert.equal(defender?.hp||0,after.hd);assert.notEqual(next.phase,'duel');
    const exposed=next.phase==='board'&&next.pieces.some(p=>p.side!==side&&E.canMove(next,p,king.x,king.y)&&(p.hp>1||!C.battleOutlook(next,E.context(next,p,king)).counters.length));
    const values={mass:1,captures:+!defender,attackerDead:+!attacker,bothDead:+(!attacker&&!defender),bothSurvive:+!!(attacker&&defender),retreats:+retreated,sixRounds:+!!(!retreated&&attacker&&defender),kingExposed:+exposed,ownWin:+(next.winner===side),ownLoss:+(next.winner===E.OTHER[side]),draw:+(next.winner==='draw'),hpA:attacker?.hp||0,hpD:defender?.hp||0};
    const result=Float64Array.from(fields,f=>values[f]);terminals.set(key,result);return result;
  }
  function search(node){
    // 生命至多18、每子两张牌、气势至多2；各字段占用独立位段。
    const key=node.round|(node.ha<<3)|(node.hd<<8)|(node.ma<<13)|(node.md<<15)|(node.fa<<17)|(node.fd<<19)|(node.damaged?1<<21:0);if(memo.has(key))return memo.get(key);
    if(node.round>=2&&node.ha<=4){const result=terminal(node,null,null,node);memo.set(key,result);return result;}
    const rows=plan(0,node.ma,node.fa),cols=plan(1,node.md,node.fd),result=new Float64Array(fields.length);
    for(const row of rows)for(const col of cols){
      const r=hit(node,row,col),after={round:node.round+1,ha:Math.max(0,node.ha-r.toA),hd:Math.max(0,node.hd-r.toD),ma:row.mask,md:col.mask,fa:r.forceAfterA,fd:r.forceAfterD,damaged:node.damaged||r.toA+r.toD>0};branches++;
      const value=after.ha>0&&after.hd>0&&node.round<6?search(after):terminal(node,row,col,after),weight=row.weight*col.weight;
      for(let i=0;i<fields.length;i++)result[i]+=value[i]*weight;
    }
    assert(Math.abs(result[0]-1)<1e-10);memo.set(key,result);return result;
  }
  const result=Object.fromEntries(Array.from(search({round:1,ha:a.hp,hd:d.hp,ma:initialMask(a),md:initialMask(d),fa:0,fd:0,damaged:false}),(value,i)=>[fields[i],value]));
  assert.equal(JSON.stringify(entry),before);assert(Math.abs(result.captures+result.attackerDead+result.bothSurvive-result.bothDead-1)<1e-10);assert(Math.abs(result.retreats+result.sixRounds-result.bothSurvive)<1e-10);
  return {probabilities:result,states:memo.size,terminalShapes:terminals.size,branches,elapsedMs:performance.now()-started};
}
module.exports={compact,fields};
