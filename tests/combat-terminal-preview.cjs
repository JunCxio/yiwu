const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const forecast=scripts[2].match(/  function combatForecastHTML\([\s\S]*?\n  }/)[0];
const replies=scripts[2].match(/  function combatRepliesHTML\([\s\S]*?\n  }/)[0],escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null;'+forecast+'\n'+replies,box);
vm.runInContext('Object.defineProperty(globalThis,"fightUI",{get(){throw new Error("不得读取暗招");}});',box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));let checks=0,settlements=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function recordedRoyals(){
  const commands=[['create','tactics'],['move','red_king',4,9],['move','black_king',4,0],['move','hero',4,4],...Array.from({length:4},()=>['resolve','guard','strike']),['move','black_king',5,0],['move','hero',5,4],['move','black_king',4,0],['move','red_king',4,0],...Array.from({length:5},()=>['resolve','strike','strike'])];
  let s;for(const [name,...args]of commands)s=name==='create'?E.create(...args):(E[name](s,...args),s);
  assert.equal(s.phase,'duel');assert.equal(s.duel.round,6);assert.equal(E.get(s,s.duel.a).hp,3);assert.equal(E.get(s,s.duel.d).hp,2);return {s,commands};
}
function show(state,who,id){box.input=state;box.whoId=who.id;box.choice=id;return vm.runInContext('s=input;combatForecastHTML(E.get(s,whoId),choice)',box);}
function verify(state,who,id){
  const before=JSON.stringify(state),isA=who.id===state.duel.a,enemy=E.get(state,isA?state.duel.d:state.duel.a),expected=new Map(),winners=[];
  for(const reply of C.choices(state,enemy,state.duel)){
    const next=copy(state);E.resolve(next,isA?id:reply,isA?reply:id);settlements++;
    winners.push(next.phase==='ended'?next.winner:null);
    if(next.phase==='ended')expected.set((E.BASE[reply]||E.CARDS[reply]).name,{title:next.winner==='draw'?'本局判和':E.SIDE[next.winner]+'获胜',reason:next.reason});
  }
  const h=show(state,who,id);
  for(const [winner,label]of [[who.side,'获胜'],[E.OTHER[who.side],'判负'],['draw','判和']]){
    const count=winners.filter(value=>value===winner).length;
    assert.equal(h.includes('必定'+label),count===winners.length);assert.equal(h.includes('可能'+label),count>0&&count<winners.length);
  }
  assert.equal(h.includes('本轮整局：'),expected.size>0);
  const details=vm.runInContext('combatRepliesHTML(E.get(s,whoId),choice)',box),actual=new Map();
  for(const [,names,title,reason]of details.matchAll(/<p>对手用「([^」]+)」时，([^<]+)。<\/p><small>([^<]+)<\/small>/g))for(const name of names.split('、')){assert(!actual.has(name));actual.set(name,{title,reason});}
  assert.deepEqual(actual,expected);
  if(expected.size){assert(details.includes('本轮整局结果'));assert(details.includes('不预知暗招'));assert.equal(details.includes('未列出的回应本轮不会直接结束本局。'),winners.includes(null));assert.equal(details.includes('challenge-check risk'),winners.includes(E.OTHER[who.side]));}
  else assert.equal(details,'');
  assert.equal(JSON.stringify(state),before);return {h,details};
}
test('普通将帅交战在锁定前区分整局获胜、判负和同时阵亡判和',()=>{
  const {s}=recordedRoyals(),a=E.get(s,s.duel.a),before=JSON.stringify(s),h=show(s,a,'strike');
  assert(h.includes('本轮整局：可能获胜；可能判负；可能判和。'));
  for(const [reply,winner]of [['strike','draw'],['guard','black'],['break','red'],['focus','red']]){
    const next=copy(s);E.resolve(next,'strike',reply);assert.equal(next.winner,winner);settlements++;
  }
  assert.equal(JSON.stringify(s),before);
});
test('红黑进守双方与培养耗牌、气势的结果说明逐项对应真实结算',()=>{
  for(const mirrored of [false,true])for(const hp of [[3,2],[1,18],[18,1],[1,1],[18,18]])for(const loadout of [0,1,2])for(const round of [1,6]){
    const {s}=recordedRoyals();s.repetitions={};s.duel.round=round;
    E.get(s,s.duel.a).hp=hp[0];E.get(s,s.duel.d).hp=hp[1];s.duel.forceA=loadout;s.duel.forceD=2-loadout;
    if(loadout)for(const p of s.pieces.filter(p=>p.kind==='king')){p.learned=['king_calm','king_lead'];p.exhausted=loadout===2?['king_calm']:[];}
    if(mirrored){for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.turn=E.OTHER[s.turn];s.duel.origin={x:8-s.duel.origin.x,y:9-s.duel.origin.y};s.duel.target={x:8-s.duel.target.x,y:9-s.duel.target.y};}
    for(const who of [E.get(s,s.duel.a),E.get(s,s.duel.d)])for(const id of C.choices(s,who,s.duel))verify(s,who,id);
  }
});
test('普通武斗只有实际结束整局才显示结果，未列出回应不表示后续安全',()=>{
  const {s}=recordedRoyals(),a=E.get(s,s.duel.a),out=verify(s,a,'guard');
  assert(out.h.includes('本轮整局：可能获胜；可能判负。'));assert(out.details.includes('未列出的回应本轮不会直接结束本局。'));
  const ordinary=E.create('attrition');E.move(ordinary,'hero',4,4);ordinary.duel.round=6;
  for(const id of C.choices(ordinary,E.get(ordinary,'hero'),ordinary.duel))assert.equal(verify(ordinary,E.get(ordinary,'hero'),id).details,'');
});
test('第六轮的无伤或重复判和按真实终局原因说明，不提前结束交战',()=>{
  for(const cause of ['quiet','repetition']){
    const s=E.create('attrition');E.move(s,'hero',4,4);for(let i=0;i<5;i++)E.resolve(s,'guard','guard');
    if(cause==='quiet')s.quiet=E.DRAW.quiet-1;
    else{const next=copy(s);E.resolve(next,'guard','guard');s.repetitions[E.key(next)]=E.DRAW.repetitions-1;}
    const out=verify(s,E.get(s,'hero'),'guard');assert(out.h.includes('可能判和'));assert(out.details.includes(cause==='quiet'?'连续 80 次行动未造成伤害':'同一完整局面第三次出现'));
    s.duel.round=5;assert(!verify(s,E.get(s,'hero'),'guard').h.includes('本轮整局：'));
  }
});
test('固定教学与未选招不增加整局提示，查看不读取待选或锁定暗招',()=>{
  const {s}=recordedRoyals(),who=E.get(s,s.duel.a);assert.equal(show(s,who,null),'');assert.equal(vm.runInContext('combatRepliesHTML(E.get(s,whoId),null)',box),'');
  vm.runInContext('lesson={}',box);assert.equal(show(s,who,'strike'),'');assert.equal(vm.runInContext('combatRepliesHTML(E.get(s,whoId),choice)',box),'');vm.runInContext('lesson=null',box);
});
console.log(JSON.stringify({checks,actualSettlements:settlements}));
