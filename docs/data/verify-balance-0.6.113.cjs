const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const source = process.argv[2] || path.resolve(__dirname, '../../index.html');
const file = path.join(__dirname, 'balance-0.6.113.json'), data = JSON.parse(fs.readFileSync(file));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(hash(fs.readFileSync(source)), data.sourceSHA256, '请传入报告指定的0.6.113源码');
assert.equal(hash(data.drivers.runner), data.plan.runnerSHA256);
assert.equal(hash(data.drivers.worker), data.plan.workerSHA256);
assert.equal(hash(data.drivers.shared), data.plan.sharedDriverSHA256);
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

const label='yiwu-balance-matrix-0.6.113:20261112',styles=['default','spread','attack','defense','mixed'];
const seed=(scenario,style,comparator,replicate,role)=>crypto.createHash('sha256').update(`${label}:${scenario}:${style}:${comparator}:${replicate}:${role}`).digest().readUInt32LE(0);
function random(value){return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
function inputs(scenario){
  const result=[];
  for(let i=0;i<styles.length;i++)for(let j=i+1;j<styles.length;j++){
    const style=styles[i],comparator=styles[j];
    for(let aVariant=0;aVariant<(style==='default'?1:3);aVariant++)for(let bVariant=0;bVariant<3;bVariant++)
      for(let replicate=0;replicate<2;replicate++)for(const aSide of ['red','black'])
        result.push({scenario,style,comparator,aVariant,bVariant,replicate,aSide,seedA:seed(scenario,style,comparator,replicate,'A'),seedB:seed(scenario,style,comparator,replicate,'B')});
  }
  for(let replicate=0;replicate<2;replicate++)for(const assignment of ['normal','swapped']){
    const a=seed(scenario,'default','default',replicate,'A'),b=seed(scenario,'default','default',replicate,'B');
    result.push({scenario,style:'default',comparator:'default',aVariant:0,bVariant:0,replicate,aSide:'red',assignment,seedA:assignment==='normal'?a:b,seedB:assignment==='normal'?b:a});
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
assert.deepEqual(data.plan.inputs, [...inputs("quick"), ...inputs("full")]);
let games=0,commands=0;const paceRows=[];
for(const report of data.reports){
  assert(report.completed&&!report.errors.length);assert.equal(report.runs.length,268);assert.deepEqual(report.runs.map(r=>r.input),data.plan.inputs.filter(r=>r.scenario===report.scenario));
  assert.deepEqual(report.allocations,allocations(E,report.scenario));
  for(const run of report.runs){
    let s,activity,firstBattle=null,lastDamage=null,maxQuiet=0,reversals=0;const lastMoves=new Map(),damageActions=new Set(),expected=state(E,run.input);E.start(expected);
    for(const [op,...args]of run.commands){
      if(op==='create'){assert(!s);s=E.create(...args);commands++;continue;}
      if(op==='start'){
        assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);assert(s.pieces.every(p=>p.hp===18&&p.learned.length<=2&&!p.exhausted.length));
        activity=Object.fromEntries(Array.from(s.pieces,p=>[p.id,{side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0}]));
      }
      if(op==='move'){const p=E.get(s,args[0]),target=E.at(s,args[1],args[2]);if(target){firstBattle??=s.ply+1;activity[args[0]].attacks++;activity[target.id].defenses++;lastMoves.delete(p.id);}else{activity[args[0]].moves++;const last=lastMoves.get(p.id);if(last&&last[0]===args[1]&&last[1]===args[2])reversals++;lastMoves.set(p.id,[p.x,p.y]);}}
      if(op==='rest')activity[args[0]].rests++;
      if(op==='resolve'){
        const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args);
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
    paceRows.push({input:run.input,plies:run.plies,winner:run.winner,reason:run.reason,battles:run.battles,reversals:run.reversals,firstBattle,lastDamage,damageActions:damageActions.size,totalDamage:Object.values(activity).reduce((n,p)=>n+p.damage,0),trailingQuiet:s.quiet,maxQuiet,remainingPieces:s.pieces.length,remainingKings:Array.from(s.pieces.filter(p=>p.kind==='king'),p=>({side:p.side,hp:p.hp})),terminalSHA256:run.terminalSHA256});
  }
  const matrix=report.runs.filter(r=>r.input.style!==r.input.comparator),summary=data.summary[report.scenario];
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
  const audit=data.soloAudit[report.scenario];assert.equal(audit.cases.length,report.runs.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.damage>0).length===1).length);
  for(const entry of audit.cases){
    const run=report.runs.find(r=>JSON.stringify(r.input)===JSON.stringify(entry.input));assert(run);assert.equal(run.terminalSHA256,entry.terminalSHA256);
    assert.equal(entry.postSetupSHA256,hash(JSON.stringify(run.commands.slice(run.commands.findIndex(c=>c[0]==='start')+1))));
    const roles=Object.fromEntries(Object.entries(run.pieceActivity).filter(([,p])=>p.side===run.winner).map(([id,p])=>[id,{...p,supportBattles:0,friendlyScreenBattles:0,damageTaken:0}]));let s;const battles=[];
    for(const [op,...args]of run.commands){
      if(op==='create'){s=E.create(...args);continue;}
      if(op==='move'&&E.at(s,args[1],args[2])){
        const a=E.get(s,args[0]),d=E.at(s,args[1],args[2]),ctx=E.context(s,a,d),isA=a.side===run.winner;
        const support=Array.from(isA?ctx.supportA:ctx.supportD),screen=ctx.screen&&E.get(s,ctx.screen)?.side===run.winner&&isA?ctx.screen:null;
        for(const id of support)roles[id].supportBattles++;if(screen)roles[screen].friendlyScreenBattles++;battles.push({ply:s.ply+1,a:a.id,d:d.id,support,screen});
      }
      if(op==='resolve'){const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),r=E.roundDamage(s.duel,...args);for(const [p,loss]of [[a,r.toA],[d,r.toD]])if(roles[p.id])roles[p.id].damageTaken+=Math.min(p.hp,loss);}
      E[op](s,...args);
    }
    assert.deepEqual(roles,entry.roles);assert.deepEqual(battles,entry.battles);assert.deepEqual(entry.leaderActivity,roles[entry.leader]);assert.equal(entry.leaderActivity.damage,Object.values(roles).reduce((n,p)=>n+p.damage,0));
    for(const [list,field]of [['supporters','supportBattles'],['screens','friendlyScreenBattles'],['damaged','damageTaken']])assert.deepEqual(entry[list],Object.entries(roles).filter(([id,p])=>id!==entry.leader&&p[field]>0).map(([id])=>id));
  }
  const expectedAudit={singleDamageWins:audit.cases.length,matrixCases:audit.cases.filter(c=>c.input.style!==c.input.comparator).length,controlCases:audit.cases.filter(c=>c.input.style===c.input.comparator).length,leaderUsedNoCards:audit.cases.filter(c=>!c.leaderActivity.cardUses).length,leaderUntrained:audit.cases.filter(c=>!c.leaderActivity.cards.length).length,withOtherSupporters:audit.cases.filter(c=>c.supporters.length).length,withOtherFriendlyScreens:audit.cases.filter(c=>c.screens.length).length,withOtherDamagedPieces:audit.cases.filter(c=>c.damaged.length).length,uniquePostSetupSequences:new Set(audit.cases.map(c=>c.postSetupSHA256)).size};
  assert.deepEqual(audit.summary,expectedAudit);
}
assert.equal(games,536);assert.equal(commands,data.verification.commands);
assert.deepEqual(paceRows,data.paceAudit.rows);assert.equal(data.paceAudit.sourceSHA256,data.sourceSHA256);
for(const scenario of ['quick','full']){
  const rows=paceRows.filter(r=>r.input.scenario===scenario&&r.input.style!==r.input.comparator),long=rows.filter(r=>r.plies>200),quiet=rows.filter(r=>r.winner==='draw'&&r.reason==='连续 80 次行动未造成伤害'),sorted=[...rows].sort((a,b)=>a.plies-b.plies);
  const expected={matrixGames:rows.length,zeroBattleGames:rows.filter(r=>!r.battles).length,noDamageGames:rows.filter(r=>!r.totalDamage).length,medianPlies:sorted[Math.ceil(rows.length*.5)-1].plies,p90Plies:sorted[Math.ceil(rows.length*.9)-1].plies,over200:long.length,over200Draws:long.filter(r=>r.winner==='draw').length,quietDraws:quiet.length,quietDrawsAfterDamage:quiet.filter(r=>r.totalDamage>0).length,meanQuietDrawRemainingPieces:quiet.length?quiet.reduce((n,r)=>n+r.remainingPieces,0)/quiet.length:null,longest:rows.reduce((a,b)=>a.plies>=b.plies?a:b)};
  assert.deepEqual(data.paceAudit.summary[scenario],expected);
}
const oldSeeds = new Set(data.plan.excludedSeeds);
assert.equal(oldSeeds.size, data.plan.priorSeedsChecked);
assert(data.plan.inputs.every(row => !oldSeeds.has(row.seedA) && !oldSeeds.has(row.seedB)));
assert.equal(new Set(data.plan.inputs.flatMap(row => [row.seedA, row.seedB])).size, 88);
assert.equal(data.plan.priorSeedData.length,1);
const reference=data.plan.priorSeedData[0],referenceBytes=fs.readFileSync(path.join(__dirname,path.basename(reference.path)));
assert.equal(hash(referenceBytes),reference.sha256);
const referenceData=JSON.parse(referenceBytes),prior=referenceData.trials[0].plan,excluded=new Set([...prior.excludedSeeds,...prior.inputs.flatMap(i=>[i.seedA,i.seedB])]);
assert.deepEqual([...excluded].sort((a,b)=>a-b),data.plan.excludedSeeds);assert.equal(excluded.size,1676);
assert.equal(data.legacyControl.referenceSHA256,reference.sha256);
const previousControl=referenceData.trials[0].runs.find(r=>r.input.group==='known'&&r.input.priorIndex===1&&r.input.models.red==='candidate');
for(const [key,value]of Object.entries(data.legacyControl.run))assert.deepEqual(value,previousControl[key]);

