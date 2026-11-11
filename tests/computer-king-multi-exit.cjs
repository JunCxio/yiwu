const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),ss=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(ss[0],box);vm.runInContext(ss[1].replace('return {actions,choices','return {kingMobilityCost,advanceTrapsKing,actions,choices'),box);
const E=box.Yiwu,C=box.YiwuComputer,rows=require('./computer-king-multi-exit-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
function attackers(s,king){
  return s.pieces.filter(p=>{
    if(p.side===king.side||!E.canMove(s,p,king.x,king.y))return false;
    const ctx=E.context(s,p,king),ids=q=>Object.keys(E.BASE).concat(q.learned).filter(id=>!E.availability(s,q,id,ctx));
    return !ids(king).some(reply=>ids(p).every(id=>{const r=E.roundDamage(ctx,id,reply);return r.toA>=p.hp&&r.toD<king.hp;}));
  }).map(p=>p.id);
}
function safeExits(s,king){
  return E.moves(s,king).filter(m=>!E.at(s,m.x,m.y)).filter(m=>{
    const next=copy(s);next.turn=king.side;E.move(next,king.id,m.x,m.y);
    return next.phase==='ended'?next.winner!==E.OTHER[king.side]:!attackers(next,E.get(next,king.id)).length;
  });
}
let cases=0,branches=0;const failures=[];
for(const row of rows)for(const rotated of [false,true]){
  try{
    let s;for(const [op,...args]of row.prefix){if(op==='create')s=E.create(...args);else E[op](s,...args);}
    assert.equal(s.phase,'board');assert.equal(s.ply+1,row.ply);assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);
    if(rotated){
      s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
      s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
    }
    const side=s.turn,original=JSON.stringify(s),rotate=a=>({...a,x:rotated?8-a.x:a.x,y:rotated?9-a.y:a.y}),[bad,good]=row.alternatives.map(a=>rotate(a.action)),ranked=copy(C.rankedActions(s));
    assert(ranked.find(a=>same(a,good)).score>ranked.find(a=>same(a,bad)).score+2,'存在无同类压力的替代时，不能因两条退路而漏扣风险');
    for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999])assert(!same(C.board(s,()=>roll,difficulty),bad));
    for(const [index,action]of [bad,good].entries()){
      const next=copy(s);E.move(next,action.id,action.x,action.y);assert.equal(next.phase,'board');const king=next.pieces.find(p=>p.kind==='king'&&p.side===side);
      assert.equal(attackers(next,king).length,0);assert.equal(safeExits(next,king).length,2);
      const actual=[];
      for(const p of next.pieces.filter(p=>p.side!==side))for(const m of E.moves(next,p).filter(m=>!E.at(next,m.x,m.y))){
        const after=copy(next);E.move(after,p.id,m.x,m.y);if(after.phase!=='board')continue;
        const defender=E.get(after,king.id);if(attackers(after,defender).length&&!safeExits(after,defender).length)actual.push({type:'move',id:p.id,x:m.x,y:m.y});
      }
      assert.deepEqual(actual,row.alternatives[index].branches.map(b=>rotate(b.move)));branches+=actual.length;
      assert.equal(C.advanceTrapsKing(next,king),index===0);assert(Math.abs(C.kingMobilityCost(next,king,0)-(index===0?4.2:0))<1e-8);
      for(const edge of ['own-turn','quiet-draw','repetition-draw','reliable-counter','challenge']){
        const altered=copy(next),defender=E.get(altered,king.id);
        if(edge==='own-turn')altered.turn=side;
        else if(edge==='quiet-draw')altered.quiet=E.DRAW.quiet-1;
        else if(edge==='reliable-counter'){for(const p of altered.pieces)if(p.side!==side)p.hp=1;}
        else if(edge==='challenge')altered.scenario='challenge-support';
        else for(const p of altered.pieces.filter(p=>p.side!==side))for(const m of E.moves(altered,p).filter(m=>!E.at(altered,m.x,m.y))){const end=copy(altered);E.move(end,p.id,m.x,m.y);altered.repetitions[E.key(end)]=2;}
        assert.equal(C.kingMobilityCost(altered,defender,0),0,edge+' 不应新增逼帅评分');
      }
    }
    assert.equal(JSON.stringify(s),original);assert.deepEqual(copy(C.rankedActions(s)),ranked);cases++;
  }catch(e){failures.push({ply:row.ply,rotated,message:e.message});}
}
console.log(JSON.stringify({cases,branches,failures},null,2));assert.deepEqual(failures,[]);assert.equal(cases,6);assert.equal(branches,6);
