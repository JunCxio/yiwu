const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1],box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));
let checks=0,branches=0,fixtures=0,opportunities=0,spent=0,boardFixtures=0,boardWins=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function battle(kind='king',loadout=0,mirrored=false,engage=true){
  const s=E.create('quick');s.pieces=[E.piece('royal','red','king',kind==='king'?5:3,9),E.piece('target','black','king',5,0)];
  if(kind!=='king')s.pieces.push(E.piece('hero','red',kind,kind==='horse'?4:5,kind==='horse'?2:kind==='pawn'?1:3));
  if(kind==='cannon')s.pieces.push(E.piece('screen','red','pawn',5,2));
  const a=E.get(s,kind==='king'?'royal':'hero'),d=E.get(s,'target');
  if(loadout){a.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind).slice(loadout===3?1:0,loadout===3?3:2);d.learned=['king_calm',loadout===3?'king_command':'king_lead'];}
  if(loadout===2){a.exhausted=a.learned.slice(0,1);d.exhausted=['king_calm'];}
  if(loadout===3)s.pieces.push(E.piece('support','black','rook',8,0));
  if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.phase='board';s.turn=a.side;s.repetitions={};if(engage)E.move(s,a.id,d.x,d.y);return s;
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

test('基础反制限制两轮可确保的伤害上限，裁剪结果仍与完整结算一致',()=>{
  for(const kind of ['king','rook','horse','pawn','cannon'])for(const loadout of [0,1,2,3])for(const round of [1,2,5])for(const mirrored of [false,true])for(const hp of [round===1?4:3,18]){
    const s=battle(kind,loadout,mirrored);s.duel.round=round;s.duel.forceA=2;s.duel.forceD=loadout%3;E.get(s,s.duel.d).hp=hp;
    const side=E.get(s,s.duel.a).side,before=JSON.stringify(s),expected=twoRounds(s);
    assert.equal(expected.length,0);assert.deepEqual(Array.from(C.twoRoundWinningChoices(s,side)),Array.from(expected));
    assert.equal(JSON.stringify(s),before);fixtures++;
  }
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
function threatenedWin(mirrored=false){
  const s=E.create('attrition');s.pieces=[E.piece('royal','red','king',3,9),E.piece('target','black','king',5,0),E.piece('hero','red','rook',5,3),E.piece('threat','black','rook',3,5)];
  E.get(s,'royal').hp=1;E.get(s,'target').hp=3;s.repetitions={};
  if(mirrored){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  return s;
}

test('走棋优先选择可确保两轮获胜的进攻，不为普通避险放弃胜局',()=>{
  for(const mirrored of [false,true]){
    const s=threatenedWin(mirrored),target=E.get(s,'target'),before=JSON.stringify(s),next=copy(s);E.move(next,'hero',target.x,target.y);
    assert.equal(oneRound(next).length,0);assert(verifyPlan(next).length);
    const ranked=C.rankedActions(s),attack=ranked.find(x=>x.id==='hero'&&x.x===target.x&&x.y===target.y);assert.equal(attack.score,1000);
    for(const roll of [0,.25,.5,.75,.999999]){const chosen=C.board(s,()=>roll);assert.equal(chosen.id,'hero');assert.equal(chosen.x,target.x);assert.equal(chosen.y,target.y);}
    assert.equal(JSON.stringify(s),before);
  }
});

test('棋盘入口的两轮胜局覆盖兵种、培养、耗尽与红黑镜像，并按实际选招兑现',()=>{
  for(const kind of ['king','rook','horse','pawn','cannon'])for(const loadout of [0,1,2,3])for(const mirrored of [false,true]){
    const s=battle(kind,loadout,mirrored,false),a=E.get(s,kind==='king'?'royal':'hero'),d=E.get(s,'target');a.hp=12;d.hp=3;
    const next=copy(s);E.move(next,a.id,d.x,d.y);const expected=twoRounds(next),immediate=oneRound(next),before=JSON.stringify(s);
    const action=C.rankedActions(s).find(x=>x.id===a.id&&x.x===d.x&&x.y===d.y);assert(action);
    if(expected.length){assert.equal(action.score,1000);verifyPlan(next);if(!immediate.length)boardWins++;}
    else if(!immediate.length)assert(action.score<1000);
    assert.equal(JSON.stringify(s),before);boardFixtures++;
  }
  assert(boardWins>=10);
});

test('棋盘两轮检查不将同归于尽、普通目标或残局提前击将判为必胜',()=>{
  for(const mirrored of [false,true]){
    const s=battle('king',0,mirrored,false),a=E.get(s,'royal'),d=E.get(s,'target');a.hp=1;d.hp=1;
    const before=JSON.stringify(s),action=C.rankedActions(s).find(x=>x.id===a.id&&x.x===d.x&&x.y===d.y);assert(action.score<1000);assert.equal(JSON.stringify(s),before);
    const ordinary=threatenedWin(mirrored);E.get(ordinary,'target').kind='rook';const target=E.get(ordinary,'target');
    assert(C.rankedActions(ordinary).find(x=>x.id==='hero'&&x.x===target.x&&x.y===target.y).score<1000);
  }
  for(const scenario of Object.keys(E.CHALLENGES)){
    const s=E.create(scenario),king=s.pieces.find(p=>p.side==='black'&&p.kind==='king');king.hp=3;s.pieces.push(E.piece('probe','red','rook',king.x,king.y+2));
    const before=JSON.stringify(s);assert(C.rankedActions(s).find(x=>x.id==='probe'&&x.x===king.x&&x.y===king.y).score<1000);assert.equal(JSON.stringify(s),before);
  }
});

test('交战预览说明两轮获胜所需首招与下一轮重选，不读取暗招或修改棋局',()=>{
  const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][2][1];
  vm.runInContext(source.match(/  function openingAdvice\([\s\S]*?\n  }/)[0],box);
  for(const mirrored of [false,true]){
    const s=threatenedWin(mirrored),before=JSON.stringify(s);box.input=s;
    const hint=vm.runInContext('s=input;openingAdvice(E.context(s,E.get(s,"hero"),E.get(s,"target")))',box);
    assert(hint.twoRound);assert(hint.reason.includes('「斩击」或「破势」'));assert(hint.reason.includes('可确保至迟下一轮获胜'));assert(hint.reason.includes('按揭示后的新状态选择下一轮必胜招式'));
    assert.equal(JSON.stringify(s),before);
    E.get(s,'target').hp=18;
    assert(!vm.runInContext('openingAdvice(E.context(s,E.get(s,"hero"),E.get(s,"target")))',box).twoRound);
  }
});
test('自然快速局的完整命令重放后，抓住第50次行动的两轮飞将胜局',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'computer-two-round-fixture.json'),'utf8'));let s;
  for(const [op,...args]of fixture.commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}
  assert.equal(s.phase,'board');assert.equal(s.ply,49);assert.equal(s.turn,'black');assert.equal(E.get(s,'red_king_0').hp,3);
  const before=JSON.stringify(s),next=copy(s),ranked=C.rankedActions(s);
  assert.equal(ranked[0].id,'black_king_0');assert.equal(ranked[0].x,5);assert.equal(ranked[0].y,8);assert.equal(ranked[0].score,1000);
  E.move(next,ranked[0].id,ranked[0].x,ranked[0].y);assert.equal(oneRound(next).length,0);assert(verifyPlan(next).length);
  assert.equal(JSON.stringify(s),before);
});
console.log(JSON.stringify({checks,fixtures,opportunities,boardFixtures,boardWins,actualSettlementBranches:branches,branchesWithCardConsumption:spent,inputUnchanged:true}));
