const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),options=[...html.match(/<select id="scenario"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
function page(opponent='computer',saved=storage()){
  const nodes=new Map(),session=storage(),timers=new Map();let draws=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},value:id==='opponent'?opponent:id==='difficulty'?'standard':'quick',options,innerHTML:'',textContent:'',children:[],handlers:{},open:false,addEventListener(type,fn){this.handlers[type]=fn;},contains(){return false;},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},focus(){document.activeElement=this;}});return nodes.get(id);};
  const document={getElementById:node,querySelector:node,activeElement:null,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const box=vm.createContext({document,localStorage:saved,sessionStorage:session,navigator:{locks:{request(name,fn){fn();return Promise.resolve();}}},scrollTo(){},requestAnimationFrame:fn=>fn(),setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  scripts.slice(0,2).forEach(code=>vm.runInContext(code,box));box.YiwuComputer.combat=()=>{draws++;return 'guard';};
  const startup="  showScreen('home');\n})();";assert(scripts[2].includes(startup));vm.runInContext(scripts[2].replace(startup,"globalThis.ui={init,beginFight,renderFight,get state(){return s;},get fight(){return fightUI;}};\n"+startup),box);
  const click=dataset=>node('fight-content').handlers.click({target:{closest:()=>({dataset,disabled:false})}}),ui=box.ui;
  return {saved,node,ui,E:box.Yiwu,draws:()=>draws,pick:choice=>click({choice}),action:fight=>click({fight}),begin(mode='tactics'){ui.init(mode);ui.beginFight(box.Yiwu.get(ui.state,'hero'),box.Yiwu.get(ui.state,'target'));},choices(){return [...node('fight-content').innerHTML.matchAll(/<button class="action[\s\S]*?<\/button>/g)].map(m=>({id:m[0].match(/data-choice="([^"]+)"/)[1],pressed:m[0].includes('aria-pressed="true"'),marked:m[0].includes('已选 · ')}));}};
}
function selected(p,id){const choices=p.choices();assert.deepEqual(choices.filter(c=>c.pressed).map(c=>c.id),id?[id]:[]);assert.deepEqual(choices.filter(c=>c.marked).map(c=>c.id),id?[id]:[]);}
let passed=0;function test(name,fn){fn();passed++;console.log('通过：'+name);}
test('基础与培养牌的文字标记和实际待选同步，换招不结算或重抽暗招',()=>{
  const p=page();p.begin();selected(p,null);const before=JSON.stringify(p.ui.state),draws=p.draws(),locked=p.ui.fight.computerChoice;
  for(const id of ['strike','guard','pawn_grit','strike','pawn_grit']){p.pick(id);assert.equal(p.ui.fight.pending,id);selected(p,id);assert.equal(JSON.stringify(p.ui.state),before);assert.equal(p.draws(),draws);assert.equal(p.ui.fight.computerChoice,locked);}
});
test('同机交接隐藏进攻方选择，守方标记独立且只有锁定才结算',()=>{
  const p=page('local');p.begin();assert.deepEqual(p.choices(),[]);p.action('ready');p.pick('pawn_grit');selected(p,'pawn_grit');const before=JSON.stringify(p.ui.state);p.action('commit');assert.equal(p.ui.fight.step,'handoffD');assert.deepEqual(p.choices(),[]);assert(!p.node('fight-content').innerHTML.includes('已选 · '));assert.equal(JSON.stringify(p.ui.state),before);
  p.action('ready');selected(p,null);p.pick('cannon_pressure');selected(p,'cannon_pressure');assert.equal(JSON.stringify(p.ui.state),before);p.action('commit');assert.equal(p.ui.fight.step,'result');assert.deepEqual(p.choices(),[]);assert.equal(p.ui.state.duel.history.length,1);p.action('next');p.action('ready');selected(p,null);
});
test('建议标记与推荐待选一致，教学只标记本课合法招式',()=>{
  const p=page();p.begin();p.action('hint');assert(p.ui.fight.pending);selected(p,p.ui.fight.pending);const q=page();q.begin('tutorial');q.action('hint');selected(q,q.ui.fight.pending);assert.equal(q.ui.fight.pending,'pawn_grit');const before=q.ui.fight.pending;q.pick('strike');assert.equal(q.ui.fight.pending,before);selected(q,before);
});
test('现有续局格式从真实待选重建标记，不改变命令与已锁定电脑招式',()=>{
  const p=page();p.begin();p.pick('pawn_grit');const saved=JSON.parse(p.saved.getItem('yiwu.autosave'));assert.equal(saved.ui.fight.pending,'pawn_grit');const q=page('computer',p.saved);q.node('resume').onclick();selected(q,'pawn_grit');const resumed=JSON.parse(q.saved.getItem('yiwu.autosave'));assert.deepEqual(resumed.commands,saved.commands);assert.equal(q.ui.fight.computerChoice,saved.ui.fight.computerChoice);assert.equal(q.draws(),0);
});
console.log(JSON.stringify({passed,selectionStateConsistent:true}));
