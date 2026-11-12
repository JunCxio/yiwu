const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({}),copy=x=>JSON.parse(JSON.stringify(x));
for(const script of scripts.slice(0,2))vm.runInContext(script,box);const E=box.Yiwu,C=box.YiwuComputer;
const helpers=['firstRoundLossRisk','kingExposureRisk','retreatConsequence','retreatRisks','retreatPreviewHTML','combatAdvice','combatFollowUpRisk'].flatMap(name=>scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'))||[]),escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null;'+helpers.join('\n'),box);
const fixture=require('./retreat-risk-fixture.json');let original;
for(const [op,...args]of fixture.commands){if(op==='create')original=E.create(...args);else E[op](original,...args);}
assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),fixture.stateSHA256);assert.equal(original.phase,'duel');assert(original.duel.round>=2);
function inspect(state){
  const before=JSON.stringify(state),ui={a:E.get(state,state.duel.a),d:E.get(state,state.duel.d),ctx:state.duel};
  for(const key of ['first','pending','computerChoice'])Object.defineProperty(ui,key,{get(){throw new Error('不得读取未揭示招式：'+key);}});
  box.state=state;box.fightUI=ui;vm.runInContext('s=state',box);
  const html=box.retreatPreviewHTML(),advice=copy(box.combatAdvice(ui.a,'retreat'));
  assert.equal(JSON.stringify(state),before);return {html,advice};
}
function rotated(state){
  state.turn=E.OTHER[state.turn];for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  for(const key of ['origin','target']){state.duel[key].x=8-state.duel[key].x;state.duel[key].y=9-state.duel[key].y;}
  state.repetitions=Object.fromEntries(Object.entries(state.repetitions).map(([key,count])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),count];}));return state;
}
for(const rotate of [false,true]){
  const state=rotate?rotated(copy(original)):copy(original),next=copy(state),p=E.get(next,next.duel.a);E.retreat(next);
  assert.equal(next.phase,'board');const incoming=next.pieces.filter(q=>q.side!==p.side&&E.canMove(next,q,p.x,p.y));assert(incoming.length);
  const {html,advice}=inspect(state);assert(html.includes('撤回后的风险'),'确认前应列出撤回后的追击风险');
  assert(html.includes('仍可被')&&html.includes('不代表脱离威胁'));assert(!html.includes('首轮吃子风险'));
  for(const enemy of incoming)assert(html.includes(E.label(enemy)));
  assert(advice.risks.some(text=>text.includes('不代表脱离威胁')));assert(advice.reasons.some(text=>text.includes('不再结算本轮伤害')));
  const low=copy(state),a=E.get(low,low.duel.a);a.hp=1;a.learned=[];a.exhausted=[];
  const risk=inspect(low);assert(risk.html.includes('首轮吃子风险'));assert(risk.advice.risks.some(text=>text.includes('任何当前可用招式回应都会在首轮阵亡')));
  const after=copy(low);E.retreat(after);const attack=after.pieces.find(q=>q.side!==a.side&&E.canMove(after,q,a.x,a.y)&&C.battleOutlook(after,E.context(after,q,E.get(after,a.id))).finishes.length);
  assert(attack);const id=C.battleOutlook(after,E.context(after,attack,E.get(after,a.id))).finishes[0];E.move(after,attack.id,a.x,a.y);
  for(const reply of C.choices(after,E.get(after,a.id),after.duel)){const branch=copy(after);E.resolve(branch,id,reply);assert(!E.get(branch,a.id));assert(E.get(branch,attack.id));}
}
{
  const state=E.create('attrition');state.pieces=[E.piece('rk','red','king',4,9),E.piece('bk','black','king',5,0),E.piece('a','red','pawn',4,6),E.piece('d','black','pawn',4,5),E.piece('threat','black','rook',0,9)];E.get(state,'rk').hp=1;state.repetitions={};
  E.move(state,'a',4,5);E.resolve(state,'guard','guard');const {html,advice}=inspect(state);assert(html.includes('撤回后将帅漏防风险'));assert(advice.risks.some(text=>text.includes('武斗两轮内击倒己方将帅')));
  const next=copy(state);E.retreat(next);assert(C.kingLostNext(next,'red'));
  const challenge=copy(next);challenge.scenario='challenge-relay';assert(!box.retreatRisks(challenge,'a').some(text=>text.includes('将帅漏防风险')));
  const ended=copy(state);ended.quiet=79;assert(!inspect(ended).html.includes('撤回后的风险'));const end=copy(ended);E.retreat(end);assert.equal(end.phase,'ended');
  const safe=copy(next);safe.pieces=safe.pieces.filter(p=>p.side==='red'||p.kind==='king');assert.deepEqual(copy(box.retreatRisks(safe,'a')),[]);
}
console.log('撤回风险：自然历史与红黑旋转、几何追击和首轮必吃区分、实际回应枚举、将帅漏防、终局与安全边界、两处界面一致及不读取暗招通过。');
