const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
let checks=0,branches=0,fixtures=0,opportunities=0,spent=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function battle(kind='king',loadout=0,mirrored=false){
  const s=E.create('quick');s.pieces=[E.piece('royal','red','king',kind==='king'?5:3,9),E.piece('target','black','king',5,0)];
  if(kind!=='king')s.pieces.push(E.piece('hero','red',kind,kind==='horse'?4:5,kind==='horse'?2:kind==='pawn'?1:3));
  if(kind==='cannon')s.pieces.push(E.piece('screen','red','pawn',5,2));
  const a=E.get(s,kind==='king'?'royal':'hero'),d=E.get(s,'target');
  if(loadout){a.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind).slice(loadout===3?1:0,loadout===3?3:2);d.learned=['king_calm',loadout===3?'king_command':'king_lead'];}
  if(loadout===2){a.exhausted=a.learned.slice(0,1);d.exhausted=['king_calm'];}
  if(loadout===3)s.pieces.push(E.piece('support','black','rook',8,0));
  if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.phase='board';s.turn=a.side;s.repetitions={};E.move(s,a.id,d.x,d.y);return s;
}
function oneRound(s){
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
  return C.choices(s,a,s.duel).filter(id=>C.choices(s,d,s.duel).every(reply=>{const next=copy(s);E.resolve(next,id,reply);branches++;return next.phase==='ended'&&next.winner===a.side;}));
}
function twoRounds(s){
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
  return C.choices(s,a,s.duel).filter(id=>C.choices(s,d,s.duel).every(reply=>{
    const next=copy(s);E.resolve(next,id,reply);branches++;
    return next.phase==='ended'?next.winner===a.side:next.phase==='duel'&&oneRound(next).length>0;
  }));
}
function verifyPlan(s){
  const side=E.get(s,s.duel.a).side,before=JSON.stringify(s),wins=twoRounds(s),immediate=oneRound(s),plan=C.combatPlan(s,side);
  assert(plan.length&&Math.abs(plan.reduce((n,row)=>n+row.weight,0)-1)<1e-9);
  for(const row of plan){assert(Number.isFinite(row.weight)&&row.weight>=0);if(row.weight>0&&wins.length)assert((immediate.length?immediate:wins).includes(row.id),'计划放弃已经验证的取胜招式');}
  if(wins.length){
    opportunities++;
    for(const {id,weight}of plan)if(weight>0)for(const reply of C.choices(s,E.get(s,s.duel.d),s.duel)){
      const next=copy(s);E.resolve(next,id,reply);branches++;
      if(E.CARDS[id]||E.CARDS[reply])spent++;
      if(next.phase==='ended'){assert.equal(next.winner,side);continue;}
      assert.equal(next.phase,'duel');
      for(const row of C.combatPlan(next,side))if(row.weight>0)for(const defense of C.choices(next,E.get(next,next.duel.d),next.duel)){
        const end=copy(next);E.resolve(end,row.id,defense);branches++;
        assert.equal(end.phase,'ended');assert.equal(end.winner,side);
      }
    }
  }
  assert.equal(JSON.stringify(s),before);return wins;
}
test('将帅进攻的两轮胜局必须由真实电脑计划落实，红黑一致',()=>{
  for(const mirrored of [false,true]){
    const s=battle('king',0,mirrored);E.get(s,s.duel.a).hp=12;E.get(s,s.duel.d).hp=3;s.duel.forceD=2;
    assert.deepEqual(Array.from(oneRound(s)),[]);assert.deepEqual(Array.from(verifyPlan(s)),['strike']);
  }
});
test('培养、减伤、条件牌、耗尽与气势逐分支按实际规则判断',()=>{
  assert.equal(typeof C.twoRoundWinningChoices,'function');
  for(const kind of ['king','rook','horse','pawn','cannon'])for(const loadout of [0,1,2,3])for(const round of [1,5])for(const mirrored of [false,true]){
    const s=battle(kind,loadout,mirrored);s.duel.round=round;s.duel.forceA=loadout%3;s.duel.forceD=(loadout+1)%3;
    E.get(s,s.duel.a).hp=loadout===2?5:12;E.get(s,s.duel.d).hp=loadout===3?6:3;
    const expected=verifyPlan(s);assert.deepEqual(Array.from(C.twoRoundWinningChoices(s,E.get(s,s.duel.a).side)),Array.from(expected));fixtures++;
  }
  assert(opportunities>10);assert(spent>0);
});
test('第五轮可兑现第六轮胜局，第六轮不能虚构第七轮',()=>{
  const s=battle();E.get(s,s.duel.a).hp=12;E.get(s,s.duel.d).hp=2;s.duel.forceD=2;s.duel.round=5;
  assert.deepEqual(Array.from(oneRound(s)),[]);assert(verifyPlan(s).includes('strike'));
  s.duel.round=6;assert.deepEqual(Array.from(C.twoRoundWinningChoices(s,'red')),[]);
});
test('双方将帅同时阵亡不算取胜，守方及普通目标不套用两轮保证',()=>{
  const s=battle();for(const p of s.pieces)p.hp=1;
  assert.deepEqual(Array.from(C.twoRoundWinningChoices(s,'red')),[]);
  const next=copy(s);E.resolve(next,'break','break');assert.equal(next.winner,'draw');
  const live=battle();E.get(live,live.duel.a).hp=12;E.get(live,live.duel.d).hp=3;live.duel.forceD=2;
  assert.deepEqual(Array.from(C.twoRoundWinningChoices(live,'black')),[]);
  E.get(live,live.duel.d).kind='rook';assert.deepEqual(Array.from(C.twoRoundWinningChoices(live,'red')),[]);
  assert.deepEqual(Array.from(C.twoRoundWinningChoices(E.create('quick'),'red')),[]);
});
test('残局不使用普通胜局判断，练习电脑保留原有出招分布',()=>{
  const s=battle();E.get(s,s.duel.a).hp=12;E.get(s,s.duel.d).hp=3;s.duel.forceD=2;
  assert(C.practicePlan(s,'red').some(row=>row.id==='guard'&&row.weight>0));
  for(const scenario of Object.keys(E.CHALLENGES)){s.scenario=scenario;assert.deepEqual(Array.from(C.twoRoundWinningChoices(s,'red')),[]);}
});
test('选招建议准确说明两轮保证与下一轮重选，不读取暗招或改写棋局',()=>{
  const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][2][1];
  const advice=source.match(/  function combatAdvice\([\s\S]*?\n  }/)[0];
  vm.runInContext('const E=Yiwu,C=YiwuComputer;let s;'+advice,box);
  vm.runInContext('Object.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
  for(const mirrored of [false,true]){
    const s=battle('king',0,mirrored);E.get(s,s.duel.a).hp=12;E.get(s,s.duel.d).hp=3;s.duel.forceD=2;
    const before=JSON.stringify(s);box.input=s;
    const hint=vm.runInContext('s=input;combatAdvice(E.get(s,s.duel.a),"strike")',box);
    assert(hint.reasons.includes('本招能确保至迟下一轮获胜；若本轮未结束，需按揭示后的新状态选择下一轮必胜招式。'));
    assert(hint.note.includes('不预知暗招'));assert(hint.note.includes('不推演更长序列'));
    for(const code of ['combatAdvice(E.get(s,s.duel.a),"guard")','combatAdvice(E.get(s,s.duel.d),"strike")']){
      assert(!vm.runInContext(code,box).reasons.some(reason=>reason.includes('至迟下一轮获胜')));
    }
    assert.equal(JSON.stringify(s),before);
    s.duel.round=6;assert(!vm.runInContext('combatAdvice(E.get(s,s.duel.a),"strike")',box).reasons.some(reason=>reason.includes('至迟下一轮获胜')));
  }
});
console.log(JSON.stringify({checks,fixtures,opportunities,actualSettlementBranches:branches,branchesWithCardConsumption:spent,inputUnchanged:true}));
