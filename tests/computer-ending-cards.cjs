const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
const fixture=require('./computer-ending-cards-fixture.json');
function replay(){let s;for(const [name,...args]of fixture.commands){if(name==='create')s=E.create(...args);else E[name](s,...args);}return s;}
function plan(s,side){
  const before=JSON.stringify(s),mine=E.get(s,s.duel.a).side===side?E.get(s,s.duel.a):E.get(s,s.duel.d),out=copy(C.combatPlan(s,side));
  assert(out.length&&out.every(x=>Number.isFinite(x.weight)&&x.weight>=0&&(x.id==='retreat'||!E.availability(s,mine,x.id,s.duel))));
  assert(Math.abs(out.reduce((n,x)=>n+x.weight,0)-1)<1e-9);assert.equal(JSON.stringify(s),before);return out;
}
function outcomes(s,side,id){
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),isA=a.side===side,mine=isA?a:d,enemy=isA?d:a;
  return C.choices(s,enemy,s.duel).map(reply=>{
    const next=copy(s);E.resolve(next,isA?id:reply,isA?reply:id);const survivor=E.get(next,mine.id);
    if(next.phase==='duel'||!survivor)return null;
    return {hp:survivor.hp,key:E.key({...next,pieces:next.pieces.map(p=>p.id===mine.id?{...p,hp:0,exhausted:[]}:p)}),phase:next.phase,winner:next.winner,reason:next.reason,quiet:next.quiet,visits:next.repetitions[E.key(next)]||0};
  });
}
function dominates(bases,cards){return bases.every((n,i)=>{const c=cards[i];return n&&c&&n.hp>=c.hp&&n.key===c.key&&n.phase===c.phase&&n.winner===c.winner&&n.reason===c.reason&&n.quiet===c.quiet&&n.visits<=c.visits;});}
function scene({kind='rook',enemyKind='rook',defending=false,mirrored=false,round=2,hp=18,enemyHp=1,force=0}={}){
  const s=E.create('attrition');s.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',5,0),E.piece('a','red',defending?enemyKind:kind,4,5),E.piece('d','black',defending?kind:enemyKind,4,4)];
  const mine=E.get(s,defending?'d':'a'),enemy=E.get(s,defending?'a':'d');mine.hp=hp;enemy.hp=enemyHp;
  mine.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind).slice(hp%2?1:0,hp%2?3:2);
  if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.turn=E.get(s,'a').side;s.repetitions={};s.phase='duel';s.duel=E.context(s,E.get(s,'a'),E.get(s,'d'));
  for(let i=1;i<round;i++)E.resolve(s,'guard','guard');s.duel.forceA=force;s.duel.forceD=force;return {s,mine,enemy};
}
let checks=0,states=0,branches=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
test('107 条完整合法命令复现第二轮震慑冗余，标准电脑与建议均省牌',()=>{
  const s=replay(),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);assert.equal(s.ply,48);assert.equal(s.duel.round,2);assert.equal(a.kind,'cannon');assert.equal(a.hp,17);assert.equal(d.kind,'horse');assert.equal(d.hp,1);
  assert(dominates(outcomes(s,fixture.side,fixture.base),outcomes(s,fixture.side,fixture.card)));
  const out=plan(s,fixture.side);assert(!out.some(x=>x.id===fixture.card));assert(out.some(x=>x.id===fixture.base&&x.weight>0));
  const sparedWeight=fixture.baselinePlan.find(x=>x.id===fixture.card).weight;
  for(const old of fixture.baselinePlan.filter(x=>x.id!==fixture.card))assert(Math.abs(out.find(x=>x.id===old.id).weight-old.weight-(old.id===fixture.base?sparedWeight:0))<1e-12,'只把省下的牌概率转给等效基础招式');
  for(const roll of [0,.25,.5,.75,.999999,fixture.baselineRoll])assert.notEqual(C.combat(s,fixture.side,()=>roll),fixture.card);
  assert(C.practicePlan(s,fixture.side).some(x=>x.id===fixture.card&&x.weight>0));
});
test('后续第二、三、六轮面对每个回应结算相同时保留培养牌，红黑进守一致',()=>{
  for(const round of [2,3,6])for(const mirrored of [false,true])for(const defending of [false,true]){
    const {s,mine}=scene({round,mirrored,defending});mine.learned=[defending?'rook_lock':'rook_crush'];const card=mine.learned[0],base=defending?'break':'strike';
    assert(dominates(outcomes(s,mine.side,base),outcomes(s,mine.side,card)));assert(!plan(s,mine.side).some(x=>x.id===card));
    assert(C.practicePlan(s,mine.side).some(x=>x.id===card));
  }
});
test('持续交战或培养牌能减少损血时仍保留，不仅比较伤害分数',()=>{
  const ongoing=scene({enemyHp:18});ongoing.mine.learned=['rook_lock'];assert(outcomes(ongoing.s,ongoing.mine.side,'break').some(x=>!x));assert(plan(ongoing.s,ongoing.mine.side).some(x=>x.id==='rook_lock'));
  for(const round of [2,3,6]){
    const {s,mine}=scene({kind:'horse',round,hp:5,enemyHp:1});mine.learned=['horse_evade'];const card=outcomes(s,mine.side,'horse_evade');
    assert(card.every(x=>x&&x.hp>0));assert(Object.keys(E.BASE).every(id=>!dominates(outcomes(s,mine.side,id),card)));assert(plan(s,mine.side).some(x=>x.id==='horse_evade'));
  }
});
test('基础招式触发立即判和而培养牌不判和时保留牌',()=>{
  for(const round of [2,6])for(const defending of [false,true]){
    const {s,mine,enemy}=scene({round,defending});mine.learned=['rook_crush'];const isA=mine.id===s.duel.a;
    for(const base of Object.keys(E.BASE))for(const reply of C.choices(s,enemy,s.duel)){
      const next=copy(s);E.resolve(next,isA?base:reply,isA?reply:base);if(next.phase!=='duel')s.repetitions[E.key(next)]=E.DRAW.repetitions-1;
    }
    assert(outcomes(s,mine.side,'strike').every(x=>x?.winner==='draw'));assert(outcomes(s,mine.side,'rook_crush').every(x=>x?.phase==='board'));
    assert(plan(s,mine.side).some(x=>x.id==='rook_crush'));
  }
});
test('即时结果虽相同但基础招式的局面访问次数更多时不为省牌增加风险',()=>{
  const {s,mine,enemy}=scene();mine.learned=['rook_crush'];
  for(const base of ['strike','break'])for(const reply of C.choices(s,enemy,s.duel)){const next=copy(s);E.resolve(next,base,reply);s.repetitions[E.key(next)]=1;}
  assert(outcomes(s,mine.side,'strike').every(x=>x&&x.phase==='board'&&x.visits===2));assert(outcomes(s,mine.side,'rook_crush').every(x=>x&&x.visits===1));assert(plan(s,mine.side).some(x=>x.id==='rook_crush'));
});
test('六轮后双方存活时只省结算相同的牌，保留有实际增伤的牌',()=>{
  const {s,mine}=scene({round:6,enemyHp:18});mine.learned=['rook_crush','rook_lock'];assert(dominates(outcomes(s,mine.side,'break'),outcomes(s,mine.side,'rook_lock')));assert(!dominates(outcomes(s,mine.side,'strike'),outcomes(s,mine.side,'rook_crush')));
  const out=plan(s,mine.side);assert(!out.some(x=>x.id==='rook_lock'));assert(out.some(x=>x.id==='rook_crush'));
});
test('六类普通棋子的构造快照与全部实际结算一致，输入不变且概率归一',()=>{
  for(const kind of ['rook','horse','cannon','pawn','guard','elephant'])for(const enemyKind of ['rook','horse'])for(const round of [2,3,6])for(const [hp,enemyHp]of [[18,1],[5,2],[18,18],[1,1]])for(const force of [0,2])for(const mirrored of [false,true])for(const defending of [false,true]){
    const {s,mine,enemy}=scene({kind,enemyKind,round,hp,enemyHp,force,mirrored,defending}),before=JSON.stringify(s),ids=C.choices(s,mine,s.duel),results=new Map(ids.map(id=>[id,outcomes(s,mine.side,id)])),out=plan(s,mine.side);
    const replies=C.choices(s,enemy,s.duel);states++;branches+=ids.length*replies.length;
    for(const id of ids){const excluded=!!E.CARDS[id]&&ids.some(base=>E.BASE[base]&&dominates(results.get(base),results.get(id)));assert.equal(out.some(x=>x.id===id),!excluded,JSON.stringify({kind,enemyKind,round,hp,enemyHp,force,mirrored,defending,id}));}
    assert.equal(JSON.stringify(s),before);
  }
});
console.log('交战结束省牌：'+checks+' 项检查，'+states+' 个构造输入，'+branches+' 条真实结算分支。');
