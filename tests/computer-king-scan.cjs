const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../index.html'),'utf8');
const scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);
vm.runInContext(scripts[1].replace('return {actions,choices','return {advanceTrapsKing,threatCost,actions,choices'),box);
const E=box.Yiwu,C=box.YiwuComputer,copy=x=>JSON.parse(JSON.stringify(x));
// 不预筛攻击者的原枚举作为对照，仍用真实走法、反杀和判和结算。
function exhaustive(s,king){
  return s.pieces.some(p=>p.side!==king.side&&E.moves(s,p).filter(m=>!E.at(s,m.x,m.y)).some(m=>{
    const next=copy(s);E.move(next,p.id,m.x,m.y);
    if(next.phase!=='board'||!C.threatCost(next,E.get(next,king.id)))return false;
    return E.moves(next,E.get(next,king.id)).filter(exit=>!E.at(next,exit.x,exit.y)).every(exit=>{
      const escaped=copy(next);E.move(escaped,king.id,exit.x,exit.y);
      return escaped.phase==='board'&&C.threatCost(escaped,E.get(escaped,king.id))>0;
    });
  }));
}
let checked=0,pressures=0;
function verify(s){
  const raw=JSON.stringify(s);
  for(const king of s.pieces.filter(p=>p.kind==='king')){
    const state=copy(s);state.turn=E.OTHER[king.side];
    const before=JSON.stringify(state),expected=exhaustive(state,E.get(state,king.id));
    assert.equal(C.advanceTrapsKing(state,E.get(state,king.id)),expected,'协同预筛不能漏掉移动者或静态攻击者');
    assert.equal(JSON.stringify(state),before);checked++;if(expected)pressures++;
  }
  assert.equal(JSON.stringify(s),raw);
}
for(const name of ['computer-king-coordination-fixture.json','computer-king-multi-exit-fixture.json','computer-king-zero-exit-fixture.json','computer-king-relief-fixture.json']){
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
  const rows=Array.isArray(fixture)?fixture:fixture.cases||[fixture];
  for(const row of rows){
    let s;for(const [op,...args]of row.commands||row.prefix){if(op==='create')s=E.create(...args);else E[op](s,...args);}
    assert.equal(s.phase,'board');verify(s);
    for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.turn=E.OTHER[s.turn];
    s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
    verify(s);
  }
}
let seed=190119;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const kinds=['rook','cannon','horse','elephant','guard','pawn'];
for(let index=0;index<256;index++){
  const s=E.create('attrition');s.pieces=[E.piece('rk','red','king',3+random(3),7+random(3)),E.piece('bk','black','king',3+random(3),random(3))];
  s.repetitions={};s.quiet=index%8===0?E.DRAW.quiet-1:index%8===1?E.DRAW.quiet-2:0;s.log=[];
  for(let j=0;j<12;j++){
    const x=random(9),y=random(10);if(E.at(s,x,y))continue;
    const p=E.piece('p'+j,j%2?'red':'black',kinds[(index+j)%kinds.length],x,y);p.hp=1+random(18);
    p.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind).slice(0,index%3);p.exhausted=index%4===0?p.learned.slice(0,1):[];s.pieces.push(p);
  }
  // 人工站位覆盖多重炮架、远近短程子、伤势与耗牌，不计为自然对局或平衡样本。
  verify(s);
}
assert(pressures>0);console.log('协同逼帅预筛：'+checked+' 次双向查询与穷举一致，其中 '+pressures+' 次存在真实压力；历史旋转、判和、人工站位及输入不变通过。');
