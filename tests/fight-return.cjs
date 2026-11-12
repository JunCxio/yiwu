const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
const helper=scripts[2].match(/  function returnFromFight\(\)\{[\s\S]*?\n  \}/)?.[0];assert(helper);
const focus=scripts[2].match(/  function focusGame\(\)\{[\s\S]*?\n  \}/)?.[0];assert(focus);
const start=scripts[2].indexOf("  $('fight-content').addEventListener('click',e=>{");
const end=scripts[2].indexOf("  fight.addEventListener('cancel'",start);assert(start>=0&&end>start);
function page(disabled=false){
  const nodes=new Map();let active=null,handler,closes=0,renders=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{children:[],addEventListener(type,fn){assert.equal(type,'click');handler=fn;},focus(){assert(!this.disabled,'不能聚焦禁用的棋盘格');active=this;}});return nodes.get(id);};
  const box=vm.createContext({screen:'game',lesson:null,selected:null,preview:null,focusIndex:40,notice:'',$:node,
    fight:{close(){closes++;}},render(){assert.equal(box.fightUI,null);renders++;node('grid').children=Array.from({length:90},()=>({disabled,focus:node('cell').focus}));}});
  vm.runInContext(scripts[0],box);box.E=box.Yiwu;
  vm.runInContext(focus+'\n'+helper+'\n'+scripts[2].slice(start,end),box);
  return {box,node,get active(){return active;},get closes(){return closes;},get renders(){return renders;},next(){handler({target:{closest:()=>({dataset:{fight:'next'},disabled:false})}});}};
}
function retreat(p,mode='tactics'){
  const {box}=p,E=box.E;box.s=E.create(mode);E.move(box.s,'hero',4,4);
  E.resolve(box.s,'strike','strike');
  box.fightUI={result:E.retreat(box.s),step:'retreated'};
}
let passed=0;function test(name,fn){fn();passed++;console.log('通过：'+name);}
test('撤回返回新渲染棋盘的原位置，不重复结算或改变伤势',()=>{
  const p=page();retreat(p);const before=JSON.stringify(p.box.s);p.next();
  assert.equal(p.closes,1);assert.equal(p.renders,1);assert.equal(p.box.fightUI,null);
  assert.equal(p.active,p.node('grid').children[40]);assert.equal(JSON.stringify(p.box.s),before);
  p.next();assert.equal(p.closes,1);assert.equal(p.renders,1);
});
test('自然结束武斗后同样返回棋盘，不重复扣血',()=>{
  const p=page(),E=p.box.E;p.box.s=E.create('tactics');E.move(p.box.s,'hero',4,4);
  let result;while(p.box.s.phase==='duel')result=E.resolve(p.box.s,'strike','strike');
  assert(result.finished);assert.equal(p.box.s.phase,'board');p.box.fightUI={result,step:'result'};
  const before=JSON.stringify(p.box.s);p.next();assert.equal(p.active,p.node('grid').children[40]);assert.equal(JSON.stringify(p.box.s),before);
});
test('电脑行动期间棋盘不可用，焦点落到可用的返回首页按钮',()=>{
  const p=page(true);retreat(p);p.box.opponent='computer';assert.equal(p.box.s.turn,'black');p.next();
  assert.equal(p.active,p.node('back-home'));assert.equal(p.closes,1);assert.equal(p.renders,1);
});
test('整局结束始终聚焦终局标题，棋盘可用与否均不影响',()=>{
  for(const disabled of [false,true]){
    const p=page(disabled);retreat(p);p.box.s.phase='ended';p.box.s.winner='draw';p.next();
    assert.equal(p.active,p.node('endgame-title'));assert.equal(p.closes,1);
  }
});
test('教学撤回转入支援课，选中并聚焦本课红车，不沿用旧棋盘位置',()=>{
  const p=page();retreat(p,'tutorial');p.box.lesson={stage:'withdrawn'};p.box.focusIndex=40;p.next();
  assert.equal(p.box.lesson.stage,'support-move');assert.equal(p.box.selected,'helper');assert.equal(p.box.preview,null);
  assert.equal(JSON.stringify(p.box.s),JSON.stringify(p.box.E.create('tutorial-support')));
  assert.equal(p.active,p.node('grid').children[46]);assert.equal(p.box.focusIndex,46);assert.equal(p.closes,1);
});
test('首页上的过期武斗点击不关闭弹窗或修改棋局',()=>{
  const p=page();retreat(p);p.box.screen='home';const before=JSON.stringify(p.box.s);p.next();
  assert.equal(p.closes,0);assert.equal(p.renders,0);assert.equal(p.active,null);assert.equal(JSON.stringify(p.box.s),before);
});
console.log('武斗返回焦点：'+passed+' / '+passed+' 组通过。');
