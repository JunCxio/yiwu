const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
vm.runInContext(scripts[0],box);vm.runInContext(scripts[1].replace('return {actions,choices','return {advanceTrapsKing,actions,choices'),box);
const E=box.Yiwu,C=box.YiwuComputer,fixture=require('./computer-king-coordination-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
function replay(row,rotated){
  let s;for(const [op,...args]of row.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply+1,row.ply);
  if(rotated){
    s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
  }
  return s;
}
function attackers(s,king){
  return s.pieces.filter(p=>{
    if(p.side===king.side||!E.canMove(s,p,king.x,king.y))return false;
    const ctx=E.context(s,p,king),ids=q=>Object.keys(E.BASE).concat(q.learned).filter(id=>!E.availability(s,q,id,ctx));
    return !ids(king).some(reply=>ids(p).every(id=>{const r=E.roundDamage(ctx,id,reply);return r.toA>=p.hp&&r.toD<king.hp;}));
  });
}
function exits(s,king){
  return E.moves(s,king).filter(m=>!E.at(s,m.x,m.y)).filter(m=>{
    const next=copy(s);next.turn=king.side;E.move(next,king.id,m.x,m.y);
    return next.phase==='ended'?next.winner!==E.OTHER[king.side]:!attackers(next,E.get(next,king.id)).length;
  });
}
function pressures(s,king){
  const result=[];
  for(const p of s.pieces.filter(p=>p.side!==king.side))for(const m of E.moves(s,p).filter(m=>!E.at(s,m.x,m.y))){
    const next=copy(s);E.move(next,p.id,m.x,m.y);if(next.phase!=='board')continue;
    const k=E.get(next,king.id),threats=attackers(next,k);
    if(threats.length&&!exits(next,k).length)result.push({type:'move',id:p.id,x:m.x,y:m.y,attackers:threats.map(q=>q.id)});
  }
  return result;
}
let branches=0;
for(const row of fixture.cases)for(const rotated of [false,true]){
  const s=replay(row,rotated),raw=JSON.stringify(s),side=s.turn,rotate=a=>({...a,x:rotated?8-a.x:a.x,y:rotated?9-a.y:a.y});
  const bad=rotate(row.danger),safe=rotate(row.safe),advance=rotate(row.advance),ranked=copy(C.rankedActions(s));
  assert(ranked.find(a=>same(a,safe)).score>ranked.find(a=>same(a,bad)).score+.06,'应优先避免对手移动另一子建立炮架后的逼帅');
  for(const [action,trapped]of [[bad,true],[safe,false], [ranked[0],false]]){
    const next=copy(s);E.move(next,action.id,action.x,action.y);assert.equal(next.phase,'board');
    const king=next.pieces.find(p=>p.kind==='king'&&p.side===side),before=JSON.stringify(next);
    assert.equal(attackers(next,king).length,0);
    const all=pressures(next,king);assert.equal(all.length>0,trapped);branches+=all.length;
    assert.equal(C.advanceTrapsKing(next,king),trapped);assert.equal(JSON.stringify(next),before);
    if(trapped){
      assert(all.some(a=>same(a,advance)&&a.attackers.includes(row.attacker)));
      const follow=copy(next);E.move(follow,advance.id,advance.x,advance.y);
      assert(!E.canMove(follow,E.get(follow,advance.id),king.x,king.y),'移动的马本身不攻将');
      assert(E.canMove(follow,E.get(follow,row.attacker),king.x,king.y));
      assert.equal(exits(follow,E.get(follow,king.id)).length,0);
      for(const mode of ['quiet-draw','escape-draw','repetition-draw','counter']){
        const control=copy(next);
        if(mode==='quiet-draw')control.quiet=E.DRAW.quiet-1;
        if(mode==='escape-draw')control.quiet=E.DRAW.quiet-2;
        if(mode==='repetition-draw')for(const p of control.pieces.filter(p=>p.side===control.turn))for(const m of E.moves(control,p).filter(m=>!E.at(control,m.x,m.y))){const end=copy(control);E.move(end,p.id,m.x,m.y);control.repetitions[E.key(end)]=E.DRAW.repetitions-1;}
        if(mode==='counter')for(const p of control.pieces)if(p.side!==side)p.hp=1;
        assert.equal(pressures(control,E.get(control,king.id)).length,0,mode);
        assert.equal(C.advanceTrapsKing(control,E.get(control,king.id)),false,mode);
      }
    }
  }
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){
    const action=C.board(s,()=>roll,difficulty);assert(!same(action,bad));
    const next=copy(s);E.move(next,action.id,action.x,action.y);
    if(next.phase==='board')assert.equal(pressures(next,next.pieces.find(p=>p.side===side&&p.kind==='king')).length,0);
    else assert.equal(next.phase,'duel');
  }
  assert.equal(JSON.stringify(s),raw);assert.deepEqual(copy(C.rankedActions(s)),ranked);
  const mirror=C.rankedActions(replay(row,!rotated));for(const a of ranked){const m=mirror.find(b=>same(b,{...a,x:8-a.x,y:9-a.y}));assert(m);assert(Math.abs(m.score-a.score)<1e-8);}
}
// 用独立站位验证移开挡线子也由同一检查处理。
const line=E.create('attrition');line.turn='red';line.phase='board';line.quiet=0;line.repetitions={};line.log=[];
line.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',5,0),E.piece('bg','black','guard',4,0),E.piece('rr','red','rook',5,5),E.piece('rh','red','horse',5,3)];
assert.equal(attackers(line,E.get(line,'bk')).length,0);assert.equal(exits(line,E.get(line,'bk')).length,1);
const branch=pressures(line,E.get(line,'bk')).find(a=>a.id==='rh'&&a.x===7&&a.y===2);assert(branch&&branch.attackers.includes('rr'));
assert.equal(C.advanceTrapsKing(line,E.get(line,'bk')),true);
E.move(line,'rh',7,2);assert(!E.canMove(line,E.get(line,'rh'),5,0));assert(E.canMove(line,E.get(line,'rr'),5,0));
assert(branches>0);console.log('协同逼帅：两份完整历史及红黑旋转、'+branches+' 条真实压力分支、调马建炮架、移开车线挡子、两难度、可靠反杀、直接判和、输入不变与全部行动旋转评分通过。');
