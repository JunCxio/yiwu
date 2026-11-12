const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||path.join(__dirname,'..','index.html'),box=vm.createContext({});for(const m of [...fs.readFileSync(file,'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(m[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s)),fixture=require('./final-focus-fixture.json');let real;for(const [op,...args]of fixture.commands)if(op==='create')real=E.create(...args);else E[op](real,...args);
let checks=0,states=0,outcomes=0;function test(name,fn){fn();checks++;console.log('通过：'+name);}
function plan(s){const side=E.get(s,s.duel.d).side,before=JSON.stringify(s),p=copy(C.combatPlan(s,side));assert(p.length);assert(p.every(x=>Number.isFinite(x.weight)&&x.weight>=0&&C.choices(s,E.get(s,s.duel.d),s.duel).includes(x.id)));assert(Math.abs(p.reduce((n,x)=>n+x.weight,0)-1)<1e-9);assert.equal(JSON.stringify(s),before);states++;return p;}
function resolve(s,id,reply){const n=copy(s);E.resolve(n,id,reply);outcomes++;return n;}
test('合法历史中的守帅末轮把蓄势概率转给架势，其他概率保留',()=>{
  assert.equal(real.duel.round,6);const before=JSON.stringify(real),p=plan(real),prior=fixture.baselinePlan,idle=prior.find(x=>x.id==='focus');assert(idle.weight>0);assert(!p.some(x=>x.id==='focus'));
  for(const x of p)assert(Math.abs(x.weight-prior.find(q=>q.id===x.id).weight-(x.id==='guard'?idle.weight:0))<1e-12);
  for(const id of C.choices(real,E.get(real,real.duel.a),real.duel)){
    const f=resolve(real,id,'focus'),g=resolve(real,id,'guard');if(g.winner==='black')assert.equal(f.winner,'black');
    if(f.phase==='board'){assert.equal(g.phase,'board');assert(E.get(g,'red_king_0').hp>=E.get(f,'red_king_0').hp);assert(E.get(g,'black_rook_3').hp<=E.get(f,'black_rook_3').hp);}
    assert.equal(g.lastCombat.forceA,0);assert.equal(g.lastCombat.forceD,0);
  }assert.equal(JSON.stringify(real),before);
});
test('红黑旋转不改变末轮应招概率',()=>{
  const s=copy(real);s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}for(const k of ['origin','target']){s.duel[k].x=8-s.duel[k].x;s.duel[k].y=9-s.duel[k].y;}
  s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));assert.deepEqual(plan(s),plan(real));
});
function scene(kind='horse'){
  const s=E.create('attrition'),xy=kind==='king'?[5,0]:kind==='guard'?[4,1]:kind==='elephant'?[4,2]:[4,4];s.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',5,0),E.piece('a','red','rook',xy[0],xy[1]+2)];if(kind!=='king')s.pieces.push(E.piece('d','black',kind,...xy));s.repetitions={};E.move(s,'a',...xy);for(let n=0;n<5;n++)E.resolve(s,'guard','guard');return s;
}
test('七类守方的生命、气势和两张培养牌组合仍返回合法计划，安全末轮不蓄势',()=>{
  for(const kind of ['king','guard','elephant','pawn','rook','horse','cannon'])for(const hpD of [1,3,8,18])for(const hpA of [1,6,18])for(const forceA of [0,2])for(const forceD of [0,2])for(const variant of [0,1,2]){
    const s=scene(kind),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);a.hp=hpA;d.hp=hpD;s.duel.forceA=forceA;s.duel.forceD=forceD;
    a.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind==='rook').slice(variant%2,variant%2+2);d.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind).slice(variant%2,variant%2+2);if(variant===2){a.exhausted=a.learned.slice(0,1);d.exhausted=d.learned.slice(0,1);}
    const p=plan(s);if(hpD===18&&hpA===18&&forceD===0)assert(!p.some(x=>x.id==='focus'));
  }
});
test('蓄势或架势独有的第三次重复判和均保留原选择',()=>{
  for(const id of ['focus','guard']){const s=scene(),n=resolve(s,'strike',id);s.repetitions[E.key(n)]=E.DRAW.repetitions-1;assert.equal(resolve(s,'strike',id).winner,'draw');assert.equal(resolve(s,'strike',id==='focus'?'guard':'focus').phase,'board');const p=plan(s);assert(p.some(x=>x.id==='focus'&&x.weight>0));assert(p.some(x=>x.id==='guard'&&x.weight>0));}
});
test('前五轮和练习难度继续保留合法蓄势，培养蓄势牌由原省牌规则处理',()=>{
  const s=scene();assert(C.practicePlan(s,'black').some(x=>x.id==='focus'&&x.weight>0));for(const round of [1,2,3,4,5]){const n=copy(s);n.duel.round=round;assert(plan(n).some(x=>x.id==='focus'&&x.weight>0));}
  const n=scene('elephant'),d=E.get(n,n.duel.d);d.learned=['elephant_store'];plan(n);assert(C.choices(n,d,n.duel).includes('elephant_store'));
});
console.log(JSON.stringify({checks,states,outcomes,inputUnchanged:true}));
