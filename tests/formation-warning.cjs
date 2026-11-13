const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({}),copy=x=>JSON.parse(JSON.stringify(x));
scripts.slice(0,2).forEach(code=>vm.runInContext(code,box));const E=box.Yiwu,C=box.YiwuComputer;
const helpers=['firstRoundLossRisk','pawnEndRankRisk','previewBoardAction','actionOutcomeRisk','boardAdvice','adviceHTML'].map(name=>{const match=scripts[2].match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'));assert(match,'缺少界面函数：'+name);return match[0];}),escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null;'+helpers.join('\n'),box);Object.defineProperty(box,'fightUI',{get(){throw new Error('不得读取武斗暗招');}});
const fixtures=require('./formation-warning-fixture.json');let checks=0;
function set(state){box.state=state;vm.runInContext('s=state;',box);}
function replay(commands){let s;for(const [op,...args]of commands)if(op==='create')s=E.create(...args);else E[op](s,...args);return s;}
function independent(state,next){
 const own=new Set(state.pieces.filter(p=>p.side===state.turn).map(p=>p.id));const key=raw=>{const [turn,ps]=JSON.parse(raw);return JSON.stringify([turn,ps.map(([id,x,y,...rest])=>own.has(id)?[id,x,y,...rest]:[id,...rest])]);},wanted=key(E.key(next));
 return Object.entries(state.repetitions).reduce((n,[k,count])=>n+(key(k)===wanted?count:0),0);
}
for(const fixture of fixtures)for(const rotated of [false,true]){
 const state=replay(fixture.commands),action=copy(fixture.action);assert.equal(crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'),fixture.stateSHA256);
 if(rotated){state.turn=E.OTHER[state.turn];for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}state.repetitions=Object.fromEntries(Object.entries(state.repetitions).map(([key,n])=>{const [turn,ps]=JSON.parse(key);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));action.x=8-action.x;action.y=9-action.y;}
 set(state);const before=JSON.stringify(state),next=box.previewBoardAction(action);assert.equal(next.phase,'board');assert.equal(independent(state,next),fixture.ownVisits);assert.equal(C.formationRepeats(state,next),fixture.ownVisits);
 for(const preview of [false,true]){const advice=copy(box.boardAdvice(action,preview));assert.equal(advice.risks.filter(t=>t.includes('己方曾出现过的阵形')).length,1);assert(advice.risks.some(t=>t.includes('此前 '+fixture.ownVisits+' 次')&&t.includes('完整局面判和仍按双方全部状态判断')));assert(box.adviceHTML(advice,preview).includes('role="status"'));}
 assert.equal(JSON.stringify(state),before);checks++;
 const fresh=copy(state);fresh.repetitions={};set(fresh);assert.equal(C.formationRepeats(fresh,box.previewBoardAction(action)),0);assert(!box.boardAdvice(action).risks.some(t=>t.includes('己方曾出现过的阵形')));checks++;
 const full=copy(state);full.repetitions[E.key(next)]=1;set(full);const fullAdvice=box.boardAdvice(action);assert(fullAdvice.risks.some(t=>t.includes('完整局面将是第二次出现')));assert(!fullAdvice.risks.some(t=>t.includes('己方曾出现过的阵形')));checks++;
 const ended=copy(state);ended.quiet=79;set(ended);const outcome=box.boardAdvice(action,true);assert.equal(outcome.title,'此步将直接判和');assert(!outcome.risks.some(t=>t.includes('己方曾出现过的阵形')));checks++;
 const terminal=copy(state);terminal.repetitions[E.key(next)]=2;set(terminal);assert.equal(box.boardAdvice(action).title,'此步将直接判和');checks++;
 const only=copy(state);only.repetitions={};const historical=copy(next),enemy=historical.pieces.find(p=>p.side!==state.turn);enemy.x=(enemy.x+1)%9;only.repetitions[E.key(historical)]=1;
 assert.equal(C.formationRepeats(only,next),1);only.repetitions[E.key(historical)]=2;assert.equal(C.formationRepeats(only,next),2);delete only.repetitions[E.key(historical)];assert.equal(C.formationRepeats(only,next),0);checks++;
 only.repetitions[E.key(historical)]=1;for(const alter of [s=>E.get(s,action.id).hp--,s=>E.get(s,action.id).x=(action.x+1)%9,s=>E.get(s,action.id).learned.push('test-card'),s=>E.get(s,action.id).exhausted.push('test-card'),s=>s.pieces.find(p=>p.side!==state.turn).hp--]){const changed=copy(next);alter(changed);assert.equal(C.formationRepeats(only,changed),independent(only,changed));assert.equal(C.formationRepeats(only,changed),0);}checks++;
 for(const phase of ['setup','duel','ended'])assert.equal(C.formationRepeats({...state,phase},next),0);assert.equal(C.formationRepeats(state,{...next,phase:'ended'}),0);assert.equal(C.formationRepeats(state,{...next,turn:state.turn}),0);checks++;
 const restored=replay(fixture.commands);if(!rotated){set(restored);const after=box.previewBoardAction(action);assert.equal(C.formationRepeats(restored,after),fixture.ownVisits);const refreshed=copy(box.boardAdvice(action));set(state);assert.deepEqual(refreshed,copy(box.boardAdvice(action)));checks++;}
}
console.log(JSON.stringify({checks,legalHistoryFixtures:fixtures.length,redBlackRotation:true,previewAndHint:true,wholePositionWarningPreserved:true,terminalPrecedence:true,inputUnchanged:true,noHiddenChoiceRead:true}));
