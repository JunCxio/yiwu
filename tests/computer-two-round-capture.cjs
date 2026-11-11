const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);vm.runInContext(scripts[1],box);const E=box.Yiwu,C=box.YiwuComputer,copy=x=>JSON.parse(JSON.stringify(x)),fixture=require('./computer-two-round-capture-fixture.json');
let original;for(const [op,...args]of fixture.commands){if(op==='create')original=E.create(...args);else E[op](original,...args);}
assert.equal(original.phase,'board');assert.equal(original.ply,328);
const same=(a,b)=>a.type===b.type&&a.id===b.id&&a.x===b.x&&a.y===b.y;
function rotate(s){
  s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));return s;
}
let branches=0;
for(const rotated of [false,true]){
  const s=rotated?rotate(copy(original)):copy(original),action={...fixture.action,...(rotated?{x:8-fixture.action.x,y:9-fixture.action.y}:{})},before=JSON.stringify(s),ranked=copy(C.rankedActions(s));
  assert(same(ranked[0],action),'两轮可靠吃马并解除受攻应优于继续移将');
  for(const roll of [0,.25,.5,.75,.999999])assert(same(C.board(s,()=>roll,'standard'),action));
  for(const roll of [0,.5,.999999])assert(C.actions(s).some(a=>same(a,C.board(s,()=>roll,'practice'))));
  const duel=copy(s),target=E.at(s,action.x,action.y).id;E.move(duel,action.id,action.x,action.y);
  const plan=copy(C.twoRoundCapturePlan(duel));assert(plan.length);assert(plan.every(p=>p.rounds===2));
  const selected=copy(C.combatPlan(duel,s.turn));assert(selected.length);assert(Math.abs(selected.reduce((n,p)=>n+p.weight,0)-1)<1e-9);assert(selected.every(p=>plan.some(q=>q.id===p.id)));
  for(const first of selected)for(const reply of C.choices(duel,E.get(duel,target),duel.duel)){
    const next=copy(duel);E.resolve(next,first.id,reply);
    if(next.phase==='duel'){
      const second=copy(C.combatPlan(next,s.turn));assert(second.every(p=>p.id!=='retreat'));
      for(const id of second)for(const other of C.choices(next,E.get(next,target),next.duel)){
        const end=copy(next);E.resolve(end,id.id,other);assert(E.get(end,action.id));assert(!E.get(end,target));assert(end.phase!=='duel');assert(!C.kingLostNext(end,s.turn));branches++;
      }
    }else{assert(E.get(next,action.id));assert(!E.get(next,target));assert(!C.kingLostNext(next,s.turn));branches++;}
  }
  assert.equal(JSON.stringify(s),before);
  const tooHealthy=copy(duel);E.get(tooHealthy,target).hp=4;assert.deepEqual(copy(C.twoRoundCapturePlan(tooHealthy)),[]);
  const dying=copy(duel);E.get(dying,action.id).hp=1;assert.deepEqual(copy(C.twoRoundCapturePlan(dying)),[]);
  const lastRound=copy(duel);lastRound.duel.round=6;assert.deepEqual(copy(C.twoRoundCapturePlan(lastRound)),[]);
  const challenge=copy(duel);challenge.scenario='challenge-tempo';assert.deepEqual(copy(C.twoRoundCapturePlan(challenge)),[]);
}
for(const kingHP of [1,18])for(const blocked of [false,true]){
  const s=E.create('quick');s.phase='board';s.turn='red';s.pieces=[['rk','red','king',4,9,kingHP],['bk','black','king',5,0,18],['a','red','rook',4,5,18],['d','black','pawn',5,5,3],['br','black','rook',4,0,18],...(blocked?[['block','red','pawn',4,6,18]]:[])].map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));s.repetitions={[E.key(s)]:1};
  E.move(s,'a',5,5);const before=JSON.stringify(s),plan=copy(C.twoRoundCapturePlan(s));assert.equal(plan.length>0,blocked,'吃子不能移开将帅防线');assert.equal(JSON.stringify(s),before);
}
console.log('两轮吃子：完整历史与换色排序、'+branches+'条实际选招回应分支、两种电脑、生命与轮次边界、残局排除、吃子后防线和输入不变通过。');
let scenes=0,opportunities=0,settlements=0;
const layouts={rook:[4,5,4,4],horse:[3,6,4,4],cannon:[4,7,4,4],pawn:[4,5,4,4],guard:[3,9,4,8],elephant:[2,9,4,7]};
function verifyFinish(state,a,d,side){assert(E.get(state,a));assert(!E.get(state,d));assert(state.phase!=='duel');assert.notEqual(state.winner,E.OTHER[side]);assert(!C.kingLostNext(state,side));}
for(const [kind,[x,y,tx,ty]]of Object.entries(layouts))for(const hp of [2,6,18])for(const targetHP of [2,3])for(const force of [0,2])for(const round of [1,5])for(const learned of [false,true])for(const rotated of [false,true]){
  const s=E.create('quick');s.phase='board';s.turn='red';s.pieces=[E.piece('rk','red','king',5,9),E.piece('bk','black','king',3,0),E.piece('a','red',kind,x,y),E.piece('d','black','rook',tx,ty)];
  if(kind==='cannon')s.pieces.push(E.piece('screen','red','pawn',4,6));
  E.get(s,'a').hp=hp;E.get(s,'d').hp=targetHP;
  if(learned){E.get(s,'a').learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind).slice(0,2);E.get(s,'d').learned=['rook_crush','rook_lock'];}
  s.repetitions={[E.key(s)]:1};if(rotated)rotate(s);
  const side=s.turn;E.move(s,'a',rotated?8-tx:tx,rotated?9-ty:ty);s.duel.round=round;s.duel.forceA=force;s.duel.forceD=force;
  const before=JSON.stringify(s),captures=copy(C.twoRoundCapturePlan(s));scenes++;
  if(captures.length){
    opportunities++;const selected=copy(C.combatPlan(s,side));assert(selected.length);assert(selected.every(p=>Number.isFinite(p.weight)&&p.weight>=0&&captures.some(c=>c.id===p.id)));assert(Math.abs(selected.reduce((n,p)=>n+p.weight,0)-1)<1e-9);
    for(const first of selected)if(first.weight>0)for(const reply of C.choices(s,E.get(s,'d'),s.duel)){
      const next=copy(s);E.resolve(next,first.id,reply);settlements++;
      if(next.phase!=='duel'){verifyFinish(next,'a','d',side);continue;}
      const second=copy(C.combatPlan(next,side));assert(second.every(p=>p.id!=='retreat'));
      for(const pick of second)if(pick.weight>0)for(const defense of C.choices(next,E.get(next,'d'),next.duel)){
        const end=copy(next);E.resolve(end,pick.id,defense);verifyFinish(end,'a','d',side);settlements++;
      }
    }
  }
  assert.equal(JSON.stringify(s),before);
}
assert(opportunities>0);console.log(JSON.stringify({scenes,opportunities,actualPolicySettlements:settlements,inputUnchanged:true}));
const uiHelpers=['combatAdvice','combatFollowUpRisk'].map(name=>{const found=scripts[2].match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  }'));assert(found);return found[0];});
vm.runInContext('const E=Yiwu,C=YiwuComputer;let s,lesson=null;'+uiHelpers.join('\n')+'\nObject.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
for(const rotated of [false,true]){
  const s=rotated?rotate(copy(original)):copy(original),a=E.get(s,fixture.action.id),d=E.get(s,'black_horse_1');E.move(s,a.id,d.x,d.y);box.input=s;
  const before=JSON.stringify(s),advice=vm.runInContext('s=input;combatAdvice(E.get(s,s.duel.a),"strike")',box);
  assert(advice.reasons.some(reason=>reason.includes('两轮内击倒目标并保住进攻子')&&reason.includes('不代表整局获胜')));assert.equal(JSON.stringify(s),before);
  d.hp=4;assert(!vm.runInContext('combatAdvice(E.get(s,s.duel.a),"strike")',box).reasons.some(reason=>reason.includes('两轮内击倒目标')));
}
console.log('普通两轮吃子建议：红黑一致、目标生命边界、输入不变且不读取暗招通过。');
