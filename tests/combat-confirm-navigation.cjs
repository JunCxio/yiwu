const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),options=[...html.match(/<select id="scenario"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
function page(opponent='computer'){
  const nodes=new Map(),saved=storage(),session=storage(),timers=new Map(),navigation=[];let draws=0,timerId=0,ui;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},value:id==='opponent'?opponent:id==='difficulty'?'standard':'quick',options,innerHTML:'',textContent:'',children:[],handlers:{},open:false,addEventListener(type,fn){this.handlers[type]=fn;},contains(){return false;},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},focus(){document.activeElement=this;}});return nodes.get(id);};
  const document={getElementById:node,querySelector:node,activeElement:null,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const context=vm.createContext({document,localStorage:saved,sessionStorage:session,navigator:{locks:{request(name,fn){fn();return Promise.resolve();}}},scrollTo(){},requestAnimationFrame:fn=>fn(),setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  scripts.slice(0,2).forEach(code=>vm.runInContext(code,context));context.YiwuComputer.combat=()=>{draws++;return 'guard';};
  const startup="  showScreen('home');\n})();";assert(scripts[2].includes(startup));vm.runInContext(scripts[2].replace(startup,"globalThis.ui={init,beginFight,renderFight,get state(){return s;},get fight(){return fightUI;},get lesson(){return lesson;}};\n"+startup),context);ui=context.ui;
  const target={dataset:{fight:'commit'},closest(selector){assert.equal(selector,'.fight-footer');return this;},scrollIntoView(value){navigation.push(['scroll',value.block]);},focus(value){navigation.push(['focus',value.preventScroll]);document.activeElement=this;}};
  node('fight-content').querySelector=selector=>selector.includes('[data-fight="commit"]')&&ui.fight?.pending?target:null;
  const click=dataset=>node('fight-content').handlers.click({target:{closest:()=>({dataset,disabled:false})}}),snapshot=()=>JSON.stringify({state:ui.state,fight:ui.fight,saved:saved.getItem('yiwu.autosave'),pending:session.getItem('yiwu.autosave.pending'),markup:node('fight-content').innerHTML,draws,timers:timers.size});
  return {node,ui,E:context.Yiwu,navigation,target,snapshot,draws:()=>draws,active:()=>document.activeElement,pick:choice=>click({choice}),action:fight=>click({fight}),begin(){ui.beginFight(context.Yiwu.get(ui.state,'hero'),context.Yiwu.get(ui.state,'target'));}};
}
let passed=0;const failures=[];function test(name,fn){try{fn();passed++;console.log('通过：'+name);}catch(e){failures.push({name,message:e.message});console.error('失败：'+name+'：'+e.message);}}
test('仅普通选招后的推演提供前往确认，连续导航不改变棋局、存档和锁定招式',()=>{
  const p=page();p.ui.init('tactics');p.begin();assert(!p.node('fight-content').innerHTML.includes('data-fight="confirm-area"'));const empty=p.snapshot();p.action('confirm-area');assert.equal(p.snapshot(),empty);assert.deepEqual(p.navigation,[]);
  p.pick('pawn_grit');assert(p.node('fight-content').innerHTML.includes('data-fight="confirm-area">前往确认'));const before=p.snapshot();for(let i=0;i<16;i++)p.action('confirm-area');assert.equal(p.snapshot(),before);assert.equal(p.active(),p.target);assert.deepEqual(p.navigation,Array.from({length:16},()=>[['scroll','end'],['focus',true]]).flat());
});
test('导航不读取电脑暗招、不重抽决定，只有明确锁定才结算一次',()=>{
  const p=page();p.ui.init('tactics');p.begin();p.pick('strike');const before=p.snapshot(),locked=p.ui.fight.computerChoice;let reads=0;Object.defineProperty(p.ui.fight,'computerChoice',{configurable:true,enumerable:true,get(){reads++;throw Error('导航读取暗招');}});p.action('confirm-area');Object.defineProperty(p.ui.fight,'computerChoice',{configurable:true,enumerable:true,writable:true,value:locked});assert.equal(reads,0);assert.equal(p.snapshot(),before);
  const expected=JSON.parse(JSON.stringify(p.ui.state));p.E.resolve(expected,'strike',locked);p.action('commit');assert.equal(JSON.stringify(p.ui.state),JSON.stringify(expected));assert.equal(p.ui.fight.step,'result');assert(!p.node('fight-content').innerHTML.includes('data-fight="confirm-area"'));const ended=p.snapshot();p.action('confirm-area');assert.equal(p.snapshot(),ended);p.action('commit');assert.equal(p.snapshot(),ended);
});
test('同机双方各自导航，交接隐藏待选内容且不提前结算',()=>{
  const p=page('local');p.ui.init('tactics');p.begin();assert.equal(p.ui.fight.step,'handoffA');p.action('confirm-area');assert.deepEqual(p.navigation,[]);p.action('ready');p.pick('pawn_grit');const first=p.snapshot();p.action('confirm-area');assert.equal(p.snapshot(),first);p.action('commit');assert.equal(p.ui.fight.step,'handoffD');assert(!p.node('fight-content').innerHTML.includes('data-fight="confirm-area"'));const handoff=p.snapshot();p.action('confirm-area');assert.equal(p.snapshot(),handoff);p.action('ready');p.pick('cannon_pressure');assert(p.node('fight-content').innerHTML.includes('data-fight="confirm-area"'));const second=p.snapshot();p.action('confirm-area');assert.equal(p.snapshot(),second);p.action('commit');assert.equal(p.ui.fight.step,'result');assert.equal(p.ui.state.duel.history.length,1);
});
test('教学保留原指引，确认按钮不可用时导航不移动焦点',()=>{
  const p=page();p.ui.init('tutorial');p.begin();p.ui.fight.pending='pawn_grit';p.ui.renderFight();assert(!p.node('fight-content').innerHTML.includes('data-fight="confirm-area"'));
  const q=page();q.ui.init('tactics');q.begin();q.pick('guard');q.ui.fight.pending=null;const before=q.snapshot();q.action('confirm-area');assert.equal(q.snapshot(),before);assert.deepEqual(q.navigation,[]);
});
console.log(JSON.stringify({passed,failures}));assert.deepEqual(failures,[]);
