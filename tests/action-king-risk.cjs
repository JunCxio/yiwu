const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({}),copy=x=>JSON.parse(JSON.stringify(x));
for(const script of scripts.slice(0,2))vm.runInContext(script,box);const E=box.Yiwu,C=box.YiwuComputer;
const names=['firstRoundLossRisk','kingExposureRisk','retreatConsequence','retreatRisks','retreatPreviewHTML','combatAdvice','combatFollowUpRisk','restAllowed','previewBoardAction','actionOutcomeRisk','requestRest'];
const helpers=names.map(name=>{const found=scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'));if(name==='kingExposureRisk'&&!found)return '';assert(found,'缺少界面函数：'+name);return found[0];}),escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null,screen="game",pendingRest=null;const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:"",textContent:"",focus(){}});return nodes.get(id);};const restDialog={open:false,showModal(){this.open=true;}};function computerTurn(){return false;}'+helpers.join('\n'),box);
const fixtures=require('./action-king-risk-fixture.json');let checks=0;
for(const fixture of fixtures)for(const rotated of [false,true]){
  let state;for(const [op,...args]of fixture.commands)if(op==='create')state=E.create(...args);else E[op](state,...args);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'),fixture.stateSHA256);
  if(rotated){
    state.turn=E.OTHER[state.turn];for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    if(state.duel)for(const key of ['origin','target']){state.duel[key].x=8-state.duel[key].x;state.duel[key].y=9-state.duel[key].y;}
    state.repetitions=Object.fromEntries(Object.entries(state.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));
  }
  const inspect=current=>{
    const before=JSON.stringify(current);box.state=current;vm.runInContext('s=state;restDialog.open=false;',box);let text;
    if(fixture.name==='retreat'){
      const ui={a:E.get(current,current.duel.a),d:E.get(current,current.duel.d),ctx:current.duel};for(const key of ['first','pending','computerChoice'])Object.defineProperty(ui,key,{get(){throw new Error('不得读取暗招');}});box.fightUI=ui;
      text=box.retreatPreviewHTML();const advice=copy(box.combatAdvice(ui.a,'retreat'));assert.equal(advice.risks.some(t=>t.includes('己方将帅受攻')),text.includes('己方将帅受攻'));
    }else {box.requestRest(fixture.piece,fixture.card,false);assert(vm.runInContext('restDialog.open',box));text=vm.runInContext('$("rest-content").innerHTML',box);}
    assert.equal(JSON.stringify(current),before);return text;
  };
  const after=copy(state);if(fixture.name==='retreat')E.retreat(after);else E.rest(after,fixture.piece,fixture.card);
  const king=E.get(after,fixture.king),threat=E.get(after,fixture.threat);assert.equal(king.hp,18);assert(E.canMove(after,threat,king.x,king.y));assert(!C.kingLostNext(after,king.side));assert.equal(box.firstRoundLossRisk(after,E.get(after,fixture.piece)),'');
  const text=inspect(state);assert(text.includes('己方将帅受攻'),'应提示满血将帅的几何威胁，不能只检查两轮必败');assert(text.includes(E.label(threat)));assert(text.includes((threat.x+1)+'路'+(10-threat.y)+'线'));assert(text.includes('不等于能击倒将帅'));assert(!text.includes('将帅漏防风险'));
  const safe=copy(state);E.get(safe,fixture.king).x=rotated?5:3;assert(!inspect(safe).includes('己方将帅受攻'));
  const ended=copy(state);ended.quiet=79;if(fixture.name==='retreat')ended.duel.totalDamage=0;assert(!inspect(ended).includes('己方将帅受攻'));
  const low=copy(state);E.get(low,fixture.king).hp=1;const lowText=inspect(low);if(fixture.name==='retreat')assert(lowText.includes('将帅漏防风险'));else assert(lowText.includes('己方将帅受攻'));
  checks++;
}
console.log('满血将帅风险：'+checks+'组完整历史、红黑换色、撤回两处提示、整备确认、安全与终局边界、不读暗招和输入不变通过。');
