const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||path.join(__dirname,'..','index.html'),html=fs.readFileSync(file,'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);
// 仅在测试上下文中访问内部评分，不为游戏增加接口。
const original='return {actions,choices',exposed='return {position,actions,choices';assert(scripts[1].includes(original));vm.runInContext(scripts[1].replace(original,exposed),box);
const E=box.Yiwu,C=box.YiwuComputer,support=E.support;let calls=[];
E.support=(state,p,...args)=>{calls.push(p.id);return support(state,p,...args);};
function scene(rows){const s=E.create('attrition');s.pieces=rows.map(([id,side,kind,x,y,hp])=>Object.assign(E.piece(id,side,kind,x,y),{hp}));return s;}
const kings=[['rk','red','king',3,9,18],['bk','black','king',5,0,18]];
let passed=0;function test(name,fn){fn();passed++;console.log('通过：'+name);}
test('没有敌方走法威胁时无需查询防守支援，镜像阵形评分相抵',()=>{
  const s=scene([...kings,['rp','red','pawn',4,6,18],['bp','black','pawn',4,3,18]]),before=JSON.stringify(s);calls=[];
  assert(Math.abs(C.position(s,'red'))<1e-8);assert(Math.abs(C.position(s,'black'))<1e-8);assert.deepEqual(calls,[]);assert.equal(JSON.stringify(s),before);
});
test('双方伤子受威胁时仍计算支援减免，评分与既有结果一致',()=>{
  const s=scene([...kings,['rr','red','rook',0,5,14],['bp','black','pawn',0,4,9],['support_r','red','pawn',0,6,18],['support_b','black','rook',0,0,18]]),before=JSON.stringify(s);
  for(const side of ['red','black'])for(const repeated of [false,true]){
    calls=[];assert(Math.abs(C.position(s,side,repeated)-(side==='red'?.635:-.635))<1e-8);assert.deepEqual(calls,['rr','bp']);
  }
  assert.equal(JSON.stringify(s),before);
});
test('将帅能确保反杀时不计空威胁，也不再查询其防守支援',()=>{
  const s=scene([...kings,['br','black','rook',3,5,1]]),before=JSON.stringify(s);assert(C.battleOutlook(s,E.context(s,E.get(s,'br'),E.get(s,'rk'))).counters.length);calls=[];
  assert(Math.abs(C.position(s,'red')+5.3)<1e-8);assert.deepEqual(calls,[]);assert.equal(JSON.stringify(s),before);
});
test('没有安全空位退路时保留原有追将权重，己方将帅避险保留完整评分',()=>{
  const s=scene([['rk','red','king',3,9,1],kings[1],['br','black','rook',3,5,18],['br2','black','rook',4,5,18]]),before=JSON.stringify(s);calls=[];
  const black=C.position(s,'black'),repeatedBlack=C.position(s,'black',true);assert(Math.abs(black-repeatedBlack-72.45)<1e-8);
  assert.equal(C.position(s,'red'),C.position(s,'red',true));assert(calls.length>=4&&calls.every(id=>id==='rk'));assert.equal(JSON.stringify(s),before);
});
console.log('走棋站位评分与支援查询：'+passed+' 组通过。');
