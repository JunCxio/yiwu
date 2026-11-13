const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const source = process.argv[2] || path.resolve(__dirname, '../../index.html');
const file = path.join(__dirname, 'balance-0.6.136.json.gz'), data = JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(file)));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(hash(fs.readFileSync(source)), data.sourceSHA256, '请传入报告指定的0.6.136源码');
assert.equal(data.plan.sourceSHA256,data.sourceSHA256);
assert.equal(data.version,'0.6.136');assert.equal(hash(data.sourceText),data.sourceSHA256);
assert.equal(hash(data.drivers.runner), data.plan.driverSHA256);
assert.equal(hash(data.drivers.worker), data.workerSHA256);
assert.equal(hash(data.drivers.shared), data.plan.upstreamSetupSHA256);
function engine(filename) {const box = vm.createContext({}); for (const match of [...fs.readFileSync(filename, 'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(match[1], box); return {E: box.Yiwu, C: box.YiwuComputer};}
const {E, C} = engine(source), copy = value => JSON.parse(JSON.stringify(value)), pairs = [[0,1],[0,2],[1,2]];
function setup(E,s,side,style,variant){
  if(style==='default'){E.auto(s,side,true);assert.equal(s.budget[side],0);assert.equal(s.pieces.filter(p=>p.side===side).reduce((n,p)=>n+p.learned.length,0),s.points);return;}
  const ps=s.pieces.filter(p=>p.side===side).sort((a,b)=>side==='red'?a.x-b.x:b.x-a.x),kinds=style==='defense'?['pawn','guard','elephant','horse','cannon','rook','king']:['rook','horse','cannon','pawn','guard','elephant','king'];
  let order=ps.filter(p=>p.kind!=='king').sort((a,b)=>kinds.indexOf(a.kind)-kinds.indexOf(b.kind));
  if(style==='mixed')order=['rook','pawn','guard','horse','cannon','elephant'].map(kind=>ps.find(p=>p.kind===kind));
  for(let i=0;i<order.length&&s.budget[side];i++){
    const p=order[i],ids=Object.keys(E.CARDS).filter(id=>E.CARDS[id].kind===p.kind);
    for(const index of style==='spread'?[(i+variant)%3]:pairs[variant])if(s.budget[side])E.learn(s,p.id,ids[index]);
  }
  assert.equal(s.budget[side],0);assert.equal(ps.reduce((n,p)=>n+p.learned.length,0),s.points);
  assert.equal(ps.filter(p=>p.learned.length).length,style==='spread'?s.points:s.points/2);
  assert(ps.every(p=>p.hp===18&&p.learned.length<3));
}

const label='yiwu-balance-matrix-0.6.136:20261113:current',styles=['default','spread','attack','defense','mixed'];
const seed=(difficulty,scenario,style,comparator,replicate,role)=>crypto.createHash('sha256').update(`${label}:${difficulty}:${scenario}:${style}:${comparator}:${replicate}:${role}`).digest().readUInt32LE(0);
function random(value){return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
function inputs(difficulty,scenario){
  const result=[];
  for(let i=0;i<styles.length;i++)for(let j=i+1;j<styles.length;j++){
    const style=styles[i],comparator=styles[j];
    for(let aVariant=0;aVariant<(style==='default'?1:3);aVariant++)for(let bVariant=0;bVariant<3;bVariant++)
      for(let replicate=0;replicate<2;replicate++)for(const aSide of ['red','black'])
        result.push({difficulty,scenario,style,comparator,aVariant,bVariant,replicate,aSide,seedA:seed(difficulty,scenario,style,comparator,replicate,'A'),seedB:seed(difficulty,scenario,style,comparator,replicate,'B')});
  }
  for(let replicate=0;replicate<2;replicate++)for(const assignment of ['normal','swapped']){
    const a=seed(difficulty,scenario,'default','default',replicate,'A'),b=seed(difficulty,scenario,'default','default',replicate,'B');
    result.push({difficulty,scenario,style:'default',comparator:'default',aVariant:0,bVariant:0,replicate,aSide:'red',assignment,seedA:assignment==='normal'?a:b,seedB:assignment==='normal'?b:a});
  }
  return result;
}
function state(E,input){
  const s=E.create(input.scenario),bSide=E.OTHER[input.aSide];
  setup(E,s,input.aSide,input.style,input.aVariant);setup(E,s,bSide,input.comparator,input.bVariant);
  assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);assert(s.pieces.every(p=>p.hp===18&&p.learned.length<=2&&!p.exhausted.length));
  return s;
}
function allocations(E,scenario){
  const rows=[];
  for(const style of styles)for(let variant=0;variant<(style==='default'?1:3);variant++)for(const side of ['red','black']){
    const s=E.create(scenario);setup(E,s,side,style,variant);
    rows.push({style,variant,side,points:s.points,pieces:Array.from(s.pieces.filter(p=>p.side===side),p=>({id:p.id,kind:p.kind,x:p.x,y:p.y,cards:Array.from(p.learned)}))});
  }
  return rows;
}
assert.deepEqual(data.plan.inputs, ['standard','practice'].flatMap(d=>['quick','full'].flatMap(s=>inputs(d,s))));
assert.equal(data.plan.seedLabel,label);for(const value of data.plan.newSeeds){const a=random(value),b=random(value);for(let i=0;i<32;i++){const x=a();assert.equal(x,b());assert(x>=0&&x<1);}}
let games=0,commands=0;const paceRows=[],supportRows=[];
function replay(run){
    assert(run.plies<2000&&run.commands.length<14000);
    let s,activity,roles,firstBattle=null,lastDamage=null,maxQuiet=0,reversals=0;const lastMoves=new Map(),damageActions=new Set(),expected=state(E,run.input);E.start(expected);
    for(const [op,...args]of run.commands){
      if(op==='create'){assert(!s);s=E.create(...args);commands++;continue;}
      if(op==='start'){
        assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);assert(s.pieces.every(p=>p.hp===18&&p.learned.length<=2&&!p.exhausted.length));
        activity=Object.fromEntries(Array.from(s.pieces,p=>[p.id,{side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));
      }
      if(op==='move'&&E.at(s,args[1],args[2])){const a=E.get(s,args[0]),d=E.at(s,args[1],args[2]),ctx=E.context(s,a,d);assert.deepEqual(Array.from(ctx.supportA),Array.from(s.pieces.filter(p=>p.side===a.side&&p.id!==a.id&&p.id!==d.id&&E.geometry(s,p,d.x,d.y,true)),p=>p.id));assert.deepEqual(Array.from(ctx.supportD),Array.from(s.pieces.filter(p=>p.side===d.side&&p.id!==a.id&&p.id!==d.id&&E.geometry(s,p,d.x,d.y,true)),p=>p.id));for(const id of [...ctx.supportA,...ctx.supportD])roles[id].supportBattles++;if(ctx.screen&&E.get(s,ctx.screen).side===a.side)roles[ctx.screen].friendlyScreenBattles++;}
      if(op==='move'){const p=E.get(s,args[0]),target=E.at(s,args[1],args[2]);if(target){firstBattle??=s.ply+1;activity[args[0]].attacks++;activity[target.id].defenses++;lastMoves.delete(p.id);}else{activity[args[0]].moves++;const last=lastMoves.get(p.id);if(last&&last[0]===args[1]&&last[1]===args[2])reversals++;lastMoves.set(p.id,[p.x,p.y]);}}
      if(op==='rest')activity[args[0]].rests++;
      if(op==='start')roles=Object.fromEntries(Array.from(s.pieces,p=>[p.id,{supportBattles:0,friendlyScreenBattles:0,damageTaken:0,attackingDamage:0,counterDamage:0}]));
      if(op==='resolve'){
        const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args);
        roles[a.id].attackingDamage+=Math.min(d.hp,r.toD);roles[d.id].counterDamage+=Math.min(a.hp,r.toA);roles[a.id].damageTaken+=Math.min(a.hp,r.toA);roles[d.id].damageTaken+=Math.min(d.hp,r.toD);
        activity[a.id].damage+=Math.min(d.hp,r.toD);activity[d.id].damage+=Math.min(a.hp,r.toA);
        if(r.toD>=d.hp)activity[a.id].captures++;if(r.toA>=a.hp)activity[d.id].captures++;
        if(E.CARDS[args[0]])activity[a.id].cardUses++;if(E.CARDS[args[1]])activity[d.id].cardUses++;
      }
      const hpBefore=s.pieces.reduce((n,p)=>n+p.hp,0),actionPly=s.ply+1;
      E[op](s,...args);if(op==='start')assert.deepEqual(copy(s),copy(expected));commands++;
      if(s.pieces.reduce((n,p)=>n+p.hp,0)<hpBefore){assert.equal(op,'resolve');lastDamage=actionPly;damageActions.add(actionPly);}maxQuiet=Math.max(maxQuiet,s.quiet);
    }
    assert.equal(s.phase,'ended');assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);assert.equal(s.ply,run.plies);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);
    for(const key of ['moves','rests'])assert.equal(Object.values(activity).reduce((n,p)=>n+p[key],0),run[key]);
    assert.equal(Object.values(activity).reduce((n,p)=>n+p.attacks,0),run.battles);for(const [op,key]of [['resolve','rounds'],['retreat','retreats'],['pass','passes']])assert.equal(run.commands.filter(c=>c[0]===op).length,run[key]);
    assert.equal(run.moves+run.rests+run.passes+run.battles,run.plies);games++;
    assert.equal(reversals,run.reversals);
    for(const [id,p]of Object.entries(roles))assert.equal(p.attackingDamage+p.counterDamage,activity[id].damage);
    if(run.winner!=='draw'){
      const pieces=Object.entries(activity).filter(([,p])=>p.side===run.winner),[leader,p]=pieces.reduce((a,b)=>b[1].damage>a[1].damage?b:a),totalDamage=pieces.reduce((n,[,p])=>n+p.damage,0);
      supportRows.push({input:run.input,winner:run.winner,plies:run.plies,damagePieces:pieces.filter(([,p])=>p.damage>0).length,attackingPieces:pieces.filter(([,p])=>p.attacks>0).length,leader,leaderDamage:p.damage,totalDamage,leaderShare:p.damage/totalDamage,roles:Object.fromEntries(pieces.map(([id,p])=>[id,{...p,...roles[id]}])),postSetupSHA256:hash(JSON.stringify(run.commands.slice(run.commands.findIndex(c=>c[0]==='start')+1)))});
    }
    paceRows.push({input:run.input,plies:run.plies,winner:run.winner,reason:run.reason,battles:run.battles,reversals:run.reversals,firstBattle,lastDamage,damageActions:damageActions.size,totalDamage:Object.values(activity).reduce((n,p)=>n+p.damage,0),trailingQuiet:s.quiet,maxQuiet,remainingPieces:s.pieces.length,remainingKings:Array.from(s.pieces.filter(p=>p.kind==='king'),p=>({side:p.side,hp:p.hp})),terminalSHA256:run.terminalSHA256});
  }

for(const report of data.reports){
  assert(report.completed&&!report.errors.length);assert.equal(report.runs.length,268);assert.deepEqual(report.runs.map(r=>r.input),data.plan.inputs.filter(r=>r.scenario===report.scenario&&r.difficulty===report.difficulty));
  assert.deepEqual(report.allocations,allocations(E,report.scenario));
  for(const run of report.runs)replay(run);
  const matrix=report.runs.filter(r=>r.input.style!==r.input.comparator),summary=data.summary[report.difficulty+'-'+report.scenario];
  const tally=(rows,side)=>{const wins=rows.filter(r=>r.winner===side(r)).length,draws=rows.filter(r=>r.winner==='draw').length;return {games:rows.length,wins,draws,losses:rows.length-wins-draws,points:wins+draws*.5};};
  const checkTally=(actual,expected)=>{for(const key of Object.keys(expected))assert.equal(actual[key],expected[key]);};
  for(const row of summary.byStyle){
    const rows=matrix.filter(r=>r.input.style===row.style||r.input.comparator===row.style),side=r=>r.input.style===row.style?r.input.aSide:E.OTHER[r.input.aSide];
    checkTally(row,tally(rows,side));for(const c of row.byColor)checkTally(c,tally(rows.filter(r=>side(r)===c.side),side));
    for(const o of row.opponents)checkTally(o,tally(rows.filter(r=>r.input.style===o.opponent||r.input.comparator===o.opponent),side));
    assert.equal(row.opponentBalancedRate,row.opponents.reduce((n,o)=>n+o.points/o.games,0)/4);
    const wins=rows.filter(r=>r.winner===side(r));assert.equal(row.winnerActivity.wins,wins.length);
    assert.equal(row.winnerActivity.singleDamagePiece,wins.filter(r=>Object.values(r.pieceActivity).filter(p=>p.side===side(r)&&p.damage>0).length===1).length);
    assert.equal(row.winnerActivity.singleAttackingPiece,wins.filter(r=>Object.values(r.pieceActivity).filter(p=>p.side===side(r)&&p.attacks>0).length===1).length);
    const shares=[],leaderKinds={};for(const run of wins){const pieces=Object.values(run.pieceActivity).filter(p=>p.side===side(run)),total=pieces.reduce((n,p)=>n+p.damage,0),leader=pieces.reduce((a,b)=>b.damage>a.damage?b:a);assert(total>0);shares.push(leader.damage/total);leaderKinds[leader.kind]=(leaderKinds[leader.kind]||0)+1;}
    shares.sort((a,b)=>a-b);assert.deepEqual(row.winnerActivity.leaderKinds,leaderKinds);assert.equal(row.winnerActivity.maxLeaderDamageShare,shares.length?shares[shares.length-1]:null);assert.equal(row.winnerActivity.medianLeaderDamageShare,shares.length?(shares[Math.floor((shares.length-1)/2)]+shares[Math.ceil((shares.length-1)/2)])/2:null);
  }
  for(const pair of summary.pairs){
    const rows=matrix.filter(r=>r.input.style===pair.a&&r.input.comparator===pair.b),side=r=>r.input.aSide;
    checkTally(pair,tally(rows,side));for(const v of pair.variants)checkTally(v,tally(rows.filter(r=>r.input.aVariant===v.aVariant&&r.input.bVariant===v.bVariant),side));
    for(const c of pair.byColor)checkTally(c,tally(rows.filter(r=>r.input.aSide===c.side),side));for(const p of pair.byReplicate)checkTally(p,tally(rows.filter(r=>r.input.replicate===p.replicate),side));
  }
  const pace=rows=>({games:rows.length,mean:rows.reduce((n,r)=>n+r.plies,0)/rows.length,max:Math.max(...rows.map(r=>r.plies)),over200:rows.filter(r=>r.plies>200).length,draws:rows.filter(r=>r.winner==='draw').length,drawReasons:Object.fromEntries([...new Set(rows.filter(r=>r.winner==='draw').map(r=>r.reason))].map(reason=>[reason,rows.filter(r=>r.reason===reason).length]))});
  assert.deepEqual(summary.pace,pace(matrix));const controls=report.runs.filter(r=>r.input.style===r.input.comparator);assert.deepEqual(summary.controls.pace,pace(controls));
  for(const [result,key]of [['red','redWins'],['black','blackWins'],['draw','draws']])assert.equal(summary.controls[key],controls.filter(r=>r.winner===result).length);
}
assert.equal(games,1072);assert.equal(commands,data.verification.commands);
assert.deepEqual(paceRows,data.paceAudit.rows);assert.equal(data.paceAudit.sourceSHA256,data.sourceSHA256);
for(const scenario of ['standard-quick','standard-full','practice-quick','practice-full']){
  const rows=paceRows.filter(r=>r.input.difficulty+'-'+r.input.scenario===scenario&&r.input.style!==r.input.comparator),long=rows.filter(r=>r.plies>200),quiet=rows.filter(r=>r.winner==='draw'&&r.reason==='连续 80 次行动未造成伤害'),sorted=[...rows].sort((a,b)=>a.plies-b.plies);
  const expected={matrixGames:rows.length,zeroBattleGames:rows.filter(r=>!r.battles).length,noDamageGames:rows.filter(r=>!r.totalDamage).length,medianPlies:sorted[Math.ceil(rows.length*.5)-1].plies,p90Plies:sorted[Math.ceil(rows.length*.9)-1].plies,over200:long.length,over200Draws:long.filter(r=>r.winner==='draw').length,quietDraws:quiet.length,quietDrawsAfterDamage:quiet.filter(r=>r.totalDamage>0).length,meanQuietDrawRemainingPieces:quiet.length?quiet.reduce((n,r)=>n+r.remainingPieces,0)/quiet.length:null,longest:rows.reduce((a,b)=>a.plies>=b.plies?a:b)};
  assert.deepEqual(data.paceAudit.summary[scenario],expected);
}
const oldSeeds = new Set(data.plan.excludedSeeds);
assert.equal(oldSeeds.size, 6492);
assert(data.plan.inputs.every(row => !oldSeeds.has(row.seedA) && !oldSeeds.has(row.seedB)));
assert.equal(new Set(data.plan.inputs.flatMap(row => [row.seedA, row.seedB])).size, 176);
const colorRoots=data.colorRoots;
for(const report of data.reports){
  const matrix=report.runs.filter(r=>r.input.style!==r.input.comparator),groups=new Map();
  for(const run of matrix){const {style,comparator,replicate,seedA,seedB}=run.input,key=JSON.stringify([style,comparator,replicate,seedA,seedB]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(run);}
  const count=rows=>Object.fromEntries(['red','black','draw'].map(winner=>[winner,rows.filter(r=>r.winner===winner).length]));
  const values=[...groups.values()].map(rows=>{const {style,comparator,replicate}=rows[0].input,tally=count(rows);return {style,comparator,replicate,games:rows.length,...tally,redRate:(tally.red+tally.draw*.5)/rows.length};});
  assert.equal(values.length,20);
  assert.deepEqual(colorRoots[report.difficulty+'-'+report.scenario],{groups:values.length,redAboveHalf:values.filter(v=>v.redRate>.5).length,redBelowHalf:values.filter(v=>v.redRate<.5).length,equal:values.filter(v=>v.redRate===.5).length,equalRootRedRate:values.reduce((n,v)=>n+v.redRate,0)/values.length,byReplicate:[0,1].map(replicate=>{const rows=matrix.filter(r=>r.input.replicate===replicate);return {replicate,games:rows.length,...count(rows)};}),values});
}

assert.deepEqual(data.reports.map(r=>r.difficulty+'-'+r.scenario),['standard-quick','standard-full','practice-quick','practice-full']);
for(const report of data.reports){
  const key=report.difficulty+'-'+report.scenario,rows=supportRows.filter(r=>r.input.difficulty===report.difficulty&&r.input.scenario===report.scenario),solo=rows.filter(r=>r.damagePieces===1),initiative=rows.filter(r=>r.attackingPieces===1);
  const expected={wins:rows.length,singleDamageWins:solo.length,singleAttackingWins:initiative.length,singleAttackingRoots:new Set(initiative.map(r=>JSON.stringify([r.input.style,r.input.comparator,r.input.replicate,r.input.seedA,r.input.seedB]))).size,singleAttackingSequences:new Set(initiative.map(r=>r.postSetupSHA256)).size,singleDamageWithOtherSupport:solo.filter(r=>Object.entries(r.roles).some(([id,p])=>id!==r.leader&&p.supportBattles>0)).length,rows};
  assert.deepEqual(data.supportAudit[key],expected);
}
assert.equal(data.plan.newSeeds.length,176);
assert.equal(hash(data.seedReferences.replyPlan),data.seedReferences.sha256);
const prior=JSON.parse(data.seedReferences.replyPlan),excluded=new Set([...prior.excludedSeeds,...prior.newSeeds]);
assert.equal(prior.baselineSHA256,data.sourceSHA256);
assert.deepEqual([...excluded].sort((a,b)=>a-b),[...data.plan.excludedSeeds].sort((a,b)=>a-b));
assert.deepEqual(data.plan.newSeeds,[...new Set(data.plan.inputs.flatMap(i=>[i.seedA,i.seedB]))]);
assert.equal(data.oldControls.length,4);
assert.deepEqual(data.verificationMethod.oldControlIndexes,[0,32,64,96]);
assert.deepEqual(data.checks,{plannedGames:1072,variantGroups:264,allocationsChecked:52,distinctSeedStarts:176,randomPrefixChecks:5632,priorControlDecisionsAndCommandsAlreadyVerified:4,seedLabelsIndependentlyRecomputed:true});
assert.equal(hash(data.verificationMethodSource),data.verificationMethodSHA256);
assert.deepEqual(JSON.parse(data.verificationMethodSource),data.verificationMethod);
assert.deepEqual(data.plan.allocations,['quick','full'].flatMap(scenario=>allocations(E,scenario).map(a=>({scenario,...a}))));
for(const scenario of ['quick','full'])for(const row of allocations(E,scenario)){
  const rotate=(p,reverse)=>({kind:p.kind,x:reverse?8-p.x:p.x,y:reverse?9-p.y:p.y,cards:p.cards}),sort=(a,b)=>a.x-b.x||a.y-b.y;
  const opposite=allocations(E,scenario).find(r=>r.style===row.style&&r.variant===row.variant&&r.side===E.OTHER[row.side]);
  assert.deepEqual(row.pieces.map(p=>rotate(p,false)).sort(sort),opposite.pieces.map(p=>rotate(p,true)).sort(sort));
}
let boardChoices=0,combatChoices=0,decisionCommands=0,decisionGames=0;
function verifyChoices(run){
  decisionGames++;console.error(JSON.stringify({decisionGame:decisionGames,input:run.input,plies:run.plies}));
  let s;const other=E.OTHER[run.input.aSide],rng={[run.input.aSide]:random(run.input.seedA),[other]:random(run.input.seedB)};
  const expected=state(E,run.input);E.start(expected);
  assert(['standard','practice'].includes(run.input.difficulty));
  for(const command of run.commands){
    const [op,...args]=command;
    if(s?.phase==='board'){
      const a=C.board(s,rng[s.turn],run.input.difficulty);boardChoices++;assert.equal(a.type,op);
      if(op==='move')assert.deepEqual([a.id,a.x,a.y],args);else if(op==='rest')assert.deepEqual([a.id,a.card],args);else assert.equal(op,'pass');
    }else if(s?.phase==='duel'){
      const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),x=C.combat(s,a.side,rng[a.side],run.input.difficulty);combatChoices++;
      if(op==='retreat')assert.equal(x,'retreat');else{assert.equal(op,'resolve');assert.equal(x,args[0]);assert.equal(C.combat(s,d.side,rng[d.side],run.input.difficulty),args[1]);combatChoices++;}
    }
    if(op==='create'){assert(!s);s=E.create(...args);}else E[op](s,...args);
    if(op==='start')assert.deepEqual(copy(s),copy(expected));decisionCommands++;
  }
  assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);
}
for(let i=0;i<data.oldControls.length;i++){
  const bytes=data.oldControls[i];assert.equal(hash(bytes),data.oldControlReferences[i].sha256);assert.equal(data.oldControlReferences[i].index,data.verificationMethod.oldControlIndexes[i]);verifyChoices(JSON.parse(bytes));
}
console.error('完整主批重放与统计通过，开始重算所列整局电脑选择。');
for(const report of data.reports){const longest=report.runs.reduce((a,b)=>a.plies>=b.plies?a:b);verifyChoices(longest);}
const triggers=[];
for(const [key,summary]of Object.entries(data.summary)){
  for(const row of summary.byStyle)if(row.opponents.every(o=>o.points/o.games>.5))triggers.push({type:'allOpponentsAboveHalf',key,style:row.style});
  if(data.supportAudit[key].singleDamageWins)triggers.push({type:'singleDamageWin',key,count:data.supportAudit[key].singleDamageWins});
}
assert.deepEqual(triggers,data.triggers);

const primaryVerification={games,commands},primarySupportRows=supportRows.length,diag=data.diagnostics;
assert(diag.completed&&diag.allNaturalTerminalsAndPieceStatisticsVerified);assert.equal(diag.sourceSHA256,data.sourceSHA256);assert.equal(diag.plan.sourceSHA256,data.sourceSHA256);assert.equal(diag.plan.driverSHA256,data.plan.driverSHA256);assert.equal(diag.plan.upstreamSetupSHA256,data.plan.upstreamSetupSHA256);assert.equal(hash(diag.worker),diag.plan.workerSHA256);assert.equal(hash(diag.methodSource),diag.plan.methodSHA256);assert.deepEqual(JSON.parse(diag.methodSource),diag.method);
assert.equal(diag.method.allOpponentsAboveHalf.replicatesPerOpponent,18);assert.equal(diag.plan.seedLabel,'yiwu-balance-confirm-0.6.136:20261113:current');
const units=[],unitKeys=new Set();
for(const report of data.reports)for(const row of data.supportAudit[report.difficulty+'-'+report.scenario].rows.filter(r=>r.damagePieces===1)){
  const {difficulty,scenario,style,comparator,aVariant,bVariant}=row.input,unit={type:'singleDamage',difficulty,scenario,style,comparator,aVariant,bVariant},key=JSON.stringify(unit);
  if(!unitKeys.has(key)){unitKeys.add(key);units.push(unit);}
}
for(const [key,summary]of Object.entries(data.summary))for(const row of summary.byStyle.filter(r=>r.opponents.every(o=>o.points/o.games>.5))){
  const [difficulty,scenario]=key.split('-');for(const comparator of styles.filter(x=>x!==row.style))units.push({type:'allOpponentsAboveHalf',difficulty,scenario,style:row.style,comparator});
}
assert.deepEqual(diag.plan.units,units);
const confirmSeed=(unit,replicate,role)=>crypto.createHash('sha256').update(diag.plan.seedLabel+':'+JSON.stringify(unit)+':'+replicate+':'+role).digest().readUInt32LE(0),confirmInputs=[];
for(const [index,unit]of units.entries())for(let replicate=0;replicate<18;replicate++)for(const aSide of ['red','black']){
  const {difficulty,scenario,style,comparator}=unit,aVariant=unit.type==='singleDamage'?unit.aVariant:style==='default'?0:replicate%3,bVariant=unit.type==='singleDamage'?unit.bVariant:comparator==='default'?0:Math.floor(replicate/3)%3;
  confirmInputs.push({difficulty,scenario,style,comparator,aVariant,bVariant,replicate,aSide,seedA:confirmSeed(unit,replicate,'A'),seedB:confirmSeed(unit,replicate,'B'),unit:index,group:'confirmation'});
}
assert.deepEqual(diag.plan.inputs,confirmInputs);assert.deepEqual(diag.runs.map(r=>r.input),confirmInputs);
const confirmExcluded=new Set([...data.plan.excludedSeeds,...data.plan.inputs.flatMap(i=>[i.seedA,i.seedB])]),fresh=new Set(confirmInputs.flatMap(i=>[i.seedA,i.seedB]));
assert.deepEqual([...confirmExcluded].sort((a,b)=>a-b),[...diag.plan.excludedSeeds].sort((a,b)=>a-b));assert.equal(fresh.size,units.length*36);assert.deepEqual([...fresh],diag.plan.newSeeds);assert([...fresh].every(x=>!confirmExcluded.has(x)));
for(const run of diag.runs)replay(run);
const confirmSummary=units.map((unit,index)=>{
  const rows=diag.runs.filter(r=>r.input.unit===index),wins=rows.filter(r=>r.winner===r.input.aSide).length,draws=rows.filter(r=>r.winner==='draw').length;assert.equal(rows.length,36);
  const singleDamageRows=rows.filter(r=>r.winner!=='draw').flatMap(r=>{const ps=Object.entries(r.pieceActivity).filter(([,p])=>p.side===r.winner&&p.damage>0);return ps.length===1?[{input:r.input,winner:r.winner,plies:r.plies,id:ps[0][0],piece:ps[0][1]}]:[];});
  return {unit:index,...unit,games:rows.length,wins,draws,losses:rows.length-wins-draws,points:wins+draws*.5,meanPlies:rows.reduce((n,r)=>n+r.plies,0)/rows.length,maxPlies:Math.max(...rows.map(r=>r.plies)),singleDamageWins:singleDamageRows.length,singleDamageRows};
});assert.deepEqual(diag.units,confirmSummary);
const dominance=[];for(const unit of confirmSummary.filter(u=>u.type==='allOpponentsAboveHalf')){
  if(dominance.some(g=>g.difficulty===unit.difficulty&&g.scenario===unit.scenario&&g.style===unit.style))continue;
  const opponents=confirmSummary.filter(u=>u.type==='allOpponentsAboveHalf'&&u.difficulty===unit.difficulty&&u.scenario===unit.scenario&&u.style===unit.style);assert.equal(opponents.length,4);
  dominance.push({difficulty:unit.difficulty,scenario:unit.scenario,style:unit.style,reproducedAcrossAllOpponents:opponents.every(o=>o.points/o.games>.5),opponents:opponents.map(o=>({opponent:o.comparator,points:o.points,games:o.games}))});
}assert.deepEqual(diag.dominance,dominance);assert.equal(games-primaryVerification.games,diag.games);assert.equal(commands-primaryVerification.commands,diag.commands);
const rows=supportRows.slice(primarySupportRows),solo=rows.filter(r=>r.damagePieces===1),initiative=rows.filter(r=>r.attackingPieces===1);
const confirmSupport={wins:rows.length,singleDamageWins:solo.length,singleAttackingWins:initiative.length,singleAttackingRoots:new Set(initiative.map(r=>JSON.stringify([r.input.style,r.input.comparator,r.input.replicate,r.input.seedA,r.input.seedB]))).size,singleAttackingSequences:new Set(initiative.map(r=>r.postSetupSHA256)).size,singleDamageWithOtherSupport:solo.filter(r=>Object.entries(r.roles).some(([id,p])=>id!==r.leader&&p.supportBattles>0)).length,rows};
assert.deepEqual(diag.supportAudit,confirmSupport);
const confirmGroups=[...new Set(diag.runs.map(r=>r.input.difficulty+'-'+r.input.scenario))];
for(const key of confirmGroups){const longest=diag.runs.filter(r=>r.input.difficulty+'-'+r.input.scenario===key).reduce((a,b)=>a.plies>=b.plies?a:b);verifyChoices(longest);}
console.log(JSON.stringify({games:primaryVerification.games,commands:primaryVerification.commands,diagnosticGames:games-primaryVerification.games,diagnosticCommands:commands-primaryVerification.commands,diagnosticSingleDamageWins:solo.length,boardChoices,combatChoices,decisionCommands,decisionGames,allTerminalHashesMatch:true,triggers}));
