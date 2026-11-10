const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const names=['moveIcon','damageBreakdownHTML','actualSuppression','revealCard','combatVerdict','combatHistoryHTML'];
const helpers=names.flatMap(name=>scripts[2].match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))||[]);
const escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,esc='+escape+';let fightUI;'+helpers.join('\n'),box);
const E=box.Yiwu,C=box.YiwuComputer,copy=s=>JSON.parse(JSON.stringify(s));let groups=0,settlements=0;
function test(name,run){run();groups++;console.log('通过：'+name);}
function show(a,d,ctx,r){
  box.ui={a,d,ctx};box.result=r;
  const before=JSON.stringify(box.ui),resultBefore=JSON.stringify(r);
  const result=vm.runInContext('fightUI=ui;({a:revealCard(ui.a,true,result),d:revealCard(ui.d,false,result),history:combatHistoryHTML(true)})',box);
  assert.equal(JSON.stringify(box.ui),before);assert.equal(JSON.stringify(r),resultBefore);return result;
}
function settle(s,aId,dId){
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),ctx=s.duel,r=E.resolve(s,aId,dId);settlements++;
  return {s,a,d,ctx,r,html:show(a,d,ctx,r)};
}
function legal(rounds){
  const s=E.create('tactics');E.move(s,'hero',4,4);let result;
  for(const [a,d] of rounds)result=settle(s,a,d);
  return result;
}
function lines(result,isA){
  const side=(isA?result.a:result.d).side,round=result.r.round;
  const reveal=result.html[isA?'a':'d'].match(/<div class="force-change">([^<]*)<\/div>/)[1];
  const history=result.html.history.match(new RegExp('aria-label="第 '+round+' 轮'+E.SIDE[side]+'记录">[\\s\\S]*?<small>([^<]*)<\\/small>'))[1];
  return {reveal,history};
}
function reported(result,isA,expected){
  const {reveal,history}=lines(result,isA);
  const count=text=>Number(text.match(/被削势 (\d+)/)?.[1]||0);
  assert.equal(count(reveal),expected,'揭示卡应报告实际削势量：'+reveal);
  assert.equal(count(history),expected,'交锋记录应报告实际削势量：'+history);
}

test('完整合法兵炮交战：气势已释放时不重复记为被削势',()=>{
  const result=legal([['focus','focus'],['break','cannon_pressure']]);
  assert.equal(result.r.forceBeforeA,1);assert.equal(result.r.spentA,1);assert.equal(result.r.suppressedA,2);
  assert.equal(result.r.forceAfterA,0);assert.equal(result.r.finished,false);reported(result,true,0);
  assert(lines(result,true).reveal.includes('释放 1 点；气势 1/2 变为 0/2'));
  assert(lines(result,true).history.includes('气势 1/2 → 0/2 · 释放 1'));
  assert(E.get(result.s,'target').exhausted.includes('cannon_pressure'));
  assert.deepEqual(show(result.a,result.d,result.ctx,result.r),result.html,'重复查看不能改变显示或结算');
});
test('完整合法兵炮交战：本轮获得的气势也可被削，削势量受可用量限制',()=>{
  const one=legal([['focus','cannon_pressure']]);
  assert.equal(one.r.forceBeforeA,0);assert.equal(one.r.gainA,1);assert.equal(one.r.forceAfterA,0);reported(one,true,1);
  const two=legal([['focus','focus'],['focus','cannon_pressure']]);
  assert.equal(two.r.forceBeforeA,1);assert.equal(two.r.gainA,1);assert.equal(two.r.forceAfterA,0);reported(two,true,2);
});
test('六轮结束保留轮内记录，揭示卡另显示离场归零',()=>{
  const rounds=Array.from({length:5},()=>['guard','guard']);
  const result=legal([...rounds,['focus','focus']]);
  assert.equal(result.r.finished,true);assert.equal(result.ctx.forceA,0);assert.equal(result.r.forceAfterA,1);
  reported(result,true,0);reported(result,false,0);
  assert(lines(result,true).reveal.includes('气势 0/2 变为 0/2（离场归零）'));
  assert(lines(result,true).history.includes('气势 0/2 → 1/2'));
});
test('红黑进守、七类棋子、满气势、培养收益、阵亡和第六轮的实际报告对照',()=>{
  for(const suppressor of ['cannon_pressure','rook_lock'])for(const kind of Object.keys(E.NAMES.red))
    for(const suppressorAttacks of [false,true])for(const mirrored of [false,true])
      for(const forceA of [0,1,2])for(const forceD of [0,1,2])for(const round of [1,6])
        for(const hp of [[18,18],[1,18],[18,1],[1,1]]){
          const s=E.create('tactics'),a=E.get(s,'hero'),d=E.get(s,'target');
          const sup=suppressorAttacks?a:d,other=suppressorAttacks?d:a;
          sup.kind=E.CARDS[suppressor].kind;sup.learned=[suppressor];sup.exhausted=[];
          other.kind=kind;const cards=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind);
          other.learned=[cards[0],cards[2]];other.exhausted=[];a.hp=hp[0];d.hp=hp[1];
          if(mirrored)for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
          s.phase='duel';s.turn=a.side;s.duel=E.context(s,a,d);Object.assign(s.duel,{forceA,forceD,round});
          for(const choice of C.choices(s,other,s.duel)){
            const aId=suppressorAttacks?suppressor:choice,dId=suppressorAttacks?choice:suppressor;
            const fallback=E.CARDS[suppressor].type,raw=E.roundDamage(s.duel,aId,dId);
            const neutral=E.roundDamage(s.duel,suppressorAttacks?fallback:choice,suppressorAttacks?choice:fallback);
            assert.equal(raw.toA,neutral.toA);assert.equal(raw.toD,neutral.toD);
            const expected=suppressorAttacks?neutral.forceAfterD-raw.forceAfterD:neutral.forceAfterA-raw.forceAfterA;
            const result=settle(copy(s),aId,dId);reported(result,!suppressorAttacks,expected);reported(result,suppressorAttacks,0);
          }
        }
});
console.log(JSON.stringify({groups,actualSettlements:settlements,renderInputsUnchanged:true}));
