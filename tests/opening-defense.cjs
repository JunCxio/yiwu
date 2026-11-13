const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const helpers=['supportDetailsHTML','openingAdvice','pawnEndRankRisk','firstRoundLossRisk','previewBoardAction','actionOutcomeRisk','adviceHTML','boardAdvice','challengeCombatHTML','previewHTML'].map(name=>{
  const found=scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'));assert(found,'缺少界面函数：'+name);return found[0];
});
const escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null,selected,preview;'+helpers.join('\n'),box);
const E=box.Yiwu,C=box.YiwuComputer,fixture=require('./opening-defense-fixture.json'),copy=value=>JSON.parse(JSON.stringify(value));let checks=0;
for(const rotated of [false,true]){
  let state;for(const [op,...args]of fixture.commands)if(op==='create')state=E.create(...args);else E[op](state,...args);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'),fixture.stateSHA256);
  let action=copy(fixture.action);
  if(rotated){
    state.turn=E.OTHER[state.turn];for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    state.repetitions=Object.fromEntries(Object.entries(state.repetitions).map(([key,n])=>{const [turn,pieces]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],pieces.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
    action.x=8-action.x;action.y=9-action.y;
  }
  const inspect=(current,move=action)=>{
    const before=JSON.stringify(current),a=E.get(current,move.id),d=E.at(current,move.x,move.y),ctx=E.context(current,a,d);
    box.input=current;box.attacker=a.id;box.target=d.id;vm.runInContext('s=input;selected=attacker;preview=target;',box);
    const secret={};for(const key of ['first','pending','computerChoice'])Object.defineProperty(secret,key,{get(){throw new Error('不得读取暗招');}});box.fightUI=secret;
    try{
      const opening=copy(box.openingAdvice(ctx)),advice=copy(box.boardAdvice(move)),preview=box.previewHTML();
      assert.equal(JSON.stringify(current),before);return {opening,advice,preview};
    }finally{delete box.fightUI;}
  };
  const a=E.get(state,action.id),d=E.at(state,action.x,action.y),king=state.pieces.find(p=>p.side===a.side&&p.kind==='king');
  assert(E.canMove(state,a,d.x,d.y));assert(E.canMove(state,d,king.x,king.y));assert.equal(C.battleOutlook(state,E.context(state,a,d)).finishes.length,0);
  const result=inspect(state),warning=result.opening.defense;
  assert(warning?.includes('解围尚未确认'),'交战前应明确提示将帅受攻尚未解除');
  assert(warning.includes(E.label(d)+'（'+(d.x+1)+'路'+(10-d.y)+'线）'));assert(warning.includes(E.label(king)));
  assert(warning.includes('撤回或六轮未分胜负'));assert(warning.includes('能发起武斗不等于能击倒将帅'));
  assert(result.advice.risks.includes(warning));assert(result.preview.includes(warning));checks++;
  const safe=copy(state),safeKing=E.get(safe,king.id);safeKing.x=rotated?3:5;safeKing.y=rotated?7:2;
  assert(!safe.pieces.some(p=>p.side!==a.side&&E.canMove(safe,p,safeKing.x,safeKing.y)));assert(!inspect(safe).opening.defense);checks++;
  const finish=copy(state);E.get(finish,d.id).hp=1;assert(C.battleOutlook(finish,E.context(finish,E.get(finish,a.id),E.get(finish,d.id))).finishes.length);assert(!inspect(finish).opening.defense);checks++;
  const kingAttack={type:'move',id:king.id,x:d.x,y:d.y};assert(E.canMove(state,king,d.x,d.y));assert(!inspect(state,kingAttack).opening.defense);checks++;
  const duel=copy(state);E.move(duel,a.id,d.x,d.y);box.input=duel;vm.runInContext('s=input;',box);assert(!box.openingAdvice(duel.duel).defense);checks++;
  const challenge=E.create('challenge-support'),goal=E.get(challenge,'target');assert(!inspect(challenge,{type:'move',id:'hero',x:goal.x,y:goal.y}).opening.defense);checks++;
}
console.log('交战解围提示：'+checks+'组完整历史、红黑换色、预览与建议、安全及首轮吃子边界、不读暗招和输入不变通过。');
