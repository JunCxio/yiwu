const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);
const helpers=['moveIcon','damageBreakdownHTML','actualSuppression','revealCard'].map(name=>scripts[2].match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))[0]);
const escape=scripts[2].match(/,esc=([^\n]+);/)[1];
vm.runInContext('const E=Yiwu,esc='+escape+';'+helpers.join('\n'),box);
const E=box.Yiwu;let checks=0,settlements=0,renders=0;
function test(name,run){run();checks++;console.log('通过：'+name);}
function battle(mirror){
  const s=E.create('tactics');E.move(s,'hero',4,4);
  if(mirror){for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}s.turn='black';s.duel=E.context(s,E.get(s,s.duel.a),E.get(s,s.duel.d));}
  return s;
}
function settle(s,aId,dId){
  const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.resolve(s,aId,dId);settlements++;
  const before=JSON.stringify({s,r});
  for(const [p,isA]of [[a,true],[d,false]]){
    const hpBefore=isA?r.hpBeforeA:r.hpBeforeD,hpAfter=isA?r.hpA:r.hpD;
    const loss=hpBefore-hpAfter,damage=isA?r.toD:r.toA;
    box.piece=p;box.isA=isA;box.result=r;
    const rendered=vm.runInContext('revealCard(piece,isA,result)',box);renders++;
    assert(rendered.includes('<b>'+(loss?'−'+loss:'无伤')+'</b><span>自身实际损血</span>'));
    assert(!rendered.includes('−0'));
    assert(rendered.includes('<strong>'+damage+'</strong><span>造成结算伤害</span>'));
    assert(rendered.includes('自身生命 '+hpBefore+' → '+hpAfter));
    assert.equal(vm.runInContext('revealCard(piece,isA,result)',box),rendered);renders++;
  }
  assert.equal(JSON.stringify({s,r}),before,'查看结果不得改变状态或扣血');
  return r;
}

test('红黑进守分别区分无伤与损血，攻击者造成伤害时仍可自身无伤',()=>{
  for(const mirror of [false,true]){
    const s=battle(mirror),r=settle(s,'strike','focus');
    assert.equal(r.hpBeforeA,r.hpA);assert(r.hpD<r.hpBeforeD);assert(r.toD>0);
  }
});
test('双方无伤不会沿用上一轮损血，第六轮离场仍显示本轮结果',()=>{
  for(const mirror of [false,true]){
    const s=battle(mirror);settle(s,'strike','focus');
    for(let i=0;i<5;i++){const r=settle(s,'guard','guard');assert.equal(r.toA+r.toD,0);assert.equal(r.finished,i===4);}
  }
});
test('过量伤害仅显示实际损血，单方阵亡及双方阵亡均按真实生命变化显示',()=>{
  for(const mirror of [false,true])for(const simultaneous of [false,true]){
    const s=battle(mirror);let r;
    for(const reply of simultaneous?Array(6).fill('strike'):['focus','focus','strike','focus'])r=settle(s,'strike',reply);
    assert.equal(r.hpD,0);assert(r.toD>r.hpBeforeD);
    assert.equal(r.hpA===0,simultaneous);
  }
});
console.log(JSON.stringify({checks,settlements,renders,inputsUnchanged:true}));
