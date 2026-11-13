const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const helpers=['combatAdvice','combatForecastHTML','combatRepliesHTML','combatFollowUpRisk'].map(name=>scripts[2].match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))?.[0]).filter(Boolean),escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null;'+helpers.join('\n'),box);
vm.runInContext('Object.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
const E=box.Yiwu,C=box.YiwuComputer,copy=value=>JSON.parse(JSON.stringify(value));let checks=0,settlements=0,inputs=0;
const test=(name,run)=>{run();checks++;console.log('通过：'+name);};
function replay(){let s;for(const [op,...args]of require('./combat-followup-fixture.json').commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}return s;}
function forcedLoss(next,side,rounds=3){
  if(next.phase!=='board'||next.turn!==E.OTHER[side])return false;
  const king=next.pieces.find(p=>p.side===side&&p.kind==='king');
  function wins(state,attacker,defender,left){
    return C.choices(state,E.get(state,attacker),state.duel).some(id=>C.choices(state,E.get(state,defender),state.duel).every(reply=>{
      const end=copy(state);E.resolve(end,id,reply);settlements++;
      return end.phase==='ended'?end.winner===E.OTHER[side]:left>1&&end.phase==='duel'&&wins(end,attacker,defender,left-1);
    }));
  }
  return next.pieces.filter(p=>p.side!==side&&E.canMove(next,p,king.x,king.y)).some(p=>{
    const battle=copy(next);E.move(battle,p.id,king.x,king.y);return wins(battle,p.id,king.id,rounds);
  });
}
function verify(state,who,id){
  const before=JSON.stringify(state),isA=who.id===state.duel.a,enemy=E.get(state,isA?state.duel.d:state.duel.a),expected=[],expectedTwo=[];
  for(const reply of C.choices(state,enemy,state.duel)){
    const next=copy(state);E.resolve(next,isA?id:reply,isA?reply:id);settlements++;
    if(forcedLoss(next,who.side))expected.push((E.BASE[reply]||E.CARDS[reply]).name);
    if(forcedLoss(next,who.side,2))expectedTwo.push((E.BASE[reply]||E.CARDS[reply]).name);
  }
  box.input=state;box.whoId=who.id;box.choice=id;
  const result=vm.runInContext('s=input;({forecast:combatForecastHTML(E.get(s,whoId),choice),details:combatRepliesHTML(E.get(s,whoId),choice),advice:combatAdvice(E.get(s,whoId),choice)})',box);
  assert.equal(result.forecast.includes('交战后将帅有漏防风险'),expected.length>0);
  assert.equal(result.details.includes('aria-label="交战后将帅风险"'),expected.length>0);
  assert.equal(result.advice.risks.some(text=>text.includes('交战后将帅漏防风险')),expected.length>0);
  if(expected.length){
    const names=expected.join('、');assert(result.details.includes('对手本轮用「'+names+'」'));assert(result.advice.risks.some(text=>text.includes('「'+names+'」')));
    assert(expectedTwo.every(name=>expected.includes(name)));assert(result.details.includes('武斗'+(expectedTwo.length===expected.length?'两':'三')+'轮内'));assert(result.details.includes('不预知暗招'));assert(result.forecast.includes('pick-forecast danger'));
  }
  assert.equal(JSON.stringify(state),before);inputs++;return {expected,...result};
}
function capture(rotated=false,kingHp=9){
  const s=E.create('attrition');s.pieces=[['rk','red','king',4,9,kingHp],['bk','black','king',3,0,18],['target','black','pawn',4,8,1],['br','black','rook',4,5,18]].map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));
  E.get(s,'target').learned=['pawn_advance','pawn_grit'];s.repetitions={};
  if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
  const target=E.get(s,'target');E.move(s,'rk',target.x,target.y);return s;
}
test('63 条合法续局命令复现第六轮离场后的将帅风险，换招同步清除',()=>{
  const s=replay(),a=E.get(s,s.duel.a);assert.equal(s.ply,21);assert.equal(s.duel.round,6);assert.equal(a.hp,2);
  assert.deepEqual(verify(s,a,'guard').expected,['架势','蓄势']);assert.deepEqual(verify(s,a,'strike').expected,[]);
});
test('吃子本轮全部存活仍显示后续漏防，红黑与不同生命、回应一致',()=>{
  for(const rotated of [false,true])for(const kingHp of [9,10,18]){
    const s=capture(rotated,kingHp),who=E.get(s,'rk');
    for(const id of C.choices(s,who,s.duel))verify(s,who,id);
    const result=verify(s,who,'break');assert(result.forecast.includes('本子本轮可存活'));
    assert.equal(result.expected.length>0,kingHp<18);
  }
});
test('其他棋子吃子让开将帅防线时，同样使用本轮真实落位检查',()=>{
  for(const rotated of [false,true]){
    const s=E.create('attrition');s.repetitions={};
    s.pieces=[['king','red','king',4,9,1],['bk','black','king',3,0,18],['rook','red','rook',4,5,18],['target','black','pawn',0,5,1],['br','black','rook',4,0,18]].map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));
    if(rotated){s.turn='black';for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
    const rook=E.get(s,'rook'),target=E.get(s,'target');E.move(s,rook.id,target.x,target.y);
    for(const id of C.choices(s,rook,s.duel))verify(s,rook,id);
  }
});
test('守方结束后轮到己方、交战继续、真实终局均不虚构下一手败局',()=>{
  const s=replay();for(const id of C.choices(s,E.get(s,s.duel.d),s.duel))assert.deepEqual(verify(s,E.get(s,s.duel.d),id).expected,[]);
  const ongoing=E.create('tactics');E.move(ongoing,'hero',4,4);assert.deepEqual(verify(ongoing,E.get(ongoing,'hero'),'guard').expected,[]);
  const drawn=replay();
  for(const reply of C.choices(drawn,E.get(drawn,drawn.duel.d),drawn.duel)){
    const next=copy(drawn);E.resolve(next,'guard',reply);if(next.phase==='board')drawn.repetitions[E.key(next)]=E.DRAW.repetitions-1;
  }
  assert.deepEqual(verify(drawn,E.get(drawn,drawn.duel.a),'guard').expected,[]);
  const quiet=replay();quiet.quiet=E.DRAW.quiet-1;quiet.duel.totalDamage=0;quiet.duel.history=[];assert.deepEqual(verify(quiet,E.get(quiet,quiet.duel.a),'guard').expected,[]);
});
test('培养条件、耗尽、气势和轮次变化按真实回应枚举，输入保持不变',()=>{
  for(const rotated of [false,true])for(const round of [1,5,6])for(const force of [0,2]){
    const s=capture(rotated,9);s.duel.round=round;s.duel.forceA=force;s.duel.forceD=2-force;
    const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);a.learned=['king_calm','king_lead'];a.exhausted=force?['king_calm']:[];d.exhausted=force?['pawn_grit']:[];
    for(const who of [a,d])for(const id of C.choices(s,who,s.duel))verify(s,who,id);
  }
});
test('未选招、固定教学和残局不新增普通棋局的漏防提示，也不读取暗招',()=>{
  const s=replay();box.input=s;vm.runInContext('s=input',box);assert.equal(vm.runInContext('combatForecastHTML(E.get(s,s.duel.a),null)',box),'');
  vm.runInContext('lesson={}',box);assert.equal(vm.runInContext('combatFollowUpRisk(E.get(s,s.duel.a),"guard").length',box),0);vm.runInContext('lesson=null',box);
  const challenge=E.create('challenge-tempo');E.move(challenge,'hero',4,4);box.input=challenge;vm.runInContext('s=input',box);assert.equal(vm.runInContext('combatFollowUpRisk(E.get(s,"hero"),"strike").length',box),0);
});
console.log(JSON.stringify({checks,inputs,actualSettlements:settlements,inputUnchanged:true,hiddenChoicesUnread:true}));
