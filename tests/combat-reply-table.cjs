const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const helpers=['reviewHTML','combatRepliesHTML','combatFollowUpRisk'].map(name=>scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'))[0]),escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null,fightUI;'+helpers.join('\n'),box);
const E=box.Yiwu,C=box.YiwuComputer,copy=x=>JSON.parse(JSON.stringify(x));let checks=0,previews=0,settlements=0;
const test=(name,run)=>{run();checks++;console.log('通过：'+name);};
function replay(limit){let s;const commands=require('./combat-followup-fixture.json').commands;for(const [op,...args]of commands.slice(0,limit)){if(op==='create')s=E.create(...args);else E[op](s,...args);}return s;}
function rotate(s){
  s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  const ctx=s.duel,a=E.get(s,ctx.a),d=E.get(s,ctx.d),next=E.context(s,a,d);s.duel={...next,round:ctx.round,forceA:ctx.forceA,forceD:ctx.forceD};return s;
}
function show(state,who,id,teaching=null){
  const ui={a:E.get(state,state.duel.a),d:E.get(state,state.duel.d),ctx:state.duel,pending:id,hint:''};
  for(const key of ['first','computerChoice'])Object.defineProperty(ui,key,{get(){assert(teaching,'不得读取未揭示暗招：'+key);return 'strike';}});
  box.input=state;box.ui=ui;box.whoId=who.id;box.teaching=teaching;
  return vm.runInContext('s=input;fightUI=ui;lesson=teaching;reviewHTML(E.get(s,whoId))',box);
}
function verify(state,who,id){
  const before=JSON.stringify(state),isA=who.id===state.duel.a,enemy=E.get(state,isA?state.duel.d:state.duel.a),rendered=show(state,who,id),table=rendered.match(/<details class="preview-scope reply-details">([^]*?)<\/details>/);
  assert(table,'已选招式应提供逐招对照');assert(!table[0].includes(' open'),'默认折叠');assert(table[0].includes('aria-label="逐招损血对照"'));
  const ids=[...table[1].matchAll(/<tr data-reply="([^"]+)">/g)].map(m=>m[1]);assert.deepEqual(ids,Array.from(C.choices(state,enemy,state.duel)));
  for(const reply of ids){
    const next=copy(state),a=E.get(next,next.duel.a),d=E.get(next,next.duel.d),oldA=a.hp,oldD=d.hp;E.resolve(next,isA?id:reply,isA?reply:id);settlements++;
    const afterA=E.get(next,a.id)?.hp||0,afterD=E.get(next,d.id)?.hp||0,loss=isA?oldA-afterA:oldD-afterD,damage=isA?oldD-afterD:oldA-afterA;
    const row=table[1].match(new RegExp('<tr data-reply="'+reply+'">([^]*?)<\\/tr>'))[1];
    assert(row.includes('<td>'+damage+'<small>对方余血 '+(enemy.hp-damage)+'</small></td>'));
    assert(row.includes('<td>'+loss+'<small>己方余血 '+(who.hp-loss)+'</small></td>'));
    assert(row.includes((E.BASE[reply]||E.CARDS[reply]).name));
  }
  assert.equal(JSON.stringify(state),before);previews++;return table[1];
}
test('合法第七次行动中，同类斩击和震步分别列出3点与5点损血',()=>{
  const state=replay(28);assert.equal(state.ply,7);assert.equal(state.duel.round,1);
  const who=E.get(state,'black_cannon_5'),table=verify(state,who,'cannon_pressure');
  assert(table.match(/data-reply="strike">([^]*?)<\/tr>/)[1].includes('<td>3<small>己方余血 '));
  assert(table.match(/data-reply="elephant_step">([^]*?)<\/tr>/)[1].includes('<td>5<small>己方余血 '));
});
test('进守双方、红黑旋转、不同气势与最后一轮逐项对应真实结算',()=>{
  for(const mirror of [false,true])for(const round of [1,6])for(const force of [0,2]){
    let state=replay(28);if(mirror)state=rotate(state);state.duel.round=round;state.duel.forceA=force;state.duel.forceD=2-force;
    for(const who of [E.get(state,state.duel.a),E.get(state,state.duel.d)])for(const id of C.choices(state,who,state.duel))verify(state,who,id);
  }
});
test('耗尽和条件不满足的对手培养牌不出现，换招重新计算',()=>{
  const state=replay(28),who=E.get(state,'black_cannon_5'),enemy=E.get(state,state.duel.d);enemy.exhausted=['elephant_step'];
  assert(!verify(state,who,'cannon_pressure').includes('data-reply="elephant_step"'));
  const ctx=E.create('tactics');E.move(ctx,'hero',4,4);const attacker=E.get(ctx,ctx.duel.a),defender=E.get(ctx,ctx.duel.d);defender.learned=['cannon_screen','cannon_hold'];
  assert(!verify(ctx,attacker,'strike').includes('data-reply="cannon_screen"'));verify(ctx,attacker,'break');
});
test('伤害超过生命时只列实际损血，包含双方阵亡和零伤害',()=>{
  const state=replay(28);for(const p of [E.get(state,state.duel.a),E.get(state,state.duel.d)])p.hp=1;
  for(const who of [E.get(state,state.duel.a),E.get(state,state.duel.d)])for(const id of C.choices(state,who,state.duel))verify(state,who,id);
});
test('未选招不显示结果，教学只保留公开固定回应，不混入其他招式',()=>{
  const state=replay(28),who=E.get(state,state.duel.a);assert(!show(state,who,null).includes('reply-details'));
  const teaching=show(state,who,'guard',{stage:'counter'});assert(!teaching.includes('reply-details'));assert(teaching.includes('对手固定出招'));
});
console.log(JSON.stringify({checks,previews,actualSettlements:settlements,inputUnchanged:true,hiddenChoicesUnread:true}));
