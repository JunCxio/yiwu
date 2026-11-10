const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
const box=vm.createContext({});for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const helpers=['reviewHTML','combatRepliesHTML'].map(name=>{
  const source=scripts[2].match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'));assert(source);return source[0];
});
const escape=scripts[2].match(/,esc=([^\n]+);/);assert(escape);
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape[1]+';let s,lesson,fightUI;\n'+helpers.join('\n'),box);
const E=box.Yiwu;let checks=0;const test=(name,run)=>{run();checks++;console.log('通过：'+name);};
function render(s,ui,lesson,who){box.state=s;box.ui=ui;box.teaching=lesson;vm.runInContext('s=state;fightUI=ui;lesson=teaching',box);return box.reviewHTML(who);}
test('三段固定教学出招的预估与真实逐轮结算一致，查看不耗牌、不扣血',()=>{
  const s=E.create('tutorial');E.move(s,'hero',4,4);
  for(const [stage,id,reply,hpA,hpD]of [['counter','pawn_grit','cannon_pressure',17,12],['store','focus','guard',17,12],['release','strike','cannon_hold',12,11]]){
    const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),ui={a,d,ctx:s.duel,pending:id,computerChoice:reply,hint:''},before=JSON.stringify(s);
    const h=render(s,ui,{stage},a),rows=h.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    assert(h.includes('<th>对手固定出招</th>'));assert.equal((rows.match(/<tr>/g)||[]).length,1);
    assert(rows.includes((E.BASE[reply]||E.CARDS[reply]).name));
    assert(h.includes('红方生命 '+hpA+' · 黑方生命 '+hpD));
    assert(!h.includes('不能据此知道对手本轮已选哪招'));assert(!h.includes('范围包含对方所有可用招式'));
    assert(h.includes('正式对局仍按全部合法回应显示范围'));
    assert.equal(JSON.stringify(s),before);assert.equal(ui.computerChoice,reply);
    E.resolve(s,id,reply);assert.equal(a.hp,hpA);assert.equal(d.hp,hpD);
  }
});
test('教学尚未选牌时说明固定演示，避免提示选择其他被禁用的招式',()=>{
  const s=E.create('tutorial');E.move(s,'hero',4,4);const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);
  const h=render(s,{a,d,ctx:s.duel,pending:null,computerChoice:'cannon_pressure',hint:''},{stage:'counter'},a);
  assert(h.includes('本课高亮的招式'));assert(h.includes('对手固定出招'));assert(!h.includes('选错可以更换'));
  const retreat=render(s,{a,d,ctx:s.duel,pending:null,computerChoice:'guard',hint:''},{stage:'retreat'},a);
  assert(retreat.includes('先查看撤回后果'));assert(!retreat.includes('本课高亮的招式'));assert(!retreat.includes('先选招，再锁定'));
});
test('正式人机与同机双人继续展示所有合法回应，不读取任何已锁定暗招',()=>{
  const s=E.create('tutorial');E.move(s,'hero',4,4);
  for(const whoId of [s.duel.a,s.duel.d])for(const id of ['strike','guard','break','focus']){
    const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),who=E.get(s,whoId),ui={a,d,ctx:s.duel,pending:id,hint:''};
    for(const key of ['computerChoice','first'])Object.defineProperty(ui,key,{get(){throw new Error('不应读取已锁定暗招：'+key);}});
    const before=JSON.stringify(s),h=render(s,ui,null,who),rows=E.preview(s,who.side,id);
    assert(h.includes('<th>对手可能出招</th>'));assert(h.includes('范围包含对方所有可用招式'));
    assert(h.includes('不能据此知道对手本轮已选哪招'));assert(!h.includes('教学按公开'));
    for(const row of rows)for(const name of row.names)assert(h.includes(name));
    assert.equal(JSON.stringify(s),before);
  }
});
console.log('教学选招预估：'+checks+' 组通过。');
