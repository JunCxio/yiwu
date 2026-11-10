const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const match of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(match[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));let groups=0,inputs=0,branches=0,safeInputs=0,fallbackInputs=0;
function test(name,run){run();groups++;console.log('通过：'+name);}
function verify(s,side){
  const before=JSON.stringify(s),ctx=s.duel,a=E.get(s,ctx.a),d=E.get(s,ctx.d),mine=a.side===side?a:d,enemy=mine===a?d:a,isA=mine===a;
  const ids=C.choices(s,mine,ctx).slice(),replies=C.choices(s,enemy,ctx);
  if(isA&&ctx.round>=2)ids.push('retreat');
  const safe=ids.filter(id=>replies.every(reply=>{
    const next=copy(s);if(id==='retreat')E.retreat(next);else E.resolve(next,isA?id:reply,isA?reply:id);branches++;
    return next.phase!=='ended'||next.winner!==enemy.side;
  }));
  const plan=C.combatPlan(s,side);assert(plan.length);assert(plan.every(x=>ids.includes(x.id)&&Number.isFinite(x.weight)&&x.weight>=0));
  assert(Math.abs(plan.reduce((n,x)=>n+x.weight,0)-1)<1e-9);
  if(safe.length){safeInputs++;assert(plan.every(x=>safe.includes(x.id)),'存在本轮不判负的招式时，不能给立即败局分支分配概率');}
  else fallbackInputs++;
  assert.equal(JSON.stringify(s),before);inputs++;return {plan:copy(plan),safe};
}
test('完整合法标准局记录：将帅三血对一血时排除残留蓄势概率',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'computer-king-choices-fixture.json'),'utf8'));let s;
  for(const [name,...args]of fixture.commands){if(name==='create')s=E.create(...args);else E[name](s,...args);}
  assert.equal(s.ply,52);assert.equal(s.duel.round,1);const mine=E.get(s,s.duel.d),enemy=E.get(s,s.duel.a);
  assert.equal(mine.hp,3);assert.equal(enemy.hp,1);
  const lost=copy(s);E.resolve(lost,'strike','focus');assert.equal(lost.winner,enemy.side);
  const {plan}=verify(s,mine.side);assert(!plan.some(x=>x.id==='focus'));
  for(const roll of [0,.25,.5,.75,.999999])assert.notEqual(C.combat(s,mine.side,()=>roll),'focus');
  assert(C.practicePlan(s,mine.side).some(x=>x.id==='focus'&&x.weight>0),'练习电脑继续保留原类型随机分布');
});
test('红黑进守、七类对手、气势、培养、濒死、末轮及无完整安全选择的分布有效',()=>{
  for(const kind of Object.keys(E.NAMES.red))for(const defending of [false,true])for(const mirrored of [false,true])
    for(const hp of [1,3,18])for(const enemyHp of [1,3,18])for(const round of [1,3,6])for(const forces of [[0,0],[1,2],[2,1]]){
      const s=E.create('attrition');s.repetitions={};
      s.pieces=[E.piece('royal','red','king',4,9),E.piece('enemy','black',kind,4,8),E.piece('helper','red','rook',3,8)];
      if(kind!=='king')s.pieces.push(E.piece('bk','black','king',3,0));
      const mine=E.get(s,'royal'),enemy=E.get(s,'enemy');mine.hp=hp;enemy.hp=enemyHp;mine.learned=['king_calm','king_command'];
      const cards=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind);enemy.learned=[cards[0],cards[2]];
      if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
      const a=defending?enemy:mine,d=defending?mine:enemy;s.phase='duel';s.turn=a.side;s.duel=E.context(s,a,d);
      Object.assign(s.duel,{round,forceA:forces[0],forceD:forces[1]});verify(s,mine.side);
    }
  assert(safeInputs>0&&fallbackInputs>0,'有完整安全选择与必须冒险的输入均应覆盖');
});
test('确定胜局仍优先，双方将帅同归于尽按和局处理',()=>{
  for(const hp of [1,18]){
    const s=E.create('attrition');s.pieces=[E.piece('royal','red','king',4,9),E.piece('enemy','black','king',4,0)];s.repetitions={};
    E.get(s,'royal').hp=hp;E.get(s,'enemy').hp=1;E.move(s,'royal',4,0);
    const {plan}=verify(s,'red');for(const choice of plan)for(const reply of C.choices(s,E.get(s,'enemy'),s.duel)){
      const next=copy(s);E.resolve(next,choice.id,reply);if(hp===18)assert.equal(next.winner,'red');else assert.notEqual(next.winner,'black');
    }
    if(hp===1){const mutual=copy(s);E.resolve(mutual,'strike','strike');assert.equal(mutual.winner,'draw');}
  }
});
console.log(JSON.stringify({groups,inputs,actualBranches:branches,safeInputs,fallbackInputs,inputUnchanged:true}));
