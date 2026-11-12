const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'pawn-reach-0.6.117.json'))),source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../../index.html'),'utf8'),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
assert.equal(hash(source),data.sourceSHA256.baseline,'请传入报告指定的0.6.117源码');assert.equal(source.split(data.patch.before).length,2);const candidate=source.replace(data.patch.before,data.patch.after);assert.equal(hash(candidate),data.sourceSHA256.candidate);
const scripts=html=>[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts(source)[0],scripts(candidate)[0]);assert.equal(scripts(source)[2],scripts(candidate)[2]);
const box=vm.createContext({});for(const s of scripts(source).slice(0,2))vm.runInContext(s,box);const E=box.Yiwu;
const block=html=>html.match(/        (?:let|const) targets=s\.pieces\.filter\(q=>q\.side!==p\.side\);[^]*?        const distance=[^\n]+;/)[0];
vm.runInContext('const E=Yiwu;function oldDistance(s,p){'+block(source)+'return {ids:targets.map(q=>q.id),distance};}function newDistance(s,p){'+block(candidate)+'return {ids:targets.map(q=>q.id),distance};}',box);
const reachCache=new Map();
function reachable(p){
  const key=[p.side,p.x,p.y].join(',');if(reachCache.has(key))return reachCache.get(key);
  const distances=new Map([[p.x+','+p.y,0]]),queue=[[p.x,p.y]];
  for(const [x,y]of queue){const at={...p,x,y};for(const m of E.moves({pieces:[at]},at)){const k=m.x+','+m.y;if(!distances.has(k)){distances.set(k,distances.get(x+','+y)+1);queue.push([m.x,m.y]);}}}
  reachCache.set(key,distances);return distances;
}
let geometryPairs=0,oldErrors=0;
for(const side of ['red','black'])for(let y=0;y<10;y++)for(let x=0;x<9;x++){
  const p=E.piece('p',side,'pawn',x,y),distances=reachable(p);
  for(let ty=0;ty<10;ty++)for(let tx=0;tx<9;tx++){
    if(tx===x&&ty===y)continue;const enemy=E.piece('e',E.OTHER[side],'rook',tx,ty),s={pieces:[p,enemy]},before=JSON.stringify(s),expected=distances.get(tx+','+ty),next=box.newDistance(s,p),old=box.oldDistance(s,p);
    assert.equal(next.ids.length,expected===undefined?0:1);assert.equal(next.distance,expected??9);assert.equal(JSON.stringify(s),before);oldErrors+=old.ids.length!==(expected===undefined?0:1)||old.distance!==(expected??9)?1:0;geometryPairs++;
  }
}
assert.equal(geometryPairs,16020);assert(oldErrors>0);
for(const [index,game]of data.auditGames.entries()){
  let s,boardStates=0,affectedStates=0,chosenAffectedPawn=0,pawnMovesInAffectedStates=0;const expected=data.audit.rows[index];
  for(const [op,...args]of game.commands){
    if(s?.phase==='board'&&s.quiet>=20){
      boardStates++;const bad=s.pieces.filter(p=>p.kind==='pawn').filter(p=>{const enemies=s.pieces.filter(q=>q.side!==p.side),distance=Math.min(...enemies.map(q=>Math.abs(q.x-p.x)+Math.abs(q.y-p.y))),nearest=enemies.filter(q=>Math.abs(q.x-p.x)+Math.abs(q.y-p.y)===distance);return nearest.length&&nearest.every(q=>!reachable(p).has(q.x+','+q.y));});
      if(bad.length){affectedStates++;const p=op==='move'?E.get(s,args[0]):null;if(p?.kind==='pawn'&&!E.at(s,args[1],args[2])){pawnMovesInAffectedStates++;if(bad.some(q=>q.id===p.id))chosenAffectedPawn++;}}
    }
    if(op==='create')s=E.create(...args);else E[op](s,...args);
  }
  assert.equal(hash(JSON.stringify(s)),game.terminalSHA256);for(const [key,value]of Object.entries({boardStates,affectedStates,chosenAffectedPawn,pawnMovesInAffectedStates}))assert.equal(value,expected[key]);
}
function setup(s,side,style,variant){
  if(style==='default'){E.auto(s,side,true);return;}
  const ps=s.pieces.filter(p=>p.side===side).sort((a,b)=>side==='red'?a.x-b.x:b.x-a.x),kinds=style==='defense'?['pawn','guard','elephant','horse','cannon','rook','king']:['rook','horse','cannon','pawn','guard','elephant','king'];
  let order=ps.filter(p=>p.kind!=='king').sort((a,b)=>kinds.indexOf(a.kind)-kinds.indexOf(b.kind));if(style==='mixed')order=['rook','pawn','guard','horse','cannon','elephant'].map(kind=>ps.find(p=>p.kind===kind));
  for(let i=0;i<order.length&&s.budget[side];i++){const p=order[i],ids=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind);for(const n of style==='spread'?[(i+variant)%3]:[[0,1],[0,2],[1,2]][variant])if(s.budget[side])E.learn(s,p.id,ids[n]);}
  assert.equal(s.budget[side],0);
}
const planned=new Set(data.plan.inputs.map(i=>JSON.stringify(i)));assert.equal(planned.size,136);assert.equal(hash(data.driverSource),data.plan.driverSHA256);
const fresh=new Set(data.plan.inputs.filter(i=>i.group!=='known').flatMap(i=>[i.seedA,i.seedB]));assert.equal(fresh.size,64);assert([...fresh].every(n=>!data.plan.excludedSeeds.includes(n)));assert.equal(data.plan.excludedSeeds.length,3116);
const roots=new Map();for(const i of data.plan.inputs.filter(i=>i.group!=='known')){
  for(const [side,key]of [['red','seedA'],['black','seedB']])assert.equal(i[key],crypto.createHash('sha256').update([data.plan.seedLabel,i.difficulty,i.group,i.scenario,i.replicate,side].join(':')).digest().readUInt32LE(0));
  const key=JSON.stringify([i.difficulty,i.group,i.scenario,i.replicate]),list=roots.get(key)||[];list.push(i.models);roots.set(key,list);
}
assert.equal(roots.size,32);for(const list of roots.values())assert.deepEqual(list.map(x=>x.red+':'+x.black).sort(),['baseline:baseline','baseline:candidate','candidate:baseline','candidate:candidate']);
for(const r of data.recovery.shards){const report=data.reports.find(x=>x.shard===r.shard);assert.equal(hash(JSON.stringify(report.runs.slice(0,r.originalComplete))),r.originalPrefixSHA256);assert.equal(r.originalComplete+r.resumed,34);}
let games=0,commands=0,rounds=0;const runs=data.reports.flatMap(r=>{assert(r.completed&&!r.errors.length&&r.runs.length===34);return r.runs;});
for(const run of runs){
  assert(planned.delete(JSON.stringify(run.input)));const input=run.input,expected=E.create(input.scenario);setup(expected,input.aSide,input.style,input.aVariant);setup(expected,E.OTHER[input.aSide],input.comparator,input.bVariant);E.start(expected);
  const stats={moves:0,rests:0,passes:0,battles:0,rounds:0,retreats:0,reversals:0},last=new Map();let s,activity;
  for(const [op,...args]of run.commands){
    commands++;if(op==='create'){assert(!s);s=E.create(...args);continue;}
    if(op==='start')activity=Object.fromEntries(s.pieces.map(p=>[p.id,{side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));
    if(op==='move'){
      const p=E.get(s,args[0]),d=E.at(s,args[1],args[2]);assert.equal(s.phase,'board');
      if(d){stats.battles++;activity[p.id].attacks++;activity[d.id].defenses++;last.delete(p.id);}else{stats.moves++;activity[p.id].moves++;const previous=last.get(p.id);if(previous&&previous[0]===args[1]&&previous[1]===args[2])stats.reversals++;last.set(p.id,[p.x,p.y]);}
    }else if(op==='rest'){stats.rests++;activity[args[0]].rests++;}else if(op==='pass')stats.passes++;
    else if(op==='retreat'){assert(s.duel.round>=2);stats.retreats++;}
    else if(op==='resolve'){
      const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d);assert(!E.availability(s,a,args[0],s.duel));assert(!E.availability(s,d,args[1],s.duel));const r=E.roundDamage(s.duel,...args);
      activity[a.id].damage+=Math.min(d.hp,r.toD);activity[d.id].damage+=Math.min(a.hp,r.toA);if(r.toD>=d.hp)activity[a.id].captures++;if(r.toA>=a.hp)activity[d.id].captures++;if(E.CARDS[args[0]])activity[a.id].cardUses++;if(E.CARDS[args[1]])activity[d.id].cardUses++;stats.rounds++;rounds++;
    }
    E[op](s,...args);if(op==='start')assert.equal(JSON.stringify(s),JSON.stringify(expected));
  }
  assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);for(const [key,value]of Object.entries(stats))assert.equal(value,run[key]);games++;
}
assert.equal(games,136);assert.equal(planned.size,0);
for(const difficulty of ['standard','practice'])for(const mode of ['quick','full']){
  const rows=runs.filter(r=>r.input.group!=='known'&&r.input.difficulty===difficulty&&r.input.scenario===mode),direct=rows.filter(r=>r.input.models.red!==r.input.models.black),points=direct.map(r=>r.winner==='draw'?.5:r.input.models[r.winner]==='candidate'?1:0),summary={direct:{games:points.length,wins:points.filter(p=>p===1).length,draws:points.filter(p=>p===.5).length,losses:points.filter(p=>p===0).length,points:points.reduce((a,b)=>a+b,0)}};
  for(const model of ['baseline','candidate']){const self=rows.filter(r=>r.input.models.red===model&&r.input.models.black===model),plies=self.map(r=>r.plies).sort((a,b)=>a-b);summary[model]={games:self.length,meanPlies:plies.reduce((a,b)=>a+b,0)/plies.length,medianPlies:(plies[(plies.length-1)>>1]+plies[plies.length>>1])/2,maxPlies:plies.at(-1),draws:self.filter(r=>r.winner==='draw').length,singleDamageWins:self.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1).length};}
  summary.passedGates=summary.direct.points>=summary.direct.games/2&&summary.candidate.meanPlies<=summary.baseline.meanPlies&&summary.candidate.maxPlies<=summary.baseline.maxPlies;assert.deepEqual(summary,data.summary[difficulty+'-'+mode]);
}
assert.equal(data.regression.rows.length,43);assert(data.regression.rows.every(r=>r.passed));assert.deepEqual(data.decision.failedGates,Object.entries(data.summary).filter(([,r])=>!r.passedGates).map(([k])=>k));assert.equal(data.decision.adopted,false);
console.log(JSON.stringify({games,commands,rounds,geometryPairs,oldGeometryErrors:oldErrors,auditGames:2,allTerminalHashesMatch:true,allPieceActivityMatches:true,allPlanInputsUnique:true,controllerChoicesIndependentlyRecomputed:false,regressionResultsCapturedNotRerun:43,adopted:false}));
