const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'long-game-trial-0.6.113.json')));
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../index.html'), 'utf8');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
assert.equal(hash(source), data.sourceSHA256, '请传入报告指定的0.6.113源码文件');
function engine(html) {
  const box = vm.createContext({});
  for (const match of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].slice(0, 2)) vm.runInContext(match[1], box);
  return {E: box.Yiwu, C: box.YiwuComputer};
}
function random(seed) {
  return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
}
function setup(E, s, side, style, variant) {
  if (style === 'default') {E.auto(s, side, true); return;}
  const pieces = s.pieces.filter(p => p.side === side).sort((a, b) => side === 'red' ? a.x - b.x : b.x - a.x);
  const kinds = style === 'defense' ? ['pawn', 'guard', 'elephant', 'horse', 'cannon', 'rook', 'king'] : ['rook', 'horse', 'cannon', 'pawn', 'guard', 'elephant', 'king'];
  let order = pieces.filter(p => p.kind !== 'king').sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  if (style === 'mixed') order = ['rook', 'pawn', 'guard', 'horse', 'cannon', 'elephant'].map(kind => pieces.find(p => p.kind === kind));
  for (const [i, p] of order.entries()) {
    if (!s.budget[side]) break;
    const cards = Object.keys(E.CARDS).filter(id => E.CARDS[id].kind === p.kind);
    for (const index of style === 'spread' ? [(i + variant) % 3] : [[0, 1], [0, 2], [1, 2]][variant]) if (s.budget[side]) E.learn(s, p.id, cards[index]);
  }
}
const references=data.references.map(r=>{const bytes=fs.readFileSync(path.join(__dirname,path.basename(r.path)));assert.equal(hash(bytes),r.sha256);return JSON.parse(bytes);});
const [matrix,counter]=references;
assert.equal(matrix.sourceSHA256,data.sourceSHA256);assert.equal(counter.releaseSHA256,data.sourceSHA256);
const relief=counter.trials[0].runs.find(r=>r.input.group==='known'&&r.input.priorIndex===0&&r.input.models.red==='candidate');
const known=[matrix.legacyControl.run,relief,...matrix.reports.map(r=>r.runs.reduce((a,b)=>a.plies>=b.plies?a:b))];
assert.deepEqual(known.map(r=>r.plies),[166,318,478,622]);
const prior=new Set([...matrix.plan.excludedSeeds,...matrix.plan.inputs.flatMap(i=>[i.seedA,i.seedB])]);assert.equal(prior.size,1764);
function planned(seedLabel){
  const inputs=[],pairs=[['default','default'],['spread','defense'],['attack','spread'],['mixed','defense']];
  const seed=(group,scenario,replicate,side)=>crypto.createHash('sha256').update(`${seedLabel}:${group}:${scenario}:${replicate}:${side}`).digest().readUInt32LE(0);
  for(const [priorIndex,run]of known.entries())for(const model of ['baseline','candidate'])inputs.push({...run.input,group:'known',priorIndex,models:{red:model,black:model}});
  for(const group of ['batch1','batch2'])for(const scenario of ['quick','full'])for(const [replicate,[style,comparator]]of pairs.entries())for(const [red,black]of [['baseline','baseline'],['candidate','baseline'],['baseline','candidate'],['candidate','candidate']])inputs.push({group,scenario,replicate,style,comparator,aVariant:style==='default'?0:replicate%3,bVariant:comparator==='default'?0:replicate%3,aSide:'red',seedA:seed(group,scenario,replicate,'red'),seedB:seed(group,scenario,replicate,'black'),models:{red,black}});
  assert.equal(inputs.length,72);return inputs;
}
function checkFresh(plan,excluded){
  assert.equal(plan.priorSeedsChecked,excluded.size);assert.equal(plan.freshRoots,16);assert.equal(plan.freshSeeds,32);
  const fresh=new Set(plan.inputs.filter(i=>i.group!=='known').flatMap(i=>[i.seedA,i.seedB]));
  assert.equal(fresh.size,32);assert([...fresh].every(seed=>!excluded.has(seed)));
}
function state(E,input){
  const s=E.create(input.scenario);setup(E,s,input.aSide,input.style,input.aVariant);setup(E,s,E.OTHER[input.aSide],input.comparator,input.bVariant);
  assert.equal(s.budget.red,0);assert.equal(s.budget.black,0);assert(s.pieces.every(p=>p.hp===18&&p.learned.length<=2&&!p.exhausted.length));return s;
}
const failed=data.failedAttempt;
assert.equal(failed.plan.seedLabel,'yiwu-enemy-king-mobility-0.6.113:20261112');
assert.deepEqual(failed.plan.inputs,planned(failed.plan.seedLabel));assert.deepEqual(failed.plan.excludedSeeds,[...prior].sort((a,b)=>a-b));checkFresh(failed.plan,prior);
assert.equal(source.split(failed.patch.before).length,2);
const failedSource=source.replace(failed.patch.before,failed.patch.after);assert.equal(hash(failedSource),failed.plan.sourceSHA256.candidate);
assert.deepEqual(failed.reports.map(r=>r.runs.length),[18,0,2,0]);assert.deepEqual(failed.reports.map(r=>r.errors.length),[0,1,1,1]);assert.deepEqual(failed.reports.map(r=>r.completed),[true,false,false,false]);
let failedErrors=0,failedCompleted=0;
for(const report of failed.reports){
  const inputs=failed.plan.inputs.filter((_,i)=>i%4===report.shard);
  assert.deepEqual(report.runs.map(r=>r.input),inputs.slice(0,report.runs.length));
  if(report.errors.length)assert.deepEqual(report.errors[0].input,inputs[report.runs.length]);
  for(const run of report.runs){
    assert.equal(run.input.models.red,'baseline');assert.equal(run.input.models.black,'baseline');
    const {E}=engine(source);let s;
    for(const [op,...args]of run.commands){if(op==='create'){assert(!s);s=E.create(...args);}else E[op](s,...args);}
    assert.equal(s.phase,'ended');assert.equal(s.ply,run.plies);assert.equal(s.winner,run.winner);assert.equal(hash(JSON.stringify(s)),run.terminalSHA256);failedCompleted++;
  }
  for(const error of report.errors){
    const {E,C}=engine(source),bad=engine(failedSource).C,input=error.input,s=state(E,input),rng={[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)};
    const controller=side=>input.models[side]==='candidate'?bad:C;let caught=null,steps=0;E.start(s);
    try{
      while(s.phase!=='ended'&&s.ply<2000&&steps++<14000){
        if(s.phase==='board'){
          const action=controller(s.turn).board(s,rng[s.turn],'standard');
          if(action.type==='pass')E.pass(s);else if(action.type==='rest')E.rest(s,action.id,action.card);else E.move(s,action.id,action.x,action.y);
        }else{
          assert.equal(s.phase,'duel');const a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),id=controller(a.side).combat(s,a.side,rng[a.side],'standard');
          if(id==='retreat')E.retreat(s);else E.resolve(s,id,controller(d.side).combat(s,d.side,rng[d.side],'standard'));
        }
      }
    }catch(e){caught=e;}
    assert(caught);assert.equal(caught.message,error.message);assert.equal(error.message,'当前不能行动');failedErrors++;
  }
}
assert.equal(failedErrors,3);assert.equal(failedCompleted,20);
assert.equal(hash(data.drivers.diagnostic),data.diagnostic.runnerSHA256);assert.equal(data.diagnostic.referenceSHA256,data.references[0].sha256);

