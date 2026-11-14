const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),fixture=require('./computer-king-choices-fixture.json');
const options=[...html.match(/<select id="scenario"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));
function storage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
function saved(locked){const result=storage();result.setItem('yiwu.autosave',JSON.stringify({version:1,commands:locked?fixture.commands:fixture.commands.slice(0,-1),ui:{opponent:'computer',difficulty:'practice',selected:null,preview:null,setupSide:'red',focusIndex:85,lesson:null,fight:locked?{step:'pickA',first:null,pending:null,computerChoice:locked}:null}}));return result;}
function page(local){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},value:id==='opponent'?'computer':id==='difficulty'?'practice':'quick',options,children:[],innerHTML:'',textContent:'',open:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},contains(){return false;},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},focus(){document.activeElement=this;}});return nodes.get(id);};
  const document={getElementById:node,querySelector:node,activeElement:null,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const box=vm.createContext({document,localStorage:local,sessionStorage:storage(),navigator:{locks:{request(name,fn){fn();return Promise.resolve();}}},scrollTo(){},requestAnimationFrame:fn=>fn(),setTimeout(){return 1;},clearTimeout(){}});
  scripts.slice(0,2).forEach(script=>vm.runInContext(script,box));let calls=0;const combat=box.YiwuComputer.combat;box.YiwuComputer.combat=(state,side,rng,difficulty)=>{calls++;return combat(state,side,()=>.999999,difficulty);};
  const startup="  showScreen('home');\n})();";assert(scripts[2].includes(startup));vm.runInContext(scripts[2].replace(startup,"globalThis.ui={get state(){return s;},get fight(){return fightUI;}};\n"+startup),box);
  return {node,ui:box.ui,E:box.Yiwu,calls:()=>calls,cell(x,y){node('grid').handlers.click({target:{closest:()=>({dataset:{x,y}})}});},action(action){document.handlers.click({target:{closest:selector=>selector==='[data-action]'?{dataset:{action}}:null}});},click(dataset){node('fight-content').handlers.click({target:{closest:()=>({dataset,disabled:false})}});}};
}
let passed=0;function test(name,run){run();passed++;console.log('通过：'+name);}
test('新开战将帅先过滤本轮败局，暗招隐藏，提示和刷新不重抽',()=>{
  const local=saved(),p=page(local);p.node('resume').onclick();p.cell(3,9);p.cell(3,1);p.action('attack');
  assert.equal(p.ui.fight.computerChoice,'break');assert.equal(p.calls(),1);const before=JSON.stringify(p.ui.state);p.click({fight:'hint'});assert.equal(JSON.stringify(p.ui.state),before);assert.equal(p.calls(),1);
  assert(!p.node('fight-content').innerHTML.includes('本轮选择「破势」'));p.click({choice:'strike'});p.click({fight:'commit'});assert.equal(p.ui.state.winner,'draw');assert(p.node('fight-content').innerHTML.includes('有安全应招时先避开本轮败局风险'));
  const q=page(local);q.node('resume').onclick();assert.equal(JSON.stringify(q.ui.state),JSON.stringify(p.ui.state));assert.equal(q.calls(),0);
});
test('旧续局危险蓄势和安全斩击均保留已锁定决定，说明不归因于新版策略',()=>{
  for(const choice of ['focus','strike']){
    const local=saved(choice),p=page(local);p.node('resume').onclick();assert.equal(p.ui.fight.computerChoice,choice);assert.equal(p.calls(),0);assert(!p.node('fight-content').innerHTML.includes('本轮沿用续局中已锁定的招式'));
    p.click({choice:'strike'});p.click({fight:'commit'});const text=p.node('fight-content').innerHTML;assert(text.includes('本轮沿用续局中已锁定的招式，刷新不重新选招。'));assert(text.includes('本轮选择「'+p.E.BASE[choice].name+'」'));assert(!text.includes('有安全应招时先避开'));assert.equal(p.calls(),0);assert.equal(p.ui.state.winner,choice==='focus'?'red':'draw');
    const state=JSON.stringify(p.ui.state),commands=JSON.stringify(JSON.parse(local.getItem('yiwu.autosave')).commands),q=page(local);q.node('resume').onclick();assert.equal(JSON.stringify(q.ui.state),state);assert.equal(JSON.stringify(JSON.parse(local.getItem('yiwu.autosave')).commands),commands);assert.equal(q.calls(),0);assert(q.node('fight-content').innerHTML.includes('本轮沿用续局中已锁定的招式，刷新不重新选招。'));
  }
});
console.log('练习将帅选招与续局：'+passed+' / '+passed+' 组通过。');
