const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);
const helpers=['supportText','forceHTML'].map(name=>scripts[2].match(new RegExp('^  function '+name+'[^\\n]+','m'))[0]);
helpers.push(scripts[2].match(/  function fightersHTML\([\s\S]*?\n  \}/)[0]);
vm.runInContext('const E=Yiwu;let s,fightUI,opponent="computer";'+helpers.join('\n'),box);
const E=box.Yiwu;let checks=0,renders=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function battle(mirror=false){
  const state=E.create('tactics');E.move(state,'hero',4,4);
  const a=E.get(state,state.duel.a),d=E.get(state,state.duel.d);
  if(mirror){
    for(const p of state.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    state.turn=a.side;state.duel=E.context(state,a,d);
  }
  return {state,a,d,ctx:state.duel};
}
function show(b,step='result',result){
  const ui={a:b.a,d:b.d,ctx:b.ctx,step};
  for(const name of ['first','computerChoice'])Object.defineProperty(ui,name,{get(){throw new Error('不得读取暗招：'+name);}});
  Object.defineProperty(ui,'result',{get(){assert.equal(step,'result','未揭示时不得读取结算');return result;}});
  const before=JSON.stringify(b),resultBefore=JSON.stringify(result);
  box.state=b.state;box.ui=ui;
  const rendered=vm.runInContext('s=state;fightUI=ui;fightersHTML()',box);renders++;
  assert.equal(JSON.stringify(b),before);assert.equal(JSON.stringify(result),resultBefore);
  return rendered;
}
function verify(b,r){
  const rendered=show(b,'result',r);
  assert(rendered.indexOf('duel-fighter red')<rendered.indexOf('duel-fighter black'),'红黑位置固定');
  for(const p of [b.a,b.d]){
    const isA=p===b.a,before=isA?r.hpBeforeA:r.hpBeforeD,after=isA?r.hpA:r.hpD,loss=before-after;
    const section=rendered.match(new RegExp('<section class="duel-fighter '+p.side+'[\\s\\S]*?<\\/section>'))[0];
    assert(section.includes('role="progressbar"'));
    assert(section.includes('aria-label="'+E.label(p)+'生命"'));
    assert(section.includes('aria-valuemin="0" aria-valuemax="18" aria-valuenow="'+after+'"'));
    assert(section.includes('aria-valuetext="'+after+' / 18，本轮'+(loss?'实际失血 '+loss+' 点':'无伤')+'"'));
    assert(section.includes(loss?' · 失血 '+loss:' · 无伤'));
    assert(section.includes('<i style="width:'+after/18*100+'%"'));
    assert.equal(section.includes('class="duel-health-loss"'),loss>0);
    if(loss)assert(section.includes('left:'+after/18*100+'%;width:'+loss/18*100+'%'));
    assert.equal(after,p.hp);assert(after+loss<=18);
  }
  return rendered;
}
test('红黑进守的实际失血与剩余生命分开显示，重复查看不改变结算',()=>{
  for(const mirror of [false,true]){
    const b=battle(mirror),r=E.resolve(b.state,'strike','focus');
    const once=verify(b,r);assert.equal(verify(b,r),once);
    assert(r.hpBeforeD>r.hpD);assert.equal(r.hpBeforeA,r.hpA);
  }
});
test('双方无伤时不绘制失血段，也不沿用上一轮的失血',()=>{
  const b=battle();verify(b,E.resolve(b.state,'strike','focus'));
  const r=E.resolve(b.state,'guard','guard');assert(r.round===2&&!r.finished);
  verify(b,r);
});
test('伤害超过剩余生命时只显示实际扣血，双方阵亡分别显示',()=>{
  for(const mirror of [false,true])for(const reply of ['focus','strike']){
    const b=battle(mirror);let r;
    const replies=reply==='focus'?['focus','focus','strike','focus']:Array(6).fill('strike');
    for(const choice of replies){r=E.resolve(b.state,'strike',choice);verify(b,r);}
    assert.equal(r.hpD,0);assert(r.toD>r.hpBeforeD,'覆盖过量伤害');
    if(reply==='strike')assert.equal(r.hpA,0,'覆盖同归于尽');
  }
});
test('第六轮离场后仍显示本轮实际失血',()=>{
  const b=battle();for(let i=0;i<5;i++)E.resolve(b.state,'guard','guard');
  const r=E.resolve(b.state,'strike','focus');assert(r.finished&&r.round===6);verify(b,r);
});
test('交接、选招、撤回时不读取暗招或结算，不残留失血提示',()=>{
  const b=battle();E.resolve(b.state,'strike','focus');
  for(const step of ['handoffA','pickA','handoffD','pickD','retreated']){
    const rendered=show(b,step);
    assert(!rendered.includes('duel-health-loss'));assert(!rendered.includes(' · 失血 '));assert(!rendered.includes(' · 无伤'));
    assert.equal((rendered.match(/role="progressbar"/g)||[]).length,2);
  }
});
console.log(JSON.stringify({checks,renders,inputUnchanged:true,hiddenChoicesUnread:true}));
