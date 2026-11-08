const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),box={};
vm.createContext(box);
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer;
const plain=value=>JSON.parse(JSON.stringify(value));
function scene(hpA=18,hpD=18,kindA='rook',kindD='pawn'){
  const s=E.create('attrition');
  s.pieces=[E.piece('rk','red','king',3,9),E.piece('bk','black','king',5,0),E.piece('a','red',kindA,4,5),E.piece('d','black',kindD,4,4)];
  E.get(s,'a').hp=hpA;E.get(s,'d').hp=hpD;s.repetitions={};return s;
}
let checks=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
test('红黑双方均不为进攻满血将帅而白送残血车',()=>{
  for(const rotate of [false,true]){
    const s=scene();s.pieces=s.pieces.filter(p=>p.id!=='d');const a=E.get(s,'a');a.x=5;a.y=2;a.hp=1;
    if(rotate){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
    const before=JSON.stringify(s),action=C.board(s,()=>0),enemy=s.pieces.find(p=>p.side!==s.turn&&p.kind==='king');
    assert(!(action.id==='a'&&action.x===enemy.x&&action.y===enemy.y));assert.equal(JSON.stringify(s),before);
  }
});
test('可确保击倒的每一招均经真实结算验证，进攻子必须存活',()=>{
  const s=scene(18,2),a=E.get(s,'a'),d=E.get(s,'d'),ctx=E.context(s,a,d),out=C.battleOutlook(s,ctx);
  assert(out.finishes.length);
  for(const id of out.finishes)for(const reply of C.choices(s,d,ctx)){
    const copy=plain(s);E.move(copy,a.id,d.x,d.y);E.resolve(copy,id,reply);
    assert(E.get(copy,a.id)?.hp>0);assert(!E.get(copy,d.id));
  }
});
test('守方可确保反杀的招式覆盖进攻方全部合法回应',()=>{
  const s=scene(1,18),a=E.get(s,'a'),d=E.get(s,'d'),ctx=E.context(s,a,d),out=C.battleOutlook(s,ctx);
  assert(out.counters.length);assert.equal(out.finishes.length,0);assert(out.score<0);
  for(const reply of out.counters)for(const id of C.choices(s,a,ctx)){
    const copy=plain(s);E.move(copy,a.id,d.x,d.y);E.resolve(copy,id,reply);
    assert(!E.get(copy,a.id));assert(E.get(copy,d.id)?.hp>0);
  }
});
test('减伤与耗尽改变可确保的首轮击倒判断',()=>{
  const s=scene(5,2,'horse'),a=E.get(s,'a'),d=E.get(s,'d');a.x=3;a.y=6;a.learned=['horse_evade'];
  assert.deepEqual(plain(C.battleOutlook(s,E.context(s,a,d)).finishes),['horse_evade']);
  a.exhausted=['horse_evade'];assert.equal(C.battleOutlook(s,E.context(s,a,d)).finishes.length,0);
});
test('标准电脑首轮选招落实已确认的存活击倒，练习电脑保留教学分布',()=>{
  for(const attacks of [true,false]){
    const s=attacks?scene(5,2,'horse'):scene(1,18),a=E.get(s,'a'),d=E.get(s,'d');
    if(attacks){a.x=3;a.y=6;a.learned=['horse_evade'];}
    E.move(s,a.id,d.x,d.y);const out=C.battleOutlook(s,s.duel),safe=attacks?out.finishes:out.counters,side=attacks?a.side:d.side;
    assert(safe.length);assert(C.combatPlan(s,side).every(x=>safe.includes(x.id)));
    assert(C.practicePlan(s,side).some(x=>!safe.includes(x.id)));
  }
});
test('同时阵亡不标作存活击倒，确定结束对局仍优先',()=>{
  const s=scene(1,1),a=E.get(s,'a'),d=E.get(s,'d');assert.equal(C.battleOutlook(s,E.context(s,a,d)).finishes.length,0);
  s.pieces=s.pieces.filter(p=>p.id!=='d');a.x=5;a.y=2;E.get(s,'bk').hp=1;
  const action=C.board(s,()=>0);assert.equal(action.id,'a');assert.equal(action.y,0);assert.equal(action.score,1000);
});
test('全部兵种的培养、条件和耗牌判断与合法招式矩阵一致且不修改状态',()=>{
  for(const kindA of Object.keys(E.NAMES.red))for(const kindD of Object.keys(E.NAMES.black))for(const hp of [1,2,5,18]){
    const s=scene(hp,19-hp,kindA,kindD),a=E.get(s,'a'),d=E.get(s,'d');
    for(const p of [a,d]){p.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind).slice(hp%2,hp%2+2);if(hp===5)p.exhausted=[p.learned[0]];}
    const ctx=E.context(s,a,d),before=JSON.stringify(s),rows=C.choices(s,a,ctx),cols=C.choices(s,d,ctx);
    const resolved=rows.map(x=>cols.map(y=>{
      const copy=plain(s);copy.phase='duel';copy.duel=plain(ctx);const ca=E.get(copy,a.id),cd=E.get(copy,d.id);
      E.resolve(copy,x,y);return {a:ca.hp,d:cd.hp};
    })),out=C.battleOutlook(s,ctx);
    assert.deepEqual(plain(out.finishes),plain(rows.filter((_,i)=>resolved[i].every(r=>r.d===0&&r.a>0))));
    assert.deepEqual(plain(out.counters),plain(cols.filter((_,j)=>resolved.every(row=>row[j].a===0&&row[j].d>0))));
    assert(Number.isFinite(out.score));assert.equal(JSON.stringify(s),before);
  }
});
test('首轮支援与条件牌、损血封顶均使用实际规则',()=>{
  const s=scene(18,1),a=E.get(s,'a'),d=E.get(s,'d');a.learned=['rook_crush','rook_hold'];
  s.pieces.push(E.piece('support','red','rook',0,4));const ctx=E.context(s,a,d),out=C.battleOutlook(s,ctx);
  assert(ctx.supportA.length);assert(C.choices(s,a,ctx).includes('rook_hold'));assert(out.finishes.includes('break'));
  assert(out.score>0&&out.score<4,'一血兵的收益不应按溢出伤害膨胀');
});
console.log('首轮判断：'+checks+' 项检查通过。');
