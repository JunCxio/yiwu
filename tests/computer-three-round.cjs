const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);const E=box.Yiwu,C=box.YiwuComputer,copy=x=>JSON.parse(JSON.stringify(x)),fixtures=require('./computer-three-round-fixture.json');let checks=0,branches=0,states=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
function replay(row){let s;for(const [op,...args]of row.commands)if(op==='create')s=E.create(...args);else E[op](s,...args);assert.equal(crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex'),row.stateSHA256);return s;}
function rotate(s){s=copy(s);s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}for(const key of ['origin','target']){s.duel[key].x=8-s.duel[key].x;s.duel[key].y=9-s.duel[key].y;}s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));return s;}
function oracle(s,left){
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
  return Array.from(C.choices(s,a,s.duel)).filter(id=>Array.from(C.choices(s,d,s.duel)).every(reply=>{
    const next=copy(s);E.resolve(next,id,reply);branches++;
    return next.phase==='ended'?next.winner===a.side:left>1&&next.phase==='duel'&&oracle(next,left-1).length>0;
  }));
}
function verifyContinuation(s,left){
  const side=E.get(s,s.duel.a).side,before=JSON.stringify(s),plan=copy(C.combatPlan(s,side));assert(plan.length);assert(Math.abs(plan.reduce((n,p)=>n+p.weight,0)-1)<1e-9);
  for(const row of plan){assert(row.weight>=0&&Number.isFinite(row.weight));if(!row.weight)continue;assert(C.choices(s,E.get(s,s.duel.a),s.duel).includes(row.id));
    for(const reply of C.choices(s,E.get(s,s.duel.d),s.duel)){const next=copy(s);E.resolve(next,row.id,reply);branches++;if(next.phase==='ended')assert.equal(next.winner,side);else{assert(left>1);assert.equal(next.phase,'duel');verifyContinuation(next,left-1);}}
  }assert.equal(JSON.stringify(s),before);
}
test('两份真实历史及换色的标准计划均兑现三轮取将，不放回非保证首招',()=>{
  for(const row of fixtures)for(const mirrored of [false,true]){
    const s=mirrored?rotate(replay(row)):replay(row),side=E.get(s,s.duel.a).side,before=JSON.stringify(s),expected=oracle(s,3);assert.deepEqual(expected,row.winning);assert.equal(C.twoRoundWinningChoices(s,side).length,0);
    const plan=C.combatPlan(s,side);assert(plan.every(p=>!p.weight||expected.includes(p.id)),'真实三轮胜局计划仍含不能保证取胜的招式');
    assert.deepEqual(Array.from(C.threeRoundWinningChoices(s,side)),expected);verifyContinuation(s,3);assert.equal(JSON.stringify(s),before);states++;
  }
});
test('三层独立结算核对七类棋子、气势、培养耗尽和生命裁剪',()=>{
  for(const kind of Object.keys(E.NAMES.red))for(const round of [1,3,4])for(const trained of [false,true])for(const hp of [3,4,18]){
    const s=E.create('quick');s.pieces=[E.piece('king','red','king',3,9),E.piece('hero','red',kind,4,2),E.piece('target','black','king',4,0)];if(kind==='king')s.pieces=s.pieces.filter(p=>p.id!=='king');const a=E.get(s,'hero'),d=E.get(s,'target');a.hp=trained?7:12;d.hp=hp;
    if(trained){a.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind).slice(0,2);a.exhausted=a.learned.slice(0,1);d.learned=['king_calm','king_lead'];d.exhausted=['king_lead'];}
    for(const side of ['red','black'])assert.equal(s.pieces.filter(p=>p.side===side&&p.kind==='king').length,1);
    s.phase='duel';s.turn='red';s.duel=E.context(s,a,d);s.duel.round=round;s.duel.forceA=trained?2:0;s.duel.forceD=trained?0:2;s.repetitions={};
    const before=JSON.stringify(s),expected=oracle(s,3);assert.deepEqual(Array.from(C.threeRoundWinningChoices(s,'red')),expected,JSON.stringify({kind,round,trained,hp}));if(expected.length)verifyContinuation(s,3);assert.equal(JSON.stringify(s),before);states++;
  }
});
test('轮数、守方、普通目标、残局及双将同归于尽不误报；练习分布保留',()=>{
  const original=replay(fixtures[0]),side=E.get(original,original.duel.a).side;
  for(const round of [5,6]){const s=copy(original);s.duel.round=round;assert.deepEqual(Array.from(C.threeRoundWinningChoices(s,side)),[]);}
  assert.deepEqual(Array.from(C.threeRoundWinningChoices(original,E.OTHER[side])),[]);
  const ordinary=copy(original);E.get(ordinary,ordinary.duel.d).kind='rook';assert.deepEqual(Array.from(C.threeRoundWinningChoices(ordinary,side)),[]);
  for(const scenario of Object.keys(E.CHALLENGES)){const s=copy(original);s.scenario=scenario;assert.deepEqual(Array.from(C.threeRoundWinningChoices(s,side)),[]);}
  assert.deepEqual(Array.from(C.threeRoundWinningChoices(E.create('quick'),'red')),[]);
  const mutual=copy(original);E.get(mutual,mutual.duel.a).kind='king';E.get(mutual,mutual.duel.a).hp=1;mutual.pieces=mutual.pieces.filter(p=>p.kind!=='king'||p.id===mutual.duel.a||p.side!==side);assert.equal(oracle(mutual,3).length,0);assert.deepEqual(Array.from(C.threeRoundWinningChoices(mutual,side)),[]);
  const practice=C.practicePlan(original,side);assert(practice.some(p=>p.id==='guard'&&p.weight>0));assert(practice.some(p=>p.id==='focus'&&p.weight>0));
});
test('建议说明三轮范围与逐轮重选，不读取暗招或改变输入',()=>{
  const names=['combatAdvice','combatFollowUpRisk'];vm.runInContext('const E=Yiwu,C=YiwuComputer;let s,lesson=null;'+names.map(name=>scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  }'))[0]).join('\n'),box);
  vm.runInContext('Object.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
  for(const row of fixtures)for(const mirrored of [false,true]){
    const s=mirrored?rotate(replay(row)):replay(row),before=JSON.stringify(s);box.input=s;
    for(const id of row.winning){box.id=id;const advice=vm.runInContext('s=input;combatAdvice(E.get(s,s.duel.a),id)',box);assert(advice.reasons.some(text=>text.includes('本场武斗的三轮内获胜')));assert(advice.reasons.some(text=>text.includes('按新状态重新选择')));assert(advice.note.includes('不预知暗招'));}
    for(const id of ['guard','focus']){box.id=id;assert(!vm.runInContext('combatAdvice(E.get(s,s.duel.a),id)',box).reasons.some(text=>text.includes('三轮内获胜')));}
    assert.equal(JSON.stringify(s),before);
  }
});
console.log(JSON.stringify({checks,states,actualSettlementBranches:branches,inputUnchanged:true}));