{
const marker='return {actions,choices,twoRoundCapturePlan';assert.equal(source.split(marker).length,2);
const {E,C}=engine(source.replace(marker,'return {debug:{position,threatCost,kingMobilityCost,canKingEscape},actions,choices,twoRoundCapturePlan')),copy=v=>JSON.parse(JSON.stringify(v)),reference=matrix;
const audit=matrix.longGameAudit.runs.find(r=>r.input.scenario==='full'),prior=matrix.reports.find(r=>r.scenario==='full').runs.find(r=>r.terminalSHA256===audit.terminalSHA256);
function detail(s, side, repeated = false) {
  if (s.phase === 'ended') return {winner: s.winner, reason: s.reason};
  const king = s.pieces.find(p => p.side === side && p.kind === 'king'), risk = C.debug.threatCost(s, king);
  return {position: C.debug.position(s, side, repeated), king: {x: king.x, y: king.y, hp: king.hp}, kingRisk: risk, kingMobilityCost: C.debug.kingMobilityCost(s, king, risk), nextCertainKingLoss: C.kingLostNext(s, side), attackers: s.pieces.filter(p => p.side !== side && E.canMove(s, p, king.x, king.y)).map(p => ({id: p.id, hp: p.hp, finish: C.battleOutlook(s, E.context(s, p, king)).finishes.length}))};
}
let s; const rows = [];
for (const [index, [op, ...args]] of prior.commands.entries()) {
  const row = audit.rows.find(r => r.index === index && !r.battle && r.attacks.some(a => a.finishes.length && !a.captureLosesKing));
  if (row) {
    const before = JSON.stringify(s), side = s.turn;
    const next = copy(s); E[op](next, ...args);
    const attacks = [];
    for (const action of row.attacks.filter(a => a.finishes.length && !a.captureLosesKing)) {
      const a = E.get(s, action.id), d = E.at(s, action.x, action.y), ctx = E.context(s, a, d), outcomes = [];
      for (const id of action.finishes) for (const reply of C.choices(s, d, ctx)) {
        const result = copy(s); E.move(result, a.id, d.x, d.y); E.resolve(result, id, reply);
        assert(E.get(result, a.id) && !E.get(result, d.id));
        outcomes.push({id, reply, ...detail(result, side)});
      }
      attacks.push({action, outcomes});
    }
    assert.equal(JSON.stringify(s), before);
    rows.push({index, ply: row.ply, before: detail(s, side), original: {action: row.actual, ...detail(next, side)}, attacks});
  }
  if (op === 'create') s = E.create(...args); else E[op](s, ...args);
}
assert.equal(hash(JSON.stringify(s)), prior.terminalSHA256); assert.equal(rows.length, 4);

assert.deepEqual(copy({sourceSHA256:data.sourceSHA256,rows}),data.scores);
}
const totals = {games: 0, commands: 0, boardChoices: 0, combatChoices: 0};
for (const trial of data.trials) {
  const {offset, removed, inserted} = trial.patch;
  assert.equal(source.slice(offset, offset + removed.length), removed);
  const candidate = source.slice(0, offset) + inserted + source.slice(offset + removed.length);
  assert.equal(hash(candidate), trial.plan.sourceSHA256.candidate);
  const models = {baseline: engine(source), candidate: engine(candidate)}, {E} = models.baseline;
  const remaining = new Set(trial.plan.inputs.map(input => JSON.stringify(input)));
  assert.deepEqual(trial.plan.inputs, planned(trial.plan.seedLabel));
  assert.equal(trial.plan.seedLabel,'yiwu-enemy-king-mobility-board-0.6.113:20261112');
  assert.equal(trial.plan.sourceSHA256.baseline,data.sourceSHA256);
  const scripts=html=>[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.equal(scripts(source)[0],scripts(candidate)[0]);assert.equal(scripts(source)[2],scripts(candidate)[2]);
  assert.equal(source.match(/<style>([\s\S]*?)<\/style>/)[1],candidate.match(/<style>([\s\S]*?)<\/style>/)[1]);
  assert.deepEqual(trial.plan.acceptance,{eachModeDirectScoreAtLeastHalf:true,eachModeSelfPlayMeanNotLonger:true,eachModeSelfPlayMaximumNotLonger:true,independentFollowupRequiredBeforeAdoption:true});
  const excluded=new Set([...prior,...data.failedAttempt.plan.inputs.filter(i=>i.group!=='known').flatMap(i=>[i.seedA,i.seedB])]);
  assert.equal(excluded.size,1796);assert.deepEqual([...excluded].sort((a,b)=>a-b),trial.plan.excludedSeeds);
  checkFresh(trial.plan,excluded);
  assert.equal(hash(data.drivers.trial),trial.plan.driverSHA256);
  const counts = {...totals};
  for (const run of trial.runs) {
    const {input} = run; assert(remaining.delete(JSON.stringify(input)), '重复或未计划的起点');
    if(input.group==='known'&&input.models.red==='baseline'){
      const previous=known[input.priorIndex];assert.deepEqual(run.commands,previous.commands);assert.equal(run.terminalSHA256,previous.terminalSHA256);assert.deepEqual(run.pieceActivity,previous.pieceActivity);
    }
    const expected = E.create(input.scenario);
    setup(E, expected, input.aSide, input.style, input.aVariant);
    setup(E, expected, E.OTHER[input.aSide], input.comparator, input.bVariant);
    assert.equal(expected.budget.red, 0); assert.equal(expected.budget.black, 0);
    assert(expected.pieces.every(p => p.hp === 18 && p.learned.length <= 2)); E.start(expected);
    const rng = {[input.aSide]: random(input.seedA), [E.OTHER[input.aSide]]: random(input.seedB)};
    const controller = side => models[input.models[side]].C;
    const stats = {moves: 0, rests: 0, passes: 0, battles: 0, rounds: 0, retreats: 0, reversals: 0}, last = new Map();
    let s, activity;
    for (const [op, ...args] of run.commands) {
      totals.commands++;
      if (op === 'create') {assert(!s); s = E.create(...args); continue;}
      if (op === 'start') activity = Object.fromEntries(s.pieces.map(p => [p.id, {side: p.side, kind: p.kind, cards: Array.from(p.learned), moves: 0, rests: 0, attacks: 0, defenses: 0, damage: 0, captures: 0, cardUses: 0}]));
      if (['pass', 'rest', 'move'].includes(op)) {
        assert.equal(s.phase, 'board'); const before = JSON.stringify(s);
        const action = controller(s.turn).board(s, rng[s.turn], 'standard'); totals.boardChoices++;
        assert.equal(JSON.stringify(s), before);
        assert.deepEqual([action.type, ...(action.type === 'move' ? [action.id, action.x, action.y] : action.type === 'rest' ? [action.id, action.card] : [])], [op, ...args]);
        if (op === 'pass') stats.passes++;
        else if (op === 'rest') {stats.rests++; activity[args[0]].rests++;}
        else {
          const p = E.get(s, args[0]), target = E.at(s, args[1], args[2]);
          if (target) {stats.battles++; activity[p.id].attacks++; activity[target.id].defenses++; last.delete(p.id);}
          else {stats.moves++; activity[p.id].moves++; const prior = last.get(p.id); if (prior && prior[0] === args[1] && prior[1] === args[2]) stats.reversals++; last.set(p.id, [p.x, p.y]);}
        }
      }
      if (op === 'retreat' || op === 'resolve') {
        assert.equal(s.phase, 'duel'); const before = JSON.stringify(s);
        const a = E.get(s, s.duel.a), d = E.get(s, s.duel.d), aId = controller(a.side).combat(s, a.side, rng[a.side], 'standard'); totals.combatChoices++;
        if (op === 'retreat') {assert.equal(aId, 'retreat'); stats.retreats++;}
        else {
          const dId = controller(d.side).combat(s, d.side, rng[d.side], 'standard'); totals.combatChoices++;
          assert.deepEqual([aId, dId], args); stats.rounds++; const r = E.roundDamage(s.duel, ...args);
          activity[a.id].damage += Math.min(d.hp, r.toD); activity[d.id].damage += Math.min(a.hp, r.toA);
          if (r.toD >= d.hp) activity[a.id].captures++; if (r.toA >= a.hp) activity[d.id].captures++;
          if (E.CARDS[aId]) activity[a.id].cardUses++; if (E.CARDS[dId]) activity[d.id].cardUses++;
        }
        assert.equal(JSON.stringify(s), before);
      }
      E[op](s, ...args);
      if (op === 'start') assert.equal(JSON.stringify(s), JSON.stringify(expected));
    }
    assert.equal(s.phase, 'ended'); assert.equal(s.ply, run.plies); assert.equal(s.winner, run.winner); assert.equal(s.reason, run.reason);
    assert.equal(hash(JSON.stringify(s)), run.terminalSHA256); assert.deepEqual(activity, run.pieceActivity);
    for (const [key, value] of Object.entries(stats)) assert.equal(value, run[key]); totals.games++;
    if (totals.games % 12 === 0) console.log(JSON.stringify(totals));
  }
  assert.equal(remaining.size, 0);
  for (const key of Object.keys(totals)) assert.equal(totals[key] - counts[key], trial.verification[key]);
  for (const mode of ['quick', 'full']) {
    const rows = trial.runs.filter(r => r.input.group !== 'known' && r.input.scenario === mode), summary = trial.summary.summary[mode];
    const direct = rows.filter(r => r.input.models.red !== r.input.models.black);
    const points = direct.map(r => r.winner === 'draw' ? .5 : r.input.models[r.winner] === 'candidate' ? 1 : 0);
    assert.deepEqual(summary.direct, {games: points.length, wins: points.filter(n => n === 1).length, draws: points.filter(n => n === .5).length, losses: points.filter(n => n === 0).length, points: points.reduce((a, b) => a + b, 0)});
    for (const model of ['baseline', 'candidate']) {
      const self = rows.filter(r => r.input.models.red === model && r.input.models.black === model), plies = self.map(r => r.plies).sort((a, b) => a - b), total = plies.reduce((a, b) => a + b, 0);
      assert.deepEqual(summary[model + 'Self'], {games: self.length, totalPlies: total, meanPlies: total / self.length, medianPlies: (plies[(plies.length - 1) >> 1] + plies[plies.length >> 1]) / 2, maxPlies: plies.at(-1), draws: self.filter(r => r.winner === 'draw').length, over200: plies.filter(p => p > 200).length, singleDamageWins: self.filter(r => r.winner !== 'draw' && Object.values(r.pieceActivity).filter(p => p.side === r.winner && p.damage > 0).length === 1).length});
    }
  }
  const gates=Object.fromEntries(Object.entries(trial.summary.summary).map(([mode,s])=>[mode,{direct:s.direct.points>=s.direct.games/2,mean:s.candidateSelf.meanPlies<=s.baselineSelf.meanPlies,maximum:s.candidateSelf.maxPlies<=s.baselineSelf.maxPlies}]));
  assert.deepEqual(gates,trial.summary.gates);assert.equal(trial.summary.passesScreen,Object.values(gates).every(g=>Object.values(g).every(Boolean)));assert.equal(trial.adopted,false);assert.equal(trial.summary.passesScreen,false);
  assert.deepEqual(trial.summary.known,trial.runs.filter(r=>r.input.group==='known').map(r=>({case:r.input.priorIndex,scenario:r.input.scenario,model:r.input.models.red,plies:r.plies,winner:r.winner})));
  for(const [mode,summary] of Object.entries(trial.summary.summary))for(const pair of summary.paired){
    for(const model of ['baseline','candidate']){const run=trial.runs.find(r=>r.input.group===pair.group&&r.input.replicate===pair.replicate&&r.input.scenario===mode&&r.input.models.red===model&&r.input.models.black===model);assert.equal(run.plies,pair[model+'Plies']);assert.equal(run.winner,pair[model+'Winner']);}
  }
}
assert.equal(totals.games, 72);

const diagnostic=data.diagnostic,control=matrix.reports.find(r=>r.scenario==='full').runs.find(r=>r.terminalSHA256===matrix.longGameAudit.runs.find(r=>r.input.scenario==='full').terminalSHA256);
assert(diagnostic.completed);assert.deepEqual(diagnostic.errors,[]);assert.equal(diagnostic.sourceSHA256,data.sourceSHA256);assert.deepEqual(diagnostic.runs.map(r=>r.input),diagnostic.inputs);
const expectedInputs=[{...control.input,models:{red:'baseline',black:'baseline'}}];
for(const row of matrix.longGameAudit.runs.find(r=>r.input.scenario==='full').rows)for(const a of row.attacks)if(!row.battle&&a.finishes.length&&!a.captureLosesKing)expectedInputs.push({...control.input,models:{red:'baseline',black:'baseline'},force:{ply:row.ply,expected:row.actual,action:{type:'move',id:a.id,x:a.x,y:a.y}},expectedIndex:row.index});
assert.deepEqual(diagnostic.inputs,expectedInputs);
const diagnosticTotals={games:0,commands:0,boardChoices:0,combatChoices:0,overrides:0};
for(const run of diagnostic.runs){
  const {E,C}=engine(source),input=run.input,rng={[input.aSide]:random(input.seedA),[E.OTHER[input.aSide]]:random(input.seedB)},expected=state(E,input);E.start(expected);
  const activity={},stats={moves:0,rests:0,passes:0,battles:0,rounds:0,retreats:0,reversals:0},last=new Map();let s,overrides=0;
  for(const [index,command]of run.commands.entries()){
    const [op,...args]=command;diagnosticTotals.commands++;
    if(op==='create'){assert(!s);s=E.create(...args);continue;}
    if(op==='start')for(const p of s.pieces)activity[p.id]={side:p.side,kind:p.kind,cards:Array.from(p.learned),moves:0,rests:0,attacks:0,defenses:0,damage:0,captures:0,cardUses:0};
    if(['move','rest','pass'].includes(op)){
      assert.equal(s.phase,'board');const before=JSON.stringify(s);let action=C.board(s,rng[s.turn],'standard');diagnosticTotals.boardChoices++;
      assert.equal(JSON.stringify(s),before);
      if(input.force&&s.ply+1===input.force.ply){
        assert.equal(index,input.expectedIndex);assert.deepEqual(JSON.parse(JSON.stringify(action)),input.force.expected);action=input.force.action;overrides++;
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
      assert.equal(s.phase,'duel');const before=JSON.stringify(s),a=E.get(s,s.duel.a),d=E.get(s,s.duel.d),id=C.combat(s,a.side,rng[a.side],'standard');diagnosticTotals.combatChoices++;
      if(op==='retreat'){assert.equal(id,'retreat');stats.retreats++;}
      else{
        const other=C.combat(s,d.side,rng[d.side],'standard');diagnosticTotals.combatChoices++;assert.deepEqual([id,other],args);stats.rounds++;
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
    const index=input.expectedIndex;assert.equal(run.firstDifferenceCommandIndex,index);assert.deepEqual(run.commands.slice(0,index),control.commands.slice(0,index));assert.notDeepEqual(run.commands[index],control.commands[index]);
  }else{assert.deepEqual(run.commands,control.commands);assert.equal(run.terminalSHA256,control.terminalSHA256);}
  diagnosticTotals.games++;diagnosticTotals.overrides+=overrides;console.log(JSON.stringify({games:diagnosticTotals.games,commands:diagnosticTotals.commands}));
}
assert.equal(diagnosticTotals.games,9);assert.equal(diagnosticTotals.overrides,8);

for(const [key,value]of Object.entries(diagnosticTotals))assert.equal(value,data.diagnosticVerification[key]);
console.log(JSON.stringify({...totals,diagnostic:diagnosticTotals,failedAttemptErrorsReproduced:failedErrors,failedAttemptCompletedRunsReplayed:failedCompleted,allChoicesRecomputed:true,allTerminalHashesMatch:true,allPieceActivityMatches:true}));
