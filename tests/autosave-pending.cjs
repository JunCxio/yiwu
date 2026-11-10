const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const options=[...html.match(/<select id="scenario"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));
const KEY='yiwu.autosave',PENDING=KEY+'.pending';
function storage(){
  const data=new Map();return {failRead:false,failWrite:false,getItem(key){if(this.failRead)throw Error('读取不可用');return data.get(key)??null;},setItem(key,value){if(this.failWrite)throw Error('写入不可用');data.set(key,String(value));},removeItem(key){if(this.failWrite)throw Error('写入不可用');data.delete(key);}};
}
function locks(){
  const queue=[];return {queue,async flush(index=0){const task=queue.splice(index,1)[0];assert(task);try{task.resolve(task.fn());}catch(error){task.reject(error);}await Promise.resolve();},async drain(){while(queue.length)await this.flush();}};
}
function page(saved=storage(),session=storage(),manager=locks()){
  const nodes=new Map(),owner={},node=id=>{
    if(!nodes.has(id))nodes.set(id,{dataset:{},value:id==='opponent'?'local':id==='difficulty'?'standard':'quick',options,innerHTML:'',textContent:'',children:[],handlers:{},open:false,
      addEventListener(type,fn){this.handlers[type]=fn;},contains(){return false;},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},focus(){document.activeElement=this;}});
    return nodes.get(id);
  };
  const document={getElementById:node,querySelector:node,activeElement:null,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const context=vm.createContext({document,localStorage:saved,sessionStorage:session,navigator:{locks:{request(name,fn){assert.equal(name,KEY);return new Promise((resolve,reject)=>manager.queue.push({owner,fn,resolve,reject}));}}},scrollTo(){},requestAnimationFrame:fn=>fn(),setTimeout(){return 1;},clearTimeout(){}});
  scripts.slice(0,2).forEach(script=>vm.runInContext(script,context));
  const startup="  showScreen('home');\n})();";assert(scripts[2].includes(startup));
  vm.runInContext(scripts[2].replace(startup,"globalThis.ui={init,beginFight,get state(){return s;},get fight(){return fightUI;}};\n"+startup),context);
  const click=dataset=>node('fight-content').handlers.click({target:{closest:()=>({dataset,disabled:false})}});
  return {saved,session,manager,node,ui:context.ui,pick(choice){assert(['pickA','pickD'].includes(context.ui.fight.step));click({choice});assert.equal(context.ui.fight.pending,choice);},fight:fight=>click({fight}),begin(){context.ui.beginFight(context.Yiwu.get(context.ui.state,'hero'),context.Yiwu.get(context.ui.state,'target'));if(context.ui.fight.step==='handoffA')click({fight:'ready'});},close(){for(let i=manager.queue.length-1;i>=0;i--)if(manager.queue[i].owner===owner)manager.queue.splice(i,1);}};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('通过：'+name);}
