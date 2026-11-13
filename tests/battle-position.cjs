const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
scripts.slice(0,2).forEach(code=>vm.runInContext(code,box));
const helper=scripts[2].match(/  function battlePositionHTML\([\s\S]*?\n  \}/)?.[0];assert(helper);
vm.runInContext('const E=Yiwu;let s,lesson=null;'+helper,box);
vm.runInContext('Object.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
const E=box.Yiwu,copy=x=>JSON.parse(JSON.stringify(x));let passed=0,positions=0;
function test(name,run){run();passed++;console.log('通过：'+name);}
function render(state,teaching=false){const before=JSON.stringify(state);box.input=state;box.teaching=teaching;const result=vm.runInContext('s=input;lesson=teaching; battlePositionHTML()',box);assert.equal(JSON.stringify(state),before);positions++;return result;}
function expected(state){return ['red','black'].flatMap(side=>{
  const king=state.pieces.find(p=>p.side===side&&p.kind==='king');
  return state.pieces.filter(p=>p.side!==side&&E.canMove(state,p,king.x,king.y)).map(p=>({king,enemy:p}));
});}
function verify(state){const result=render(state),incoming=state.phase==='board'?expected(state):[];assert.equal(result.includes('aria-label="战后将帅受攻"'),incoming.length>0);
  if(incoming.length){assert(result.includes('轮到'+E.SIDE[state.turn]+'行动'));assert(result.includes('不等于能击倒'));for(const {king,enemy}of incoming){assert(result.includes(E.label(king)+'（生命 '+king.hp+' / 18）'));assert(result.includes(E.label(enemy)+'（'+(enemy.x+1)+'路'+(10-enemy.y)+'线）'));}}
  return result;
}
function replay(commands){let state;for(const [op,...args]of commands){if(op==='create')state=E.create(...args);else E[op](state,...args);}return state;}
const commands=require('./combat-followup-fixture.json').commands;
test('合法历史中继续交战不显示，真实末轮离场与撤回按实际落位显示',()=>{
  const state=replay(commands);assert.equal(state.phase,'duel');assert.equal(state.duel.round,6);assert.equal(render(state),'');
  for(const aId of Object.keys(E.BASE).concat(E.get(state,state.duel.a).learned).filter(id=>!E.availability(state,E.get(state,state.duel.a),id,state.duel)))
    for(const dId of Object.keys(E.BASE).concat(E.get(state,state.duel.d).learned).filter(id=>!E.availability(state,E.get(state,state.duel.d),id,state.duel))){const next=copy(state);E.resolve(next,aId,dId);verify(next);}
  const withdrawn=copy(state);E.retreat(withdrawn);assert(verify(withdrawn).includes('战后将帅受攻'));
});
test('红黑双方、多个来攻者、炮架与阻挡及生命变化使用真实走法',()=>{
  for(const rotated of [false,true])for(const screenX of [0,4]){
    const state=E.create('attrition');state.pieces=[['rk','red','king',4,9,2],['bk','black','king',3,0,18],['br','black','rook',4,5,8],['bc','black','cannon',0,9,18],['bp','black','pawn',5,9,18],['rr','red','rook',0,0,18],['screen','red','pawn',screenX===4?4:2,screenX===4?7:9,18]].map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));
    // 构造站位仅验证文字与走法关系，不作为自然对局或平衡样本。
    assert.equal(E.canMove(state,E.get(state,'br'),4,9),screenX===0);assert.equal(E.canMove(state,E.get(state,'bc'),4,9),screenX===0);
    state.phase='board';if(rotated){state.turn='black';for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}}
    const result=verify(state);assert(result.includes('生命 2 / 18'));assert.equal(result.includes('生命 8 / 18'),false);
  }
});
test('解除受攻后清除说明，终局、教学与残局不添加普通对局提示',()=>{
  const state=replay(commands);E.retreat(state);assert(verify(state));
  state.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',3,0)];assert.equal(verify(state),'');
  state.phase='ended';state.winner='red';assert.equal(render(state),'');
  const normal=replay(commands);E.retreat(normal);assert.equal(render(normal,true),'');
  for(const scenario of Object.keys(E.CHALLENGES)){const challenge=copy(normal);challenge.scenario=scenario;assert.equal(render(challenge),'');}
});
test('只在结果和撤回结果中调用，不新增结算、暗招读取或保存写入',()=>{
  assert(scripts[2].includes("if(['result','retreated'].includes(ui.step))html+=battlePositionHTML();"));
  assert(!/C\.|fightUI|resolve\(|retreat\(|save|localStorage|Math\.random/.test(helper));
  const state=replay(commands);E.retreat(state);const before=JSON.stringify(state);assert.equal(render(state),render(copy(state)));assert.equal(JSON.stringify(state),before);
});
console.log(JSON.stringify({passed,positions,inputUnchanged:true,hiddenChoicesUnread:true}));
