const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function engine(){
  const box=vm.createContext({});vm.runInContext(scripts[0],box);
  const source=scripts[1].replace('return {actions,choices','return {formations,actions,choices');
  vm.runInContext(source,box);return {E:box.Yiwu,C:box.YiwuComputer};
}
const {E,C}=engine(),copy=x=>JSON.parse(JSON.stringify(x));
function scene(){const s=E.create('full');E.auto(s,'red',true);E.auto(s,'black',true);E.start(s);return s;}
function check(s){
  const input=JSON.stringify(s),actual=copy(C.rankedActions(s));
  assert.deepEqual(actual,copy(engine().C.rankedActions(s)));
  assert.equal(JSON.stringify(s),input);return actual;
}
function history(s,count=1){
  const past=copy(s),rook=E.at(past,0,9);E.move(past,rook.id,0,8);
  E.at(past,0,3).y=4;
  const key=E.key(past);s.repetitions[key]=count;return {key,id:rook.id,x:0,y:8};
}
const score=(rows,a)=>rows.find(x=>x.id===a.id&&x.x===a.x&&x.y===a.y).score;
let checks=0;function test(name,run){run();checks++;console.log('通过：'+name);}
test('只缓存已有历史，不把各个试算落点存入缓存',()=>{
  const s=scene();check(s);const cache=C.formations.red.get(s.repetitions);
  assert(cache&&cache.keys.size===Object.keys(s.repetitions).length);
  for(let i=0;i<3;i++)check(s);
  assert.equal(C.formations.red.get(s.repetitions),cache);
  assert.equal(cache.keys.size,Object.keys(s.repetitions).length);
  assert([...cache.keys.values()].every(x=>typeof x==='string'));
});
test('同一历史的计数变化实时影响重复惩罚，不沿用旧次数',()=>{
  const s=scene(),a=history(s),first=score(check(s),a);
  s.repetitions[a.key]=2;assert(Math.abs(score(check(s),a)-(first-3))<1e-9);
  s.repetitions[a.key]=1;assert.equal(score(check(s),a),first);
});
test('增加或删除历史键后，当前统计与重新计算一致',()=>{
  const s=scene(),a=history(s);check(s);
  const past=JSON.parse(a.key);past[1].find(p=>p[0]===E.at(s,2,3).id)[2]=4;
  const second=JSON.stringify(past);s.repetitions[second]=1;const two=score(check(s),a);
  delete s.repetitions[a.key];assert(Math.abs(score(check(s),a)-(two+3))<1e-9);
  delete s.repetitions[second];check(s);
});
test('红黑分别归一历史阵形，交替查询仍保持原有评分',()=>{
  const s=scene();history(s);check(s);s.turn='black';check(s);s.turn='red';check(s);
  assert(C.formations.red.get(s.repetitions));assert(C.formations.black.get(s.repetitions));
  assert.notEqual(C.formations.red.get(s.repetitions),C.formations.black.get(s.repetitions));
});
test('棋子集合或归属变化后重建缓存，输入历史仍独立',()=>{
  const s=scene();history(s);check(s);let previous=C.formations.red.get(s.repetitions);
  s.pieces=s.pieces.filter(p=>p.id!==E.at(s,8,6).id);check(s);
  assert.notEqual(C.formations.red.get(s.repetitions),previous);previous=C.formations.red.get(s.repetitions);
  const a=E.at(s,0,6),b=E.at(s,0,3);[a.side,b.side]=[b.side,a.side];check(s);
  assert.notEqual(C.formations.red.get(s.repetitions),previous);
});
test('刷新重放形成的新历史对象不共享旧缓存',()=>{
  const s=scene();history(s);check(s);const restored=copy(s);check(restored);
  assert.notEqual(C.formations.red.get(s.repetitions),C.formations.red.get(restored.repetitions));
  restored.repetitions={};check(restored);check(s);
});
test('第三次完整局面判和仍按实时记录结算',()=>{
  const s=scene(),next=copy(s),p=E.at(next,0,9);E.move(next,p.id,0,8);
  s.repetitions[E.key(next)]=1;check(s);s.repetitions[E.key(next)]=2;check(s);
  const end=copy(s);E.move(end,p.id,0,8);assert.equal(end.winner,'draw');
});
test('两种难度的选步在各随机位置均与无旧缓存的查询一致',()=>{
  const s=scene();history(s);check(s);
  for(const difficulty of ['standard','practice'])for(const roll of [0,.25,.5,.75,.999999]){
    assert.deepEqual(copy(C.board(s,()=>roll,difficulty)),copy(engine().C.board(s,()=>roll,difficulty)));
  }
});
console.log('历史阵形缓存：'+checks+' 组检查通过。');
