const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,fixture=require('./computer-attack-pressure-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
function rotate(s){
  s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));return s;
}
function replay(){let s;for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}return s;}
function attacks(s,king){return s.pieces.filter(p=>p.side!==king.side&&E.canMove(s,p,king.x,king.y)&&!C.battleOutlook(s,E.context(s,p,king)).counters.length);}
function safeExits(s,king){return E.moves(s,king).filter(m=>!E.at(s,m.x,m.y)).filter(m=>{const next=copy(s);next.turn=king.side;E.move(next,king.id,m.x,m.y);return next.phase==='ended'?next.winner!==E.OTHER[king.side]:!attacks(next,E.get(next,king.id)).length;});}
let checks=0;function test(name,fn){fn();checks++;console.log('通过：'+name);}

test('完整合法第20步交战后仍留一条退路，但对方调马建炮架可封住退路',()=>{
  const s=replay(),side=s.turn;assert.equal(s.ply+1,fixture.ply);assert.equal(side,'black');
  for(const [op,...args]of fixture.battle)E[op](s,...args);
  assert.equal(s.phase,'board');assert.equal(s.turn,'red');assert.equal(E.get(s,fixture.danger.id).hp,4);
  const king=s.pieces.find(p=>p.side===side&&p.kind==='king');assert.equal(attacks(s,king).length,0);assert.equal(safeExits(s,king).length,1);assert.equal(C.kingLostNext(s,side),false);
  E.move(s,fixture.advance.id,fixture.advance.x,fixture.advance.y);
  assert(attacks(s,E.get(s,king.id)).some(p=>p.id===fixture.attacker));assert.equal(safeExits(s,E.get(s,king.id)).length,0);
});

test('普通交战同样计入下一手协同风险，两难度均选择先移将，红黑一致',()=>{
  for(const rotated of [false,true]){
    const s=rotated?rotate(replay()):replay(),before=JSON.stringify(s),transform=a=>rotated?{...a,x:8-a.x,y:9-a.y}:a;
    const danger=transform(fixture.danger),safe=transform(fixture.safe),ranked=copy(C.rankedActions(s)),bad=ranked.find(a=>same(a,danger)),good=ranked.find(a=>same(a,safe));
    assert(bad&&good);assert(good.score>bad.score+4,'交战不能漏掉移动已计入的协同逼帅代价');assert(same(ranked[0],safe));
    for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999])assert(same(C.board(s,()=>roll,difficulty),safe));
    assert.equal(JSON.stringify(s),before);assert.deepEqual(copy(C.rankedActions(s)),ranked);
    const mirror=C.rankedActions(rotated?replay():rotate(replay()));for(const action of ranked){const other=mirror.find(a=>same(a,{...action,x:8-action.x,y:9-action.y}));assert(other);assert(Math.abs(action.score-other.score)<1e-8);}
  }
});

function plain(){
  const s=E.create('attrition');s.turn='black';s.repetitions={};s.log=[];
  s.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',5,0),E.piece('bc','black','cannon',4,0),E.piece('bp','black','pawn',4,4),E.piece('rp','red','pawn',4,6)];return s;
}
test('将帅有充足退路且没有协同进攻时，普通交战评分保持原值',()=>{
  for(const rotated of [false,true]){
    const s=rotated?rotate(plain()):plain(),before=JSON.stringify(s),action={type:'move',id:'bc',x:4,y:rotated?3:6};
    const score=C.rankedActions(s).find(a=>same(a,action)).score;assert(Math.abs(score+.275)<1e-8);assert.equal(JSON.stringify(s),before);
  }
});
test('安全首轮终结仍使用实际结算，当前轮的确定获胜保持最高优先',()=>{
  const s=plain();E.get(s,'rp').hp=1;const action={type:'move',id:'bc',x:4,y:6},ctx=E.context(s,E.get(s,'bc'),E.get(s,'rp'));
  assert(C.battleOutlook(s,ctx).finishes.length);assert(Math.abs(C.rankedActions(s).find(a=>same(a,action)).score-1.9205555555555567)<1e-8);
  s.pieces=s.pieces.filter(p=>p.id!=='rp'&&p.id!=='bp');E.get(s,'bc').x=3;E.get(s,'bc').y=5;
  s.pieces.push(E.piece('screen','black','pawn',3,7));E.get(s,'rk').hp=1;
  const ranked=C.rankedActions(s);assert.equal(ranked[0].score,1000);assert(same(ranked[0],{type:'move',id:'bc',x:3,y:9}));
});
console.log(JSON.stringify({checks,inputUnchanged:true,rotationVerified:true}));