const colorRoots=data.colorRoots;
for(const report of data.reports){
  const matrix=report.runs.filter(r=>r.input.style!==r.input.comparator),groups=new Map();
  for(const run of matrix){const {style,comparator,replicate,seedA,seedB}=run.input,key=JSON.stringify([style,comparator,replicate,seedA,seedB]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(run);}
  const count=rows=>Object.fromEntries(['red','black','draw'].map(winner=>[winner,rows.filter(r=>r.winner===winner).length]));
  const values=[...groups.values()].map(rows=>{const {style,comparator,replicate}=rows[0].input,tally=count(rows);return {style,comparator,replicate,games:rows.length,...tally,redRate:(tally.red+tally.draw*.5)/rows.length};});
  assert.equal(values.length,20);
  assert.deepEqual(colorRoots[report.scenario],{groups:values.length,redAboveHalf:values.filter(v=>v.redRate>.5).length,redBelowHalf:values.filter(v=>v.redRate<.5).length,equal:values.filter(v=>v.redRate===.5).length,equalRootRedRate:values.reduce((n,v)=>n+v.redRate,0)/values.length,byReplicate:[0,1].map(replicate=>{const rows=matrix.filter(r=>r.input.replicate===replicate);return {replicate,games:rows.length,...count(rows)};}),values});
}
const initiativeAudit=Object.fromEntries(data.reports.map(report=>{
  const rows=report.runs.filter(r=>r.winner!=='draw'&&Object.values(r.pieceActivity).filter(p=>p.side===r.winner&&p.attacks>0).length===1);
  const cases=rows.map(r=>{
    const pieces=Object.entries(r.pieceActivity).filter(([,p])=>p.side===r.winner),[leader,p]=pieces.find(([,p])=>p.attacks>0);
    return {input:r.input,leader,damagePieces:pieces.filter(([,p])=>p.damage>0).length,leaderDamage:p.damage,counterDamage:pieces.filter(([id])=>id!==leader).reduce((n,[,p])=>n+p.damage,0),postSetupSHA256:hash(JSON.stringify(r.commands.slice(r.commands.findIndex(c=>c[0]==='start')+1)))};
  });
  return [report.scenario,{games:cases.length,uniquePostSetupSequences:new Set(cases.map(r=>r.postSetupSHA256)).size,uniqueRoots:new Set(cases.map(r=>JSON.stringify([r.input.style,r.input.comparator,r.input.replicate,r.input.seedA,r.input.seedB]))).size,cases}];
}));
const verifiedLongRuns = [];
const same = (action, command) => action.type === command[0] && action.id === command[1] && (action.type === 'rest' ? action.card === command[2] : action.x === command[2] && action.y === command[3]);
for (const report of [...data.reports,...data.longControlAudit.reports]) {
  const scenario = report.scenario, game = report.runs.filter(run => run.input.style !== run.input.comparator).reduce((a, b) => a.plies >= b.plies ? a : b);
  let s;
  const rows = [];
  for (const [index, command] of game.commands.entries()) {
    const [op, ...args] = command;
    if (s?.phase === 'board' && s.quiet >= 20) {
      const before = JSON.stringify(s), ranked = C.rankedActions(s), actual = ranked.find(action => same(action, command));
      assert(actual);
      const attacks = ranked.filter(action => action.type === 'move' && E.at(s, action.x, action.y)).map(action => {
        const a = E.get(s, action.id), d = E.at(s, action.x, action.y), ctx = E.context(s, a, d), outlook = C.battleOutlook(s, ctx);
        const next = JSON.parse(before);
        E.move(next, a.id, d.x, d.y);
        return {...action, kind: a.kind, hp: a.hp, target: {id: d.id, kind: d.kind, hp: d.hp}, finishes: Array.from(outlook.finishes), counters: Array.from(outlook.counters), captureLosesKing: C.captureLosesKing(s, ctx, outlook.finishes), twoRoundCaptures: copy(C.twoRoundCapturePlan(next))};
      });
      assert.equal(JSON.stringify(s), before);
      rows.push({index, ply: s.ply + 1, side: s.turn, quiet: s.quiet, actual: copy(actual), top: copy(ranked.slice(0, 3)), attacks, battle: op === 'move' && !!E.at(s, args[1], args[2])});
    }
    if (op === 'create') s = E.create(...args); else E[op](s, ...args);
  }
  assert.equal(s.phase, 'ended');
  assert.equal(hash(JSON.stringify(s)), game.terminalSHA256);
  const summary = {states: rows.length, noAttacks: rows.filter(row => !row.attacks.length).length, skippedPositiveAttacks: rows.filter(row => !row.battle && row.attacks.some(a => a.score > 0)).length, skippedFirstRoundCapturesWithoutCertainKingLoss: rows.filter(row => !row.battle && row.attacks.some(a => a.finishes.length && !a.captureLosesKing)).length, skippedTwoRoundCaptures: rows.filter(row => !row.battle && row.attacks.some(a => a.twoRoundCaptures.length)).length};
  verifiedLongRuns.push({input: game.input, plies: game.plies, winner: game.winner, reason: game.reason, terminalSHA256: game.terminalSHA256, remaining: copy(s.pieces), summary, rows});
}
assert.deepEqual(copy(verifiedLongRuns), [...data.longGameAudit.runs,...data.longControlAudit.audit.runs]);
assert.deepEqual(initiativeAudit, data.initiativeAudit);
const decisionVerification = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
for (const run of [...data.reports.map(report => report.runs.filter(row => row.input.style !== row.input.comparator).reduce((a, b) => a.plies >= b.plies ? a : b)), data.legacyControl.run]) {
  const input = run.input, other = E.OTHER[input.aSide], rng = {[input.aSide]: random(input.seedA), [other]: random(input.seedB)};
  let state, started = false;
  for (const [op, ...args] of run.commands) {
    if (started) {
      const before = JSON.stringify(state); let expected;
      if (state.phase === 'board') {
        const action = C.board(state, rng[state.turn], 'standard');
        expected = action.type === 'pass' ? ['pass'] : action.type === 'rest' ? ['rest', action.id, action.card] : ['move', action.id, action.x, action.y];
        decisionVerification.boardChoices++;
      } else {
        assert.equal(state.phase, 'duel');
        const a = E.get(state, state.duel.a), d = E.get(state, state.duel.d), id = C.combat(state, a.side, rng[a.side], 'standard');
        expected = id === 'retreat' ? ['retreat'] : ['resolve', id, C.combat(state, d.side, rng[d.side], 'standard')];
        decisionVerification.combatChoices += id === 'retreat' ? 1 : 2;
      }
      assert.deepEqual(expected, [op, ...args]); assert.equal(JSON.stringify(state), before);
    }
    if (op === 'create') state = E.create(...args); else E[op](state, ...args);
    if (op === 'start') started = true;
    decisionVerification.commands++;
  }
  assert.equal(state.phase, 'ended'); assert.equal(state.winner, run.winner); assert.equal(state.ply, run.plies); assert.equal(hash(JSON.stringify(state)), run.terminalSHA256);
  decisionVerification.games++;
}
const forceData=data.forced,forceControl=data.longControlAudit.reports.find(r=>r.scenario==='full').runs[0];
assert(forceData.completed);assert.equal(forceData.sourceSHA256,data.sourceSHA256);
const forcedTotals={games:0,commands:0,boardChoices:0,combatChoices:0,overrides:0};
for(const run of forceData.runs){
  const {E,C}=engine(source),input=run.input,rng={[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)},expected=state(E,input);E.start(expected);
  const activity={},stats={moves:0,rests:0,passes:0,battles:0,rounds:0,retreats:0,reversals:0},last=new Map();let s,overrides=0;
  for(const [index,command]of run.commands.entries()){
    const [op,...args]=command;forcedTotals.commands++;
    if(op==='create'){assert(!s);s=E.create(...args);continue;}
    if(op==='start')for(const p of s.pieces)activity[p.id]={side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0};
    if(['move','rest','pass'].includes(op)){
      assert.equal(s.phase,'board');const before=JSON.stringify(s);let action=C.board(s,rng[s.turn],'standard');forcedTotals.boardChoices++;
      assert.equal(JSON.stringify(s),before);
      if(input.force&&s.ply+1===input.force.ply){
        assert.equal(index,input.force.ply===203?308:310);assert.deepEqual(JSON.parse(JSON.stringify(action)),input.force.expected);action=input.force.action;overrides++;
      }
      assert.deepEqual([action.type,...(action.type==='move'?[action.id,action.x,action.y]:action.type==='rest'?[action.id,action.card]:[])],command);
      if(op==='pass')stats.passes++;
      else if(op==='rest'){stats.rests++;activity[args[0]].rests++;}
      else{
        const p=E.get(s,args[0]),d=E.at(s,args[1],args[2]);
        if(d){stats.battles++;activity[p.id].attacks++;activity[d.id].defenses++;last.delete(p.id);}
        else{stats.moves++;activity[p.id].moves++;const previous=last.get(p.id);if(previous&&previous[0]===args[1]&&previous[1]===args[2])stats.reversals++;last.set(p.id,[p.x,p.y]);}
      }
    }
    if(op==='resolve'||op==='retreat'){
      assert.equal(s.phase,'duel');const before=JSON.stringify(s),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),id=C.combat(s,a.side,rng[a.side],'standard');forcedTotals.combatChoices++;
      if(op==='retreat'){assert.equal(id,'retreat');stats.retreats++;}
      else{
        const other=C.combat(s,d.side,rng[d.side],'standard');forcedTotals.combatChoices++;assert.deepEqual([id,other],args);stats.rounds++;
        const r=E.roundDamage(s.duel,...args);activity[a.id].damage+=Math.min(d.hp,r.toD);activity[d.id].damage+=Math.min(a.hp,r.toA);
        if(r.toD>=d.hp)activity[a.id].captures++;if(r.toA>=a.hp)activity[d.id].captures++;
        if(E.CARDS[id])activity[a.id].cardUses++;if(E.CARDS[other])activity[d.id].cardUses++;
      }
      assert.equal(JSON.stringify(s),before);
    }
    E[op](s,...args);if(op==='start')assert.equal(JSON.stringify(s),JSON.stringify(expected));
  }
  assert.equal(overrides,input.force?1:0);assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(s.winner,run.winner);assert.equal(s.reason,run.reason);
  assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);assert.deepEqual(activity,run.pieceActivity);for(const [key,value]of Object.entries(stats))assert.equal(value,run[key]);
  if(input.force){
    const index=input.force.ply===203?308:310;assert.equal(run.firstDifferenceCommandIndex,index);assert.deepEqual(run.commands.slice(0,index),forceControl.commands.slice(0,index));assert.notDeepEqual(run.commands[index],forceControl.commands[index]);
  }else{assert.deepEqual(run.commands,forceControl.commands);assert.equal(run.terminalSHA256,forceControl.terminalSHA256);}
  forcedTotals.games++;forcedTotals.overrides+=overrides;console.log(JSON.stringify({games:forcedTotals.games,commands:forcedTotals.commands}));
}
assert.equal(forcedTotals.games,4);assert.equal(forcedTotals.overrides,3);

for(const [key,value]of Object.entries(forcedTotals))assert.equal(value,data.forcedVerification[key]);
assert.equal(hash(fs.readFileSync(source)), data.sourceSHA256);
console.log(JSON.stringify({version: data.version, dataSHA256: hash(fs.readFileSync(file)), sourceSHA256: data.sourceSHA256, games, commands, distinctSeeds: 88, priorSeedsChecked: oldSeeds.size, sourceHashVerified: true, planVerified: true, statisticsVerified: true, colorRootStatisticsVerified: true, soloParticipationVerified: true, paceVerified: true, initiativeAudit, decisionVerification, forcedDecisionVerification:forcedTotals}));
