const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const helpers=['combatAdvice','reviewHTML','combatRepliesHTML','combatFollowUpRisk'].map(name=>scripts[2].match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))[0]),escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,C=YiwuComputer,esc='+escape+';let s,lesson=null,fightUI;'+helpers.join('\n'),box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));let checks=0,fixtures=0,settlements=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function show(s,who,id){
  const ui={a:E.get(s,s.duel.a),d:E.get(s,s.duel.d),ctx:s.duel,pending:id,hint:''};
  for(const key of ['first','computerChoice'])Object.defineProperty(ui,key,{get(){throw new Error('不得读取暗招：'+key);}});
  box.state=s;box.ui=ui;box.whoId=who.id;box.choice=id;
  return vm.runInContext('s=state;fightUI=ui;({advice:combatAdvice(E.get(s,whoId),choice),review:reviewHTML(E.get(s,whoId))})',box);
}
function verify(s,who,id){
  const before=JSON.stringify(s),enemy=E.get(s,who.id===s.duel.a?s.duel.d:s.duel.a),isA=who.id===s.duel.a,forces=[];
  for(const reply of C.choices(s,enemy,s.duel)){
    const next=copy(s);E.resolve(next,isA?id:reply,isA?reply:id);settlements++;
    forces.push((next.duel||next.lastCombat)[isA?'forceA':'forceD']);
  }
  const result=show(s,who,id),lo=Math.min(...forces),hi=Math.max(...forces),range=lo===hi?String(lo):lo+'–'+hi;
  assert(result.advice.reasons.some(text=>text.includes('本轮后气势为 '+range+'/2')),'气势预估必须和真实结算、离场后的数值一致');
  if(s.duel.round===6){assert.equal(range,'0');assert(result.review.includes('本轮后交战结束，双方气势归零'));}
  assert.equal(JSON.stringify(s),before);return result;
}
test('合法第六轮蓄势不能把离场前的气势显示成可留存气势',()=>{
  const s=E.create('tactics');E.move(s,'hero',4,4);for(let i=0;i<5;i++)E.resolve(s,'guard','guard');
  assert.equal(s.duel.round,6);assert.equal(E.get(s,'hero').hp,18);
  const result=verify(s,E.get(s,'hero'),'focus');assert(!result.review.includes('若存活，蓄势 +'));
});
test('七类棋子、培养、耗尽、削势、濒死和双方进守的气势范围逐项对应真实结果',()=>{
  const kinds=Object.keys(E.NAMES.red),pairs=[[0,1],[0,2],[1,2]];
  for(let i=0;i<kinds.length;i++)for(let loadout=0;loadout<3;loadout++)for(const round of [1,5,6])for(const hp of [[18,18],[1,18],[18,1],[1,1]])for(const mirrored of [false,true]){
    const s=E.create('tactics'),a=E.get(s,'hero'),d=E.get(s,'target');a.kind=kinds[i];d.kind=kinds[(i+1)%kinds.length];
    for(const p of [a,d]){const ids=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind);p.learned=pairs[loadout].map(index=>ids[index]);p.exhausted=loadout===2?p.learned.slice(0,1):[];}
    a.hp=hp[0];d.hp=hp[1];
    if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
    s.phase='duel';s.turn=a.side;s.duel=E.context(s,a,d);s.duel.round=round;s.duel.forceA=loadout;s.duel.forceD=2-loadout;
    for(const who of [a,d])for(const id of C.choices(s,who,s.duel))verify(s,who,id);
    fixtures++;
  }
});
test('本场继续时允许积累气势，提前击倒任一方时双方气势归零',()=>{
  const s=E.create('tactics');E.move(s,'hero',4,4);const a=E.get(s,'hero'),d=E.get(s,'target');
  const ongoing=verify(s,a,'pawn_grit');assert(ongoing.advice.reasons.some(text=>text.includes('本轮后气势为 1/2')));
  assert(ongoing.review.includes('本场继续时'));assert(ongoing.review.includes('本场结束时，双方气势归零'));
  d.hp=1;const mixed=verify(s,a,'pawn_grit');assert(mixed.advice.reasons.some(text=>text.includes('本轮后气势为 0–1/2')));
  a.kind='king';a.learned=['king_command'];s.pieces.push(E.piece('helper','red','rook',1,4));s.duel=E.context(s,a,d);s.duel.forceA=2;
  const ended=verify(s,a,'king_command');assert(ended.advice.reasons.some(text=>text.includes('本轮后气势为 0/2')));
  assert(ended.review.includes('消耗全部 2 点气势'));
});
console.log(JSON.stringify({checks,fixtures,actualSettlements:settlements,inputUnchanged:true,hiddenChoicesUnread:true}));
