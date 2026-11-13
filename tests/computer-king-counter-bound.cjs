const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8'),box=vm.createContext({});
for(const script of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2))vm.runInContext(script[1].replace('return {actions,choices,','return {threatCost,actions,choices,'),box);
const E=box.Yiwu,C=box.YiwuComputer;let damages=0,threats=0,counters=0;
for(let a=0;a<=4;a++)for(let d=0;d<=4;d++)for(const id of [...Object.keys(E.BASE),...Object.keys(E.CARDS)]){
  const ctx={round:1,forceA:0,forceD:0,supportA:Array(a).fill('a'),supportD:Array(d).fill('d')},r=E.roundDamage(ctx,id,'strike');
  assert(r.toA>=1);assert(r.toD<=8);damages++;
}
for(const side of ['red','black'])for(const kind of Object.keys(E.NAMES[side]))for(const hp of [1,2,7,8,9,10,18])for(const supported of [false,true])for(const used of [false,true]){
  const s=E.create('quick'),king=Object.assign(E.piece('k',side,'king',4,side==='red'?9:0),{hp}),attacker=Object.assign(E.piece('a',E.OTHER[side],kind,4,5),{hp:1});
  attacker.learned=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===kind);attacker.exhausted=used?[...attacker.learned]:[];
  king.learned=['king_calm','king_lead','king_command'];s.pieces=[king,attacker];
  if(supported)s.pieces.push(E.piece('sa',attacker.side,'rook',0,king.y),E.piece('sd',side,'rook',8,king.y));
  const raw=JSON.stringify(s),ctx=E.context(s,attacker,king),plan=C.battleOutlook(s,ctx),actual=C.threatCost(s,king);
  const attacks=s.pieces.some(q=>q.side!==side&&E.geometry(s,q,king.x,king.y,true)&&!C.battleOutlook(s,E.context(s,q,king)).counters.length),guards=E.support(s,king,king.x,king.y,[king.id]).length;
  const expected=attacks?60*.7*(1+Math.max(0,12-hp)/12)/(1+Math.min(2,guards)*.4):0;
  assert.equal(actual,expected);if(hp>=9){assert(plan.counters.includes('strike'));counters++;}
  assert.equal(JSON.stringify(s),raw);threats++;
}
console.log(JSON.stringify({damageBounds:damages,threatChecks:threats,guaranteedHighHealthCounters:counters,inputUnchanged:true}));
