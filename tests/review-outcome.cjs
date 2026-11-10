const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);vm.runInContext(scripts[1],box);vm.runInContext('const C=YiwuComputer;',box);
for(const name of ['reviewAlternative','analyzeMatch']){
  const start=scripts[2].indexOf('  function '+name+'('),end=scripts[2].indexOf('\n  function ',start+10);
  assert(start>=0&&end>start);vm.runInContext(scripts[2].slice(start,end),box);
}
const E=box.Yiwu,C=box.YiwuComputer,copy=x=>JSON.parse(JSON.stringify(x)),fixture=require('./review-outcome-fixture.json');
function replay(commands){let s;for(const [op,...args]of commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}return s;}
function result(s,isA,mine,enemy){const next=copy(s);E.resolve(next,isA?mine:enemy,isA?enemy:mine);return next;}
function reviewed(s,isA,mine,enemy){const before=JSON.stringify(s),tip=box.reviewAlternative(s,isA,mine,enemy);assert.equal(JSON.stringify(s),before);return tip;}
let checks=0,inputs=0;function test(name,run){run();checks++;console.log('通过：'+name);}

test('合法残局的复盘不把即时挑战失败列为改进选择',()=>{
  const s=replay(fixture.commands.slice(0,5)),actual=result(s,true,'strike','guard'),alternative=result(s,true,'break','guard');
  assert.equal(s.duel.round,fixture.unsafeRound);assert.notEqual(actual.phase,'ended');
  assert.equal(alternative.winner,'black');assert(alternative.reason.includes('支援条件'));
  assert.equal(reviewed(s,true,'strike','guard'),null);
});

test('完整合法记录复盘保留真实统计，并选择不立即失败的轮次',()=>{
  const input=JSON.stringify(fixture.commands),end=replay(fixture.commands),review=box.analyzeMatch(fixture.commands);
  assert.equal(end.phase,'ended');assert.equal(end.ply,8);assert.equal(end.winner,'black');
  assert.equal(review.ply,end.ply);assert.equal(review.winner,end.winner);assert.equal(review.battles.length,1);
  const tip=review.battles[0].tips.red;assert(tip);assert.equal(tip.round,1);assert.equal(tip.alternative.id,'guard');
  const s=replay(fixture.commands.slice(0,4)),alternative=result(s,true,tip.alternative.id,tip.enemyId);assert.notEqual(alternative.phase,'ended');
  assert.deepEqual(copy(box.analyzeMatch(fixture.commands)),copy(review));assert.equal(JSON.stringify(fixture.commands),input);
});

function cardScene(){
  const s=E.create('attrition');s.pieces=[E.piece('hero','red','guard',4,8),E.piece('target','black','pawn',5,7),E.piece('red_king','red','king',3,9),E.piece('black_king','black','king',5,0)];
  E.get(s,'hero').learned=['guard_palace'];E.move(s,'hero',5,7);s.duel.round=6;return s;
}
test('已确定判和时，不把继续交战视为更优结果',()=>{
  const s=cardScene(),next=result(s,true,'guard_palace','guard');assert.equal(next.phase,'board');
  s.repetitions[E.key(next)]=2;
  assert.equal(result(s,true,'guard_palace','guard').winner,'draw');assert.equal(result(s,true,'guard','guard').phase,'board');
  assert.equal(reviewed(s,true,'guard_palace','guard'),null);
});

test('实际仍可继续时，不推荐仅因省牌而立即判和的替代',()=>{
  const s=cardScene(),next=result(s,true,'guard','guard');s.repetitions[E.key(next)]=2;
  assert.equal(result(s,true,'guard_palace','guard').phase,'board');assert.equal(result(s,true,'guard','guard').winner,'draw');
  assert.equal(reviewed(s,true,'guard_palace','guard'),null);
});

test('红黑进守均保留可将确定和局改为立即获胜的替代',()=>{
  for(const isA of [true,false]){
    const s=E.create('attrition');s.pieces=[E.piece('hero','red','king',4,9),E.piece('target','black','king',4,0)];
    E.move(s,'hero',4,0);s.duel.round=6;E.get(s,isA?'hero':'target').hp=8;E.get(s,isA?'target':'hero').hp=4;
    const next=result(s,isA,'strike','strike');s.repetitions[E.key(next)]=2;
    assert.equal(result(s,isA,'strike','strike').winner,'draw');
    const tip=reviewed(s,isA,'strike','strike');assert(tip);assert.equal(tip.alternative.id,'guard');
    assert.equal(result(s,isA,tip.alternative.id,'strike').winner,isA?'red':'black');
  }
});

test('普通交战与三种残局的替代按真实规则核对，查看不改输入',()=>{
  for(const scenario of ['tactics','challenge-support','challenge-relay','challenge-tempo'])for(const round of [1,6])for(const force of [0,2])for(const hp of [[1,3],[4,5],[18,18]]){
    const s=E.create(scenario);E.move(s,'hero',4,4);s.duel.round=round;s.duel.forceA=force;s.duel.forceD=force;
    E.get(s,'hero').hp=hp[0];E.get(s,'target').hp=hp[1];
    for(const isA of [true,false]){
      const mine=E.get(s,isA?s.duel.a:s.duel.d),enemy=E.get(s,isA?s.duel.d:s.duel.a);
      for(const mineId of C.choices(s,mine,s.duel))for(const enemyId of C.choices(s,enemy,s.duel)){
        inputs++;const tip=reviewed(s,isA,mineId,enemyId);if(!tip)continue;
        const actual=result(s,isA,mineId,enemyId),alternative=result(s,isA,tip.alternative.id,enemyId);
        assert(C.choices(s,mine,s.duel).includes(tip.alternative.id));assert(tip.alternative.loss<=tip.actual.loss);assert(tip.alternative.damage>=tip.actual.damage);
        assert.notEqual(alternative.winner,E.OTHER[mine.side]);
        if(actual.phase!=='ended')assert.notEqual(alternative.winner,'draw');
        if(actual.winner===mine.side)assert.equal(alternative.winner,mine.side);
        if(actual.winner==='draw')assert(['draw',mine.side].includes(alternative.winner));
      }
    }
  }
  assert(inputs>1000);
});
console.log('复盘即时结果：'+checks+' 组、'+inputs+' 个输入检查通过。');
