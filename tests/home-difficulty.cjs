const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const scenarioOptions=[...html.match(/<select id="scenario"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,options:[]});return nodes.get(id);};node('scenario').options=scenarioOptions;
const box=vm.createContext({nodes,node,document:{title:'',querySelector:()=>node('subtitle')},paintSaveStatus:()=>{}});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const start=scripts[2].indexOf('  function renderHome(){'),end=scripts[2].indexOf('\n  function ',start+3);assert(start>=0&&end>start);
vm.runInContext("const E=Yiwu;let s=null,lesson=null,opponent='computer',difficulty='practice';const $=id=>node(id);"+scripts[2].slice(start,end),box);
const run=code=>vm.runInContext(code,box),render=(mode='quick',opponent='computer',difficulty='practice')=>{node('scenario').value=mode;node('opponent').value=opponent;node('difficulty').value=difficulty;run('renderHome()');return node('mode-description').textContent;};
let checks=0;function test(name,fn){fn();checks++;console.log('通过：'+name);}
test('难度选择关联首页已有的即时说明',()=>{
  assert.match(html,/<select id="difficulty"[^>]*aria-describedby="mode-description"/);assert.match(html,/<p id="mode-description"[^>]*aria-live="polite"/);
});
test('练习与标准切换说明且重复渲染不叠加文字',()=>{
  for(const mode of ['quick','full'])for(const difficulty of ['practice','standard']){
    const text=render(mode,'computer',difficulty);assert(text.includes(difficulty==='practice'?'练习电脑出招更随机':'标准电脑会比较武斗收益与将帅风险'));assert(text.includes('生命、伤害不随难度改变'));assert(text.includes(mode==='quick'?'各 8 子、6 点培养':'各 16 子、12 点培养'));run('renderHome()');assert.equal(node('mode-description').textContent,text);assert(!node('difficulty').disabled);
  }
});
test('同机双人明确难度不生效，返回电脑后恢复所选难度',()=>{
  const text=render('quick','local','standard');assert(text.includes('同机双人由双方自行出招，电脑难度不生效'));assert(!text.includes('标准电脑会比较'));assert(node('difficulty').disabled);assert(render('quick','computer','standard').includes('标准电脑会比较'));assert(!node('difficulty').disabled);
});
test('教学说明固定示范，三种残局仍按所选电脑难度说明',()=>{
  assert(render('tutorial','local','standard').includes('教学使用固定示范招式，电脑难度不生效'));assert.equal(node('opponent').value,'computer');assert(node('opponent').disabled&&node('difficulty').disabled);
  for(const mode of ['challenge-support','challenge-relay','challenge-tempo'])for(const difficulty of ['practice','standard']){
    const text=render(mode,'local',difficulty);assert(text.includes('预置残局，培养点与阵容不对等'));assert(text.includes(difficulty==='practice'?'练习电脑出招更随机':'标准电脑会比较'));assert(node('opponent').disabled);assert(!node('difficulty').disabled);
  }
});
test('首页修改下一局设置保留当前对局与继续本局的原难度',()=>{
  run("s=E.create('quick');E.auto(s,'red',true);E.auto(s,'black',true);E.start(s);opponent='computer';difficulty='practice';");
  const before=run('JSON.stringify(s)');render('full','local','standard');assert.equal(run('JSON.stringify(s)'),before);assert.equal(run('difficulty'),'practice');assert.equal(run('opponent'),'computer');assert(node('resume-info').textContent.includes('练习电脑'));assert.equal(node('load').textContent,'开始新局');assert(!node('resume-wrap').hidden);
});
console.log(JSON.stringify({checks,gameStateUnchanged:true,existingDescriptionRegionReused:true}));