(async()=>{
  await test('换招后尚未获得写锁就刷新，按本页待保存记录恢复最新选牌',async()=>{
    const p=page();p.ui.init('tactics');p.begin();await p.manager.drain();const before=p.saved.getItem(KEY);
    p.pick('guard');assert.equal(p.saved.getItem(KEY),before);p.close();
    const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.fight.pending,'guard');assert.equal(q.ui.state.phase,'duel');
    await q.manager.drain();assert.equal(JSON.parse(q.saved.getItem(KEY)).ui.fight.pending,'guard');assert.equal(q.session.getItem(PENDING),null);
  });
  await test('新局尚未首次写入也可刷新恢复，查看和续局不新增操作',async()=>{
    const p=page();p.ui.init('quick');assert.equal(p.saved.getItem(KEY),null);const state=JSON.stringify(p.ui.state);p.close();
    const q=page(p.saved,p.session,p.manager);assert.equal(JSON.stringify(q.ui.state),state);await q.manager.drain();
    const commands=JSON.stringify(JSON.parse(q.saved.getItem(KEY)).commands);q.node('resume').onclick();await q.manager.drain();assert.equal(JSON.stringify(JSON.parse(q.saved.getItem(KEY)).commands),commands);
  });
  await test('多次换招排队时，较早提交更新待保存记录的基准，不丢失最新选牌',async()=>{
    const p=page();p.ui.init('tactics');p.begin();await p.manager.drain();p.pick('strike');p.pick('guard');
    await p.manager.flush();assert.equal(JSON.parse(p.saved.getItem(KEY)).ui.fight.pending,'strike');
    assert.equal(JSON.parse(p.session.getItem(PENDING)).previous,p.saved.getItem(KEY));p.close();
    const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.fight.pending,'guard');await q.manager.drain();assert.equal(q.session.getItem(PENDING),null);
  });
  await test('另一页面已更新主存档时，刷新不会用本页缓存覆盖新进度',async()=>{
    const p=page();p.ui.init('tactics');p.begin();await p.manager.drain();const q=page(p.saved,storage(),p.manager);q.node('resume').onclick();await q.manager.drain();
    q.pick('guard');p.pick('strike');await q.manager.flush();const newer=q.saved.getItem(KEY);p.close();
    const r=page(p.saved,p.session,p.manager);assert.equal(r.ui.fight.pending,'guard');await r.manager.drain();assert.equal(r.saved.getItem(KEY),newer);assert.equal(r.session.getItem(PENDING),null);
  });
  await test('主存档写入失败仍保留本页待保存记录，恢复后可重试',async()=>{
    const p=page();p.ui.init('tactics');p.begin();await p.manager.drain();const old=p.saved.getItem(KEY);p.saved.failWrite=true;p.pick('guard');await p.manager.drain();
    assert.equal(p.saved.getItem(KEY),old);assert(p.session.getItem(PENDING));assert(p.node('save-status').textContent.includes('无法自动保存'));p.close();
    const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.fight.pending,'guard');q.saved.failWrite=false;await q.manager.drain();assert.equal(JSON.parse(q.saved.getItem(KEY)).ui.fight.pending,'guard');assert.equal(q.session.getItem(PENDING),null);
    q.node('resume').onclick();await q.manager.drain();q.saved.failWrite=true;q.pick('strike');await q.manager.drain();assert(q.node('save-status').textContent.includes('无法自动保存'));
    q.saved.failWrite=false;q.pick('guard');await q.manager.drain();assert(!q.node('save-status').textContent.includes('无法自动保存'),'核对主记录已是最新后应清除旧写入错误');assert.equal(q.session.getItem(PENDING),null);
  });
  await test('标签页缓存不可用不阻断正常主存档，实际提交后再显示已保存',async()=>{
    const p=page();p.session.failWrite=true;p.ui.init('tactics');assert(p.node('save-status').textContent.includes('无法自动保存'));await p.manager.drain();
    assert(p.saved.getItem(KEY));assert(!p.node('save-status').textContent.includes('无法自动保存'));p.close();p.session.failRead=true;const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.state.scenario,'tactics');await q.manager.drain();
  });
  await test('损坏或不受支持的待保存记录不能绕过原续局校验',async()=>{
    for(const pending of ['{broken',JSON.stringify({previous:null,raw:JSON.stringify({version:9,commands:[]})}),JSON.stringify({previous:null,raw:'{}'})]){
      const session=storage();session.setItem(PENDING,pending);const p=page(storage(),session);assert.equal(p.ui.state,undefined);assert(p.node('save-status').textContent.includes('无法读取'));assert.equal(session.getItem(PENDING),pending);
    }
    const p=page();p.ui.init('tactics');await p.manager.drain();p.close();p.session.setItem(PENDING,'{broken');const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.state.scenario,'tactics');await q.manager.drain();assert.equal(q.session.getItem(PENDING),null);
    const unknown=JSON.stringify({version:9,commands:[]}),cached=JSON.stringify({previous:unknown,raw:q.saved.getItem(KEY)});q.saved.setItem(KEY,unknown);q.session.setItem(PENDING,cached);q.close();
    const r=page(q.saved,q.session,q.manager);assert.equal(r.ui.state,undefined);assert.equal(r.saved.getItem(KEY),unknown);assert.equal(r.session.getItem(PENDING),cached);assert.equal(r.manager.queue.length,0);
  });
  await test('同页重开使旧请求失效，旧请求拒绝不污染新局状态',async()=>{
    for(const reject of [false,true]){
      const p=page();p.ui.init('tactics');p.ui.init('full');
      if(reject){const first=p.manager.queue.shift();first.reject(Error('旧请求已取消'));await Promise.resolve();}else await p.manager.flush();
      assert(!p.node('save-status').textContent.includes('无法自动保存'));assert.equal(JSON.parse(JSON.parse(p.session.getItem(PENDING)).raw).commands[0][1],'full');
      p.close();const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.state.scenario,'full');await q.manager.drain();assert.equal(JSON.parse(q.saved.getItem(KEY)).commands[0][1],'full');
    }
  });
  await test('揭示后立即刷新恢复已结算结果，不重复扣血或追加结算',async()=>{
    const p=page();p.ui.init('tactics');p.begin();await p.manager.drain();p.pick('guard');p.fight('commit');p.fight('ready');p.pick('strike');p.fight('commit');
    assert.equal(p.ui.fight.step,'result');const state=JSON.stringify(p.ui.state);p.close();
    const q=page(p.saved,p.session,p.manager);assert.equal(q.ui.fight.step,'result');assert.equal(JSON.stringify(q.ui.state),state);await q.manager.drain();const commands=JSON.parse(q.saved.getItem(KEY)).commands;
    assert.equal(commands.filter(x=>x[0]==='resolve').length,1);q.node('resume').onclick();await q.manager.drain();assert.equal(JSON.stringify(JSON.parse(q.saved.getItem(KEY)).commands),JSON.stringify(commands));
  });
  console.log('待保存续局：'+passed+' / '+passed+' 组检查通过。');
})().catch(error=>{console.error(error);process.exitCode=1;});
