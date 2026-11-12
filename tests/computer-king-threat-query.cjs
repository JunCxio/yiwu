const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||__dirname+'/../index.html','utf8'),scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0,2).map(m=>m[1]),box=vm.createContext({});
vm.runInContext(scripts[0],box);vm.runInContext(scripts[1].replace('return {actions,choices,','return {threatCost,actions,choices,'),box);
const E=box.Yiwu,C=box.YiwuComputer;
// 保留优化前的威胁判断，独立核对生命边界与残局豁免。
function reference(s,p,repeated=false){
  let enemies=s.pieces.filter(q=>q.side!==p.side&&E.geometry(s,q,p.x,p.y,true));
  if(E.CHALLENGES[s.scenario]&&p.kind==='king'&&p.side==='black')enemies=[];
  if(p.kind==='king'&&!E.CHALLENGES[s.scenario])enemies=enemies.filter(q=>!C.battleOutlook(s,E.context(s,q,p)).counters.length);
  if(!enemies.length)return 0;
  const guards=E.support(s,p,p.x,p.y,[p.id]).length,values={king:60,rook:9,cannon:8,horse:8,pawn:6,guard:6,elephant:6};
  return values[p.kind]*(p.kind==='king'?(repeated?.07:.7):.14)*(1+Math.max(0,12-p.hp)/12)/(1+Math.min(2,guards)*.4);
}
let damageChecks=0,availabilityChecks=0,threatChecks=0,oneHpCounters=0;
const counter={strike:'guard',guard:'break',break:'strike',focus:'guard'};
for(const id of [...Object.keys(E.BASE),...Object.keys(E.CARDS)])for(let round=1;round<=6;round++)for(const supportA of [0,1,2,4])for(const supportD of [0,1,2,4])for(let forceA=0;forceA<=2;forceA++)for(let forceD=0;forceD<=2;forceD++){
  const ctx={a:'a',d:'d',round,supportA:Array(supportA).fill('a'),supportD:Array(supportD).fill('d'),forceA,forceD},reply=counter[(E.BASE[id]||E.CARDS[id]).type];
  assert(E.roundDamage(ctx,reply,id).toA<=1);damageChecks++;
  for(const kind of Object.keys(E.NAMES.red)){
    const p=E.piece('a','red',kind,4,5);assert.equal(E.availability({pieces:[p]},p,reply,ctx),'');availabilityChecks++;
  }
}
for(const side of ['red','black'])for(const scenario of ['quick',...Object.keys(E.CHALLENGES)])for(const hp of [1,2,6,18])for(const enemyHp of [1,2,18])for(const learned of [[],['king_calm'],['king_lead'],['king_command'],['king_calm','king_lead'],['king_calm','king_command'],['king_lead','king_command']])for(const used of [false,true])for(const supported of [false,true]){
  const s=E.create(scenario),king=Object.assign(E.piece('k',side,'king',3,side==='red'?9:0),{hp,learned:[...learned],exhausted:used?[...learned]:[]}),enemy=Object.assign(E.piece('q',E.OTHER[side],'rook',3,5),{hp:enemyHp,learned:['rook_crush','rook_lock'],exhausted:[]});
  s.pieces=[king,enemy];if(supported)s.pieces.push(E.piece('support',side,'rook',0,king.y));
  const raw=JSON.stringify(s);
  for(const repeated of [false,true]){assert.equal(C.threatCost(s,king,repeated),reference(s,king,repeated));assert.equal(C.threatCost(s,enemy,repeated),reference(s,enemy,repeated));threatChecks+=2;}
  if(!E.CHALLENGES[scenario]&&enemyHp===1&&C.battleOutlook(s,E.context(s,enemy,king)).counters.length){assert.equal(C.threatCost(s,king),0);oneHpCounters++;}
  assert.equal(JSON.stringify(s),raw);
}
assert(oneHpCounters>0);console.log(JSON.stringify({damageChecks,availabilityChecks,threatChecks,oneHpCounters,inputsUnchanged:true}));
