const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const box=vm.createContext({});for(const script of scripts.slice(0,2))vm.runInContext(script,box);
const E=box.Yiwu,C=box.YiwuComputer,fixture=require('./computer-score-precision-fixture.json'),copy=x=>JSON.parse(JSON.stringify(x));
const key=a=>JSON.stringify([a.type,a.id,a.x,a.y,a.card]),units=a=>Math.round(a.score*1e9);
function replay(commands){let s;for(const [op,...args]of commands){if(op==='create')s=E.create(...args);else E[op](s,...args);}return s;}
function rotate(s){
  s.turn=E.OTHER[s.turn];for(const p of s.pieces){p.side=E.OTHER[p.side];p.x=8-p.x;p.y=9-p.y;}
  s.repetitions=Object.fromEntries(Object.entries(s.repetitions).map(([k,n])=>{const [turn,ps]=JSON.parse(k);return [JSON.stringify([E.OTHER[turn],ps.map(([id,x,y,...rest])=>[id,8-x,9-y,...rest])]),n];}));return s;
}
const failures=[];let passed=0;
function test(name,fn){try{fn();passed++;console.log('通过：'+name);}catch(error){failures.push({name,message:error.message});console.error('失败：'+name+'：'+error.message);}}
for(const rotated of [false,true])test('完整历史移牌'+(rotated?'旋转':'原色')+'：同分顺序、两种难度与输入不变',()=>{
  const states=[fixture.original,fixture.relocated].map(commands=>rotated?rotate(replay(commands)):replay(commands)),before=JSON.stringify(states);
  assert(states.every(s=>s.phase==='board'&&s.ply===7&&s.pieces.every(p=>p.hp===18)&&s.budget.red===0&&s.budget.black===0));
  assert.deepEqual(states.map(s=>copy(s.pieces.map(p=>[p.id,p.side,p.kind,p.x,p.y,p.hp])))[0],states.map(s=>copy(s.pieces.map(p=>[p.id,p.side,p.kind,p.x,p.y,p.hp])))[1]);
  const ranks=states.map(s=>copy(C.rankedActions(s))),scores=new Map(ranks[0].map(a=>[key(a),units(a)]));
  assert(ranks[1].every(a=>scores.get(key(a))===units(a)));
  for(let i=0;i<states.length;i++){
    const canonical=copy(C.actions(states[i])).sort((a,b)=>scores.get(key(b))-scores.get(key(a))).map(key);
    assert.deepEqual(ranks[i].map(key),canonical,'十亿分之一精度相同的行动应保留原合法行动顺序');
    for(const difficulty of ['practice','standard']){
      let pool=ranks[i].filter(a=>units(ranks[i][0])-units(a)<=(difficulty==='practice'?1200000000:60000000));
      if(difficulty==='practice')pool=pool.slice(0,3);
      for(const roll of [0,.25,.5,.75,.999999])assert.equal(key(C.board(states[i],()=>roll,difficulty)),key(pool[Math.floor(roll*pool.length)]));
    }
    assert.deepEqual(copy(C.rankedActions(states[i])),ranks[i]);
  }
  assert.deepEqual(ranks[0].map(key),ranks[1].map(key));
  for(const difficulty of ['practice','standard'])for(const roll of [0,.25,.5,.75,.999999])assert.equal(key(C.board(states[0],()=>roll,difficulty)),key(C.board(states[1],()=>roll,difficulty)));
  assert.equal(JSON.stringify(states),before);
});
// 只替换测试上下文的评分输入，直接检查正式 board 的筛选与随机索引。
const boundary=vm.createContext({probeRanked:[]});vm.runInContext(scripts[0],boundary);
assert(scripts[1].includes('const ranked=rankedActions(s);'));
vm.runInContext(scripts[1].replace('const ranked=rankedActions(s);','const ranked=probeRanked;'),boundary);
for(const difficulty of ['standard','practice'])test(difficulty+'：近分边界包含、超界排除、负分与同分上限',()=>{
  const margin=difficulty==='practice'?1.2:.06;
  for(const best of [0,.35,1.2,1000,-3.7]){
    boundary.probeRanked=[{id:'best',score:best},{id:'edge',score:best-margin-2e-14},{id:'outside',score:best-margin-2e-9}];
    const original=JSON.stringify(boundary.probeRanked);
    for(const roll of [0,.25,.5,.75,.999999])assert.equal(boundary.YiwuComputer.board({phase:'board'},()=>roll,difficulty).id,roll<.5?'best':'edge');
    assert.equal(JSON.stringify(boundary.probeRanked),original);
  }
  boundary.probeRanked=Array.from({length:5},(_,i)=>({id:String(i),score:0}));
  assert.equal(boundary.YiwuComputer.board({phase:'board'},()=>.999999,difficulty).id,difficulty==='practice'?'2':'4');
  boundary.probeRanked=[];assert.equal(boundary.YiwuComputer.board({phase:'board'},()=>0,difficulty).type,'pass');
  assert.throws(()=>boundary.YiwuComputer.board({phase:'ended'}));
});
assert.deepEqual(failures,[]);console.log('走棋评分精度：'+passed+' 组通过。');
