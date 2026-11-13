const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),file=process.argv[2]||path.join(__dirname,'..','index.html'),scripts=[...fs.readFileSync(file,'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),box=vm.createContext({}),copy=x=>JSON.parse(JSON.stringify(x));
vm.runInContext(scripts[0],box);
const marker='return {actions,choices,';assert.equal(scripts[1].split(marker).length,2);
vm.runInContext(scripts[1].replace(marker,`return {damage,caches:()=>[damageCache,outlookCache],uncached:rankedActions,query(fn){const pd=damageCache,po=outlookCache;damageCache=new Map();outlookCache=new Map();try{return fn();}finally{damageCache=pd;outlookCache=po;}},actions,choices,`),box);
const E=box.Yiwu,C=box.YiwuComputer,fixtures=path.resolve(process.argv[3]||__dirname),cases=['computer-capture-position-fixture.json','computer-two-round-capture-fixture.json'].map(name=>require(path.join(fixtures,name)).commands),empty=()=>assert(C.caches().every(value=>value===null));let queries=0,damages=0;
for(const commands of cases){
  let s;for(const [op,...args]of commands)if(op==='create')s=E.create(...args);else E[op](s,...args);assert.equal(s.phase,'board');
  const raw=JSON.stringify(s),expected=copy(C.uncached(s)),actual=copy(C.rankedActions(s));
  assert.deepEqual(actual.map(a=>({...a,score:Math.round(a.score*1e9)})),expected.map(a=>({...a,score:Math.round(a.score*1e9)})));for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i].score-expected[i].score)<1e-10);empty();
  C.query(()=>{const before=C.caches();C.rankedActions(s);assert(C.caches().every((value,i)=>value===before[i]));assert.throws(()=>C.rankedActions({...s,repetitions:{invalid:2}}));assert(C.caches().every((value,i)=>value===before[i]));});empty();assert.equal(JSON.stringify(s),raw);queries++;
}
const ids=Object.keys(E.BASE).concat(Object.keys(E.CARDS)),contexts=[[0,0,0,0,1],[1,2,2,1,1],[2,1,1,2,6],[3,3,0,0,2],[2,3,2,2,6],[3,2,1,0,1]].map(([sa,sd,forceA,forceD,round])=>({supportA:Array(sa).fill('a'),supportD:Array(sd).fill('d'),forceA,forceD,round}));
C.query(()=>{
  for(const ctx of contexts)for(const a of ids)for(const d of ids){assert.deepEqual(copy(C.damage(ctx,a,d)),copy(E.roundDamage(ctx,a,d)));assert.deepEqual(copy(C.damage(ctx,a,d)),copy(E.roundDamage(ctx,a,d)));damages+=2;}
  for(const id of [null,{},'__proto__','missing'])assert.throws(()=>C.damage(contexts[0],id,'strike'));
  E.CARDS.extra_move={...E.CARDS.rook_hold};try{assert.deepEqual(copy(C.damage(contexts[0],'extra_move','strike')),copy(E.roundDamage(contexts[0],'extra_move','strike')));}finally{delete E.CARDS.extra_move;}
});empty();assert.throws(()=>C.query(()=>{throw new Error('query');}),/query/);empty();
const damage=E.roundDamage;E.roundDamage=(...args)=>({...damage(...args),toA:99});try{C.query(()=>assert.equal(C.damage(contexts[0],'strike','guard').toA,99));}finally{E.roundDamage=damage;}empty();C.query(()=>assert.deepEqual(copy(C.damage(contexts[0],'strike','guard')),copy(E.roundDamage(contexts[0],'strike','guard'))));empty();
console.log(JSON.stringify({queries,damageChecks:damages,nestedAndExceptionalCachesRestored:true,newAndInvalidCardsChecked:true,changedFunctionDoesNotReusePreviousQuery:true,inputsUnchanged:true}));
