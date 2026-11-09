const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const options = [...html.match(/<select id="scenario"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m => ({value: m[1], textContent: m[2]}));
function storage() {
  const data = new Map();
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value))};
}
function page(saved = storage()) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      dataset: {}, value: id === 'opponent' ? 'computer' : id === 'difficulty' ? 'standard' : 'quick', options,
      innerHTML: '', textContent: '', children: [], handlers: {}, open: false,
      addEventListener(type, fn) {this.handlers[type] = fn;}, contains() {return false;}, querySelector() {return null;},
      showModal() {this.open = true;}, close() {this.open = false; this.handlers.close?.();}, focus() {document.activeElement = this;}
    });
    return nodes.get(id);
  };
  const document = {getElementById: node, querySelector: node, activeElement: null, handlers: {}, addEventListener(type, fn) {this.handlers[type] = fn;}};
  const timers = new Map(); let timerId = 0;
  const box = vm.createContext({document, localStorage: saved, navigator: {locks: {request(name, fn) {fn(); return Promise.resolve();}}},
    scrollTo() {}, requestAnimationFrame: fn => fn(), setTimeout(fn) {timers.set(++timerId, fn); return timerId;}, clearTimeout(id) {timers.delete(id);}});
  vm.runInContext(scripts[0], box); vm.runInContext(scripts[1], box);
  const startup = "  showScreen('home');\n})();";
  assert(scripts[2].includes(startup));
  vm.runInContext(scripts[2].replace(startup, "globalThis.ui={init,nextChallenge,beginFight,challengeCombatHTML,actionOutcomeRisk,requestRest,get state(){return s;},get fight(){return fightUI;},get screen(){return screen;},get difficulty(){return difficulty;}};\n" + startup), box);
  return {ui: box.ui, E: box.Yiwu, node, saved, timerCount: () => timers.size,
    computerMove: action => {box.YiwuComputer.board = () => action; assert(timers.size); const [id, fn] = timers.entries().next().value; timers.delete(id); fn();},
    cell: (x, y) => node('grid').handlers.click({target: {closest: () => ({dataset: {x, y}})}}),
    pick: choice => node('fight-content').handlers.click({target: {closest: () => ({dataset: {choice}, disabled: false})}}),
    fight: fight => node('fight-content').handlers.click({target: {closest: () => ({dataset: {fight}, disabled: false})}}),
    action: action => document.handlers.click({target: {closest: selector => selector === '[data-action]' ? {dataset: {action}} : null}})};
}
function finished(won = true) {
  const E = page().E, state = E.create('challenge-support'), commands = [['create', 'challenge-support']];
  E.move(state, 'hero', 4, 4); commands.push(['move', 'hero', 4, 4]);
  while (state.phase === 'duel') {
    const a = won ? 'guard' : 'strike', d = won ? 'strike' : 'guard';
    E.resolve(state, a, d); commands.push(['resolve', a, d]);
  }
  assert.equal(state.winner, won ? 'red' : 'black');
  const saved = storage();
  saved.setItem('yiwu.autosave', JSON.stringify({version: 1, commands, ui: {opponent: 'computer', difficulty: 'standard', selected: null,
    preview: null, setupSide: 'red', focusIndex: 85, lesson: null, fight: null}}));
  const p = page(saved); p.node('resume').onclick(); return p;
}

{
  const p = finished(), before = p.saved.getItem('yiwu.autosave');
  assert(p.node('endgame').innerHTML.includes('下一关 · 主力轮换'));
  assert(p.node('challenge-info').innerHTML.includes('第 1 / 3 关'));
  p.action('review'); assert(p.node('review').open); p.action('close-review');
  p.action('next-challenge'); assert(p.node('confirm').open);
  assert.equal(p.node('confirm-title').textContent, '切换棋局？');
  assert(p.node('confirm-target').textContent.includes('主力轮换'));
  assert.equal(p.saved.getItem('yiwu.autosave'), before);
  p.node('cancel-load').onclick(); assert.equal(p.ui.state.scenario, 'challenge-support');
  p.action('next-challenge'); p.node('confirm').handlers.cancel(); p.node('confirm').close();
  p.node('confirm-load').onclick(); assert.equal(p.saved.getItem('yiwu.autosave'), before);
  assert.equal(p.timerCount(), 0);
}
{
  const p = finished(); p.action('next-challenge');
  p.node('scenario').value = 'full'; p.node('difficulty').value = 'practice';
  p.node('confirm-load').onclick();
  assert.equal(p.ui.state.scenario, 'challenge-relay'); assert.equal(p.ui.difficulty, 'standard');
  assert.equal(p.ui.state.phase, 'board'); assert.equal(p.ui.state.ply, 0);
  assert(p.node('challenge-info').innerHTML.includes('第 2 / 3 关'));
  const before = p.saved.getItem('yiwu.autosave');
  p.action('next-challenge'); p.node('confirm-load').onclick();
  assert.equal(p.saved.getItem('yiwu.autosave'), before); assert.equal(p.timerCount(), 0);
}
{
  const p = finished(); p.action('next-challenge');
  const q = page(p.saved); assert(!q.node('confirm').open); assert.equal(q.ui.screen, 'home');
  q.node('resume').onclick(); assert(q.node('endgame').innerHTML.includes('下一关 · 主力轮换'));
  q.action('next-challenge'); q.node('confirm-load').onclick();
  const restored = page(q.saved); restored.node('resume').onclick();
  assert.equal(restored.ui.state.scenario, 'challenge-relay'); assert.equal(restored.ui.state.ply, 0);
}
{
  const p = page(); p.ui.init('challenge-relay'); p.ui.state.phase = 'ended'; p.ui.state.winner = 'red';
  p.action('cancel-preview'); assert.equal(p.ui.nextChallenge(), 'challenge-tempo');
  assert(p.node('endgame').innerHTML.includes('下一关 · 整备还是抢攻'));
  p.ui.init('challenge-tempo'); p.ui.state.phase = 'ended'; p.ui.state.winner = 'red'; p.action('cancel-preview');
  const before = JSON.stringify(p.ui.state);
  assert.equal(p.ui.nextChallenge(), null); assert(!p.node('endgame').innerHTML.includes('data-action="next-challenge"'));
  assert(p.node('endgame').innerHTML.includes('这是最后一关')); assert(p.node('endgame').innerHTML.includes('选择其他棋局'));
  p.action('next-challenge'); assert(!p.node('confirm').open);
  p.action('home'); assert.equal(p.ui.screen, 'home'); assert.equal(JSON.stringify(p.ui.state), before);
}
{
  const lost = finished(false); assert(!lost.node('endgame').innerHTML.includes('data-action="next-challenge"'));
  lost.action('next-challenge'); assert(!lost.node('confirm').open);
  for (const mode of ['challenge-support', 'quick', 'full', 'tactics', 'tutorial']) {
    const p = page(); p.ui.init(mode); assert.equal(p.ui.nextChallenge(), null);
    p.action('next-challenge'); assert(!p.node('confirm').open);
    if (mode === 'quick' || mode === 'full') {
      p.ui.state.phase = 'ended'; p.ui.state.winner = 'red'; p.action('cancel-preview');
      assert.equal(p.ui.nextChallenge(), null); assert(!p.node('endgame').innerHTML.includes('data-action="next-challenge"'));
    }
  }
}
{
  const p = finished(); p.action('new');
  assert.equal(p.node('confirm-title').textContent, '重开棋局？'); assert.equal(p.node('confirm-load').textContent, '确认重开');
  p.node('cancel-load').onclick(); p.node('back-home').onclick();
  p.node('scenario').value = 'full'; p.node('load').onclick();
  assert.equal(p.node('confirm-title').textContent, '切换棋局？'); assert.equal(p.node('confirm-load').textContent, '确认切换');
}
{
  const p = page(); p.ui.init('challenge-support'); const s = p.ui.state, E = p.E;
  const hero = E.get(s, 'hero'), target = E.get(s, 'target'), ctx = E.context(s, hero, target), before = JSON.stringify(s);
  const note = p.ui.challengeCombatHTML(ctx);
  assert(note.includes('本场由红方兵对战指定目标') && note.includes('有效支援 1 名'));
  assert(note.includes('红方兵、红方帥必须存活') && !note.includes('若击败目标，本关将失败'));
  assert(!p.ui.challengeCombatHTML(ctx, true).split('<summary>')[0].includes(' open'));
  ctx.supportA = []; assert(p.ui.challengeCombatHTML(ctx).includes('红兵无支援；若击败目标，本关将失败'));
  assert(p.ui.challengeCombatHTML(ctx, true).split('<summary>')[0].includes(' open'));
  const defending = E.context(s, target, hero); defending.supportD = ['helper'];
  assert(p.ui.challengeCombatHTML(defending).includes('有效支援 1 名'));
  defending.supportD = []; assert(p.ui.challengeCombatHTML(defending).includes('红兵无支援'));
  assert.equal(JSON.stringify(s), before);
}
{
  const p = page(); p.ui.init('challenge-support'); const s = p.ui.state, E = p.E;
  const target = E.get(s, 'target'), helper = E.get(s, 'helper');
  assert(p.ui.challengeCombatHTML(E.context(s, helper, target)).includes('未使用指定主力红方兵；若击败目标，本关将失败'));
  assert(p.ui.challengeCombatHTML(E.context(s, helper, E.get(s, 'black_king'))).includes('若先击败黑将，本关将失败'));
  assert(p.ui.challengeCombatHTML(E.context(s, helper, E.get(s, 'enemy_rook'))).includes('目标黑方砲仍需由红方兵击败'));
}
{
  const p = page(); p.ui.init('challenge-relay'); const E = p.E, s = p.ui.state;
  assert(p.ui.challengeCombatHTML(E.context(s, E.get(s, 'hero'), E.get(s, 'target'))).includes('红方馬、红方車、红方帥必须存活'));
  s.phase = 'ended'; assert.equal(p.ui.challengeCombatHTML(s.lastCombat), '');
  for (const mode of ['quick', 'tutorial', 'tactics']) {
    p.ui.init(mode); assert.equal(p.ui.challengeCombatHTML(null), '');
  }
}
{
  const p = page(); p.ui.init('challenge-support'); const before = p.saved.getItem('yiwu.autosave');
  p.cell(1, 4); p.cell(4, 4);
  assert(p.node('preview-content').innerHTML.includes('未使用指定主力红方兵'));
  p.action('cancel-preview');
  assert.equal(p.ui.state.ply, 0); assert.equal(p.ui.state.phase, 'board');
  assert.equal(JSON.parse(p.saved.getItem('yiwu.autosave')).commands.length, JSON.parse(before).commands.length);
  p.cell(4, 5); p.cell(4, 4);
  assert(p.node('preview-content').innerHTML.includes('有效支援 1 名'));
  p.action('attack'); assert(p.node('fight-content').innerHTML.includes('有效支援 1 名'));
  const note = html => html.match(/<details class="challenge-check[\s\S]*?<\/details>/)[0];
  const original = note(p.node('fight-content').innerHTML), saved = p.saved.getItem('yiwu.autosave');
  p.pick('strike'); assert.equal(note(p.node('fight-content').innerHTML), original);
  p.pick('guard'); assert.equal(note(p.node('fight-content').innerHTML), original);
  const restored = page(p.saved); restored.node('resume').onclick();
  assert.equal(note(restored.node('fight-content').innerHTML), original);
  assert.deepEqual(JSON.parse(restored.saved.getItem('yiwu.autosave')).commands, JSON.parse(saved).commands);
}
function nearDeadline() {
  const p = page(), E = p.E, state = E.create('challenge-relay');
  const commands = [['create', 'challenge-relay'], ['rest', 'veteran', 'rook_crush'], ['move', 'black_king', 5, 1], ['move', 'hero', 1, 3], ['move', 'black_king', 5, 0]];
  for (const [name, ...args] of commands.slice(1)) E[name](state, ...args);
  assert.equal(state.ply, 4); assert.equal(state.phase, 'board'); assert.equal(state.turn, 'red');
  p.saved.setItem('yiwu.autosave', JSON.stringify({version: 1, commands, ui: {opponent: 'computer', difficulty: 'standard', selected: 'veteran', preview: null, setupSide: 'red', focusIndex: 49, lesson: null, fight: null}}));
  const restored = page(p.saved); restored.node('resume').onclick(); return restored;
}
{
  const p = nearDeadline(), before = p.saved.getItem('yiwu.autosave'), state = JSON.stringify(p.ui.state);
  assert(p.node('challenge-info').innerHTML.includes('剩余 2 次'));
  p.ui.requestRest('veteran', 'rook_hold', true);
  assert(p.node('rest-content').innerHTML.includes('此步后仅剩 1 次棋盘行动，轮到黑方'));
  assert(p.node('rest-content').innerHTML.includes('不回血') || p.node('rest-content').innerHTML.includes('生命保持 5 / 18'));
  p.node('cancel-rest').onclick();
  assert.equal(JSON.stringify(p.ui.state), state);
  assert.equal(p.saved.getItem('yiwu.autosave'), before);
  const refreshed = page(p.saved); refreshed.node('resume').onclick();
  assert(refreshed.node('challenge-info').innerHTML.includes('剩余 2 次'));
}
{
  const p = nearDeadline(), before = JSON.stringify(p.ui.state);
  p.action('scout'); p.cell(4, 5); p.cell(4, 6);
  assert(p.node('move-preview').innerHTML.includes('此步后仅剩 1 次棋盘行动，轮到黑方'));
  p.action('cancel-move'); assert.equal(JSON.stringify(p.ui.state), before);
  const action = {type: 'move', id: 'veteran', x: 4, y: 6};
  p.E.move(p.ui.state, action.id, action.x, action.y);
  const blackBefore = JSON.stringify(p.ui.state), risk = p.ui.actionOutcomeRisk({type: 'move', id: 'black_king', x: 5, y: 1});
  assert(risk.includes('执行此步将直接结束挑战') && risk.includes('6 次棋盘行动'));
  assert.equal(JSON.stringify(p.ui.state), blackBefore);
}
{
  const p = page(); p.ui.init('challenge-tempo'); const s = p.ui.state, E = p.E;
  E.rest(s, 'hero', 'rook_crush'); E.move(s, 'black_king', 5, 1);
  const before = JSON.stringify(s);
  p.cell(4, 4);
  assert(p.node('preview-content').innerHTML.includes('若本场未完成挑战，结束后仅剩 1 次棋盘行动'));
  assert.equal(JSON.stringify(s), before);
  E.move(s, 'hero', 4, 4); E.resolve(s, 'break', 'guard');
  assert.equal(s.winner, 'red');
  const q = page(); q.ui.init('challenge-tempo'); const final = q.ui.state;
  q.E.rest(final, 'hero', 'rook_crush'); q.E.move(final, 'black_king', 5, 1); q.E.move(final, 'red_king', 4, 9);
  assert(q.ui.actionOutcomeRisk({type: 'move', id: 'target', x: 4, y: 5}).includes('本场是时限内最后一次行动'));
  final.quiet = 79;
  assert(!q.ui.actionOutcomeRisk({type: 'move', id: 'target', x: 4, y: 5}).includes('结束时可能判和'));
  q.E.move(final, 'target', 4, 5);
  while (final.phase === 'duel') q.E.resolve(final, 'guard', 'break');
  assert.equal(final.ply, 4); assert.equal(final.winner, 'red');
}
{
  const p = page(); p.ui.init('attrition'); const s = p.ui.state;
  s.quiet = 79; const before = JSON.stringify(s); p.cell(4, 4);
  const preview = p.node('preview-content').innerHTML;
  assert(preview.includes('若本场没有造成损血，结束时可能判和'));
  assert(!preview.includes('若本场没有造成损血，结束时必定判和'));
  p.action('cancel-preview'); assert.equal(JSON.stringify(s), before);
  s.quiet = 0; p.cell(4, 4); assert(!p.node('preview-content').innerHTML.includes('结束时可能判和'));
}
function retreatReady() {
  const p = page(); p.ui.init('tactics');
  p.ui.beginFight(p.E.get(p.ui.state, 'hero'), p.E.get(p.ui.state, 'target'));
  p.ui.fight.computerChoice = 'cannon_pressure'; p.pick('pawn_grit'); p.fight('commit'); p.fight('next');
  assert.equal(p.ui.fight.ctx.round, 2); assert.equal(p.ui.state.phase, 'duel'); return p;
}
{
  const p = retreatReady(); p.pick('guard');
  const state = JSON.stringify(p.ui.state), saved = p.saved.getItem('yiwu.autosave'), choice = p.ui.fight.computerChoice;
  p.fight('retreat');
  const h = p.node('fight-content').innerHTML;
  assert(h.includes('确认主动撤回？') && h.includes('韧劲') && h.includes('震慑'));
  assert(h.includes('生命保持 17 / 18') && h.includes('气势 0 → 0'));
  assert(h.includes('轮到黑方行动') && !h.includes('data-choice='));
  p.pick('strike'); p.fight('commit'); p.fight('next'); p.fight('hint');
  assert.equal(JSON.stringify(p.ui.state), state); assert.equal(p.ui.fight.pending, 'guard');
  p.fight('cancel-retreat'); assert(!p.node('fight-content').innerHTML.includes('确认主动撤回？'));
  assert.equal(p.ui.fight.computerChoice, choice); assert.equal(p.saved.getItem('yiwu.autosave'), saved);
  p.fight('retreat'); let prevented = false;
  p.node('fight').handlers.cancel({preventDefault() {prevented = true;}});
  assert(prevented && !p.ui.fight.retreatConfirm); assert.equal(JSON.stringify(p.ui.state), state);
  assert.equal(p.ui.fight.pending, 'guard'); assert.equal(p.ui.fight.computerChoice, choice);
}
{
  const p = retreatReady(), expected = JSON.parse(JSON.stringify(p.ui.state)); p.E.retreat(expected);
  const before = JSON.parse(p.saved.getItem('yiwu.autosave')).commands.length;
  p.fight('retreat'); p.fight('confirm-retreat');
  assert.equal(JSON.stringify(p.ui.state), JSON.stringify(expected)); assert.equal(p.ui.fight.step, 'retreated');
  const saved = p.saved.getItem('yiwu.autosave');
  assert.equal(JSON.parse(saved).commands.length, before + 1); assert.deepEqual(JSON.parse(saved).commands.at(-1), ['retreat']);
  p.fight('confirm-retreat'); p.fight('retreat'); assert.equal(p.saved.getItem('yiwu.autosave'), saved);
  const q = page(p.saved); q.node('resume').onclick(); assert.equal(q.ui.fight.step, 'retreated');
  assert.equal(JSON.stringify(q.ui.state), JSON.stringify(expected)); assert.equal(q.timerCount(), 0);
}
{
  const p = retreatReady(); p.pick('break'); const saved = p.saved.getItem('yiwu.autosave');
  p.fight('retreat'); assert.equal(p.saved.getItem('yiwu.autosave'), saved);
  const q = page(p.saved); q.node('resume').onclick();
  assert(!q.node('fight-content').innerHTML.includes('确认主动撤回？')); assert.equal(q.ui.fight.pending, 'break');
  assert.equal(q.ui.fight.computerChoice, p.ui.fight.computerChoice);
  q.fight('confirm-retreat'); assert.equal(q.saved.getItem('yiwu.autosave'), saved);
  p.action('home'); p.node('resume').onclick(); assert(!p.ui.fight.retreatConfirm);
  p.fight('confirm-retreat'); assert.equal(p.saved.getItem('yiwu.autosave'), saved);
}
{
  const p = page(); p.node('opponent').value = 'local'; p.ui.init('tactics');
  p.ui.beginFight(p.E.get(p.ui.state, 'hero'), p.E.get(p.ui.state, 'target'));
  let before = JSON.stringify(p.ui.state); p.fight('retreat'); p.fight('confirm-retreat'); assert.equal(JSON.stringify(p.ui.state), before);
  assert(!p.ui.fight.retreatConfirm); p.fight('ready'); p.pick('focus'); p.fight('commit');
  p.fight('ready'); p.pick('focus'); p.fight('commit'); p.fight('next');
  p.fight('ready'); p.pick('strike'); p.fight('commit'); assert.equal(p.ui.fight.step, 'handoffD');
  before = JSON.stringify(p.ui.state); p.fight('retreat'); p.fight('confirm-retreat');
  assert.equal(JSON.stringify(p.ui.state), before); assert(!p.ui.fight.retreatConfirm);
  p.fight('ready'); p.fight('retreat'); p.fight('confirm-retreat'); assert.equal(JSON.stringify(p.ui.state), before);
}
{
  const p = page(); p.node('opponent').value = 'local'; p.ui.init('attrition');
  const duel = (a, d) => p.ui.beginFight(p.E.get(p.ui.state, a), p.E.get(p.ui.state, d));
  const round = () => {p.fight('ready'); p.pick('focus'); p.fight('commit'); p.fight('ready'); p.pick('focus'); p.fight('commit'); p.fight('next');};
  duel('hero', 'target'); round(); p.fight('retreat'); p.fight('confirm-retreat'); p.fight('next');
  duel('target', 'hero'); round(); assert.equal(p.ui.fight.step, 'handoffA');
  const before = JSON.stringify(p.ui.state); p.fight('retreat');
  const h = p.node('fight-content').innerHTML;
  assert(h.includes('黑方主动撤回') && h.includes('轮到红方行动') && h.includes('气势 1 → 0'));
  p.fight('cancel-retreat'); assert.equal(p.ui.fight.step, 'handoffA'); assert.equal(JSON.stringify(p.ui.state), before);
  p.fight('retreat'); p.fight('confirm-retreat'); assert.equal(p.ui.state.turn, 'red'); assert.equal(p.ui.state.ply, 2);
}
{
  const p = page(); p.ui.init('challenge-tempo'); p.ui.requestRest('hero', 'rook_crush', true); p.node('confirm-rest').onclick();
  p.computerMove({type: 'move', id: 'black_king', x: 5, y: 1});
  p.ui.beginFight(p.E.get(p.ui.state, 'hero'), p.E.get(p.ui.state, 'target'));
  p.ui.fight.computerChoice = 'guard'; p.pick('focus'); p.fight('commit'); p.fight('next');
  const before = JSON.stringify(p.ui.state); p.fight('retreat');
  assert(p.node('fight-content').innerHTML.includes('撤回后本关剩余 1 次棋盘行动'));
  assert.equal(JSON.stringify(p.ui.state), before); p.fight('cancel-retreat');
  p.ui.state.ply = 3; p.fight('retreat');
  assert(p.node('fight-content').innerHTML.includes('撤回将直接结束本局'));
  p.fight('cancel-retreat'); p.ui.state.ply = 2; p.fight('retreat'); p.fight('confirm-retreat'); assert.equal(p.ui.state.ply, 3);
  const q = page(); q.node('opponent').value = 'local'; q.ui.init('attrition');
  q.ui.beginFight(q.E.get(q.ui.state, 'hero'), q.E.get(q.ui.state, 'target'));
  q.fight('ready'); q.pick('focus'); q.fight('commit'); q.fight('ready'); q.pick('focus'); q.fight('commit'); q.fight('next');
  q.ui.state.quiet = 79; q.fight('retreat');
  assert(q.node('fight-content').innerHTML.includes('撤回将直接结束本局') && q.node('fight-content').innerHTML.includes('判和'));
  const next = JSON.parse(JSON.stringify(q.ui.state)); q.E.retreat(next); assert.equal(next.winner, 'draw');
  q.fight('cancel-retreat'); assert.equal(q.ui.state.phase, 'duel'); assert.equal(q.ui.state.quiet, 79);
}
{
  const p = page(); p.ui.init('tactics'); p.ui.beginFight(p.E.get(p.ui.state, 'hero'), p.E.get(p.ui.state, 'target'));
  assert(!p.node('fight-content').innerHTML.includes('aria-label="本轮生命预估"'));
  const before = JSON.stringify(p.ui.state), commands = JSON.parse(p.saved.getItem('yiwu.autosave')).commands;
  p.pick('guard'); const forecast = h => h.match(/<div class="pick-forecast[\s\S]*?<\/div>/)[0];
  const selected = forecast(p.node('fight-content').innerHTML);
  assert(p.node('fight-content').innerHTML.indexOf('aria-label="本轮生命预估"') > p.node('fight-content').innerHTML.indexOf('class="fight-footer"'));
  p.pick('focus'); assert.notEqual(forecast(p.node('fight-content').innerHTML), selected);
  p.pick('guard'); assert.equal(forecast(p.node('fight-content').innerHTML), selected);
  assert.equal(JSON.stringify(p.ui.state), before); assert.deepEqual(JSON.parse(p.saved.getItem('yiwu.autosave')).commands, commands);
  const q = page(p.saved); q.node('resume').onclick(); assert.equal(forecast(q.node('fight-content').innerHTML), selected);
  q.fight('commit'); assert(!q.node('fight-content').innerHTML.includes('aria-label="本轮生命预估"'));
  const r = retreatReady(); r.pick('guard'); r.fight('retreat'); assert(!r.node('fight-content').innerHTML.includes('aria-label="本轮生命预估"'));
  r.fight('cancel-retreat'); assert(r.node('fight-content').innerHTML.includes('aria-label="本轮生命预估"'));
  const local = page(); local.node('opponent').value = 'local'; local.ui.init('tactics');
  local.ui.beginFight(local.E.get(local.ui.state, 'hero'), local.E.get(local.ui.state, 'target'));
  local.fight('ready'); local.pick('strike'); local.fight('commit');
  assert(!local.node('fight-content').innerHTML.includes('aria-label="本轮生命预估"'));
  local.fight('ready'); local.pick('guard'); const original = forecast(local.node('fight-content').innerHTML);
  local.ui.fight.first = 'break'; local.pick('guard'); assert.equal(forecast(local.node('fight-content').innerHTML), original);
}
{
  for (const difficulty of ['standard', 'practice']) {
    const saved = storage();
    saved.setItem('yiwu.autosave', JSON.stringify({version: 1, commands: [
      ['create', 'challenge-tempo'], ['rest', 'hero', 'rook_crush'], ['move', 'black_king', 5, 1],
      ['move', 'red_king', 3, 8], ['move', 'target', 4, 5], ['resolve', 'focus', 'focus']
    ], ui: {opponent: 'computer', difficulty, selected: null, preview: null, setupSide: 'red', focusIndex: 85,
      lesson: null, fight: {step: 'result', first: null, pending: null, computerChoice: 'focus'}}}));
    const p = page(saved); p.node('resume').onclick();
    assert.equal(p.ui.state.phase, 'duel'); assert.equal(p.ui.state.ply, 3);
    assert.equal(p.ui.fight.ctx.round, 2); p.fight('next');
    assert.equal(p.ui.fight.step, 'retreated'); assert.equal(p.ui.fight.computerChoice, 'retreat');
    assert.equal(p.ui.state.phase, 'ended'); assert.equal(p.ui.state.winner, 'black'); assert.equal(p.ui.state.ply, 4);
    const reason = p.ui.fight.computerReason, state = JSON.stringify(p.ui.state);
    assert(reason.includes('撤回直接结束本局：黑方获胜') && reason.includes(p.ui.state.reason));
    assert(!reason.includes('生命较低')); assert(p.node('fight-content').innerHTML.includes(reason));
    const commands = JSON.parse(saved.getItem('yiwu.autosave')).commands;
    assert.equal(commands.length, 7); assert.deepEqual(commands.at(-1), ['retreat']);
    const q = page(saved); q.node('resume').onclick();
    assert.equal(q.ui.fight.computerReason, reason); assert.equal(JSON.stringify(q.ui.state), state);
    assert.equal(q.timerCount(), 0); q.fight('hint'); q.fight('confirm-retreat');
    assert.deepEqual(JSON.parse(saved.getItem('yiwu.autosave')).commands, commands);
    q.fight('next'); assert.equal(q.ui.fight, null); assert.equal(JSON.stringify(q.ui.state), state);
    const r = page(saved); r.node('resume').onclick(); assert.equal(JSON.stringify(r.ui.state), state);
    assert.equal(r.timerCount(), 0); assert(!r.node('endgame').hidden);
    assert.deepEqual(JSON.parse(saved.getItem('yiwu.autosave')).commands, commands);
  }
}
{
  const saved = storage(), commands = [['create', 'challenge-tempo'], ['move', 'hero', 4, 4],
    ['resolve', 'guard', 'guard'], ['resolve', 'strike', 'break']];
  saved.setItem('yiwu.autosave', JSON.stringify({version: 1, commands, ui: {opponent: 'computer', difficulty: 'standard',
    selected: null, preview: null, setupSide: 'red', focusIndex: 85, lesson: null,
    fight: {step: 'result', first: null, pending: null, computerChoice: 'break'}}}));
  const p = page(saved); p.node('resume').onclick(); p.fight('next');
  const before = JSON.stringify(p.ui.state), locked = p.ui.fight.computerChoice;
  p.fight('hint'); const hint = JSON.stringify(p.ui.fight.hint);
  assert(p.ui.fight.hint.reasons.join(' ').includes('本轮结算都会完成本关目标'));
  assert(['strike', 'break'].includes(p.ui.fight.pending));
  p.ui.fight.computerChoice = 'focus'; p.fight('hint'); assert.equal(JSON.stringify(p.ui.fight.hint), hint);
  assert.equal(JSON.stringify(p.ui.state), before); assert.deepEqual(JSON.parse(saved.getItem('yiwu.autosave')).commands, commands);
  p.ui.fight.computerChoice = locked; p.fight('commit');
  assert.equal(p.ui.state.winner, 'red'); assert.equal(p.ui.state.ply, 1); assert(!p.E.get(p.ui.state, 'target'));
  const after = JSON.stringify(p.ui.state), q = page(saved); q.node('resume').onclick();
  assert.equal(JSON.stringify(q.ui.state), after); assert.equal(q.timerCount(), 0);
  assert.equal(JSON.parse(saved.getItem('yiwu.autosave')).commands.length, commands.length + 1);
}
{
  const saved = storage();
  saved.setItem('yiwu.autosave', JSON.stringify({version: 1, commands: [['create', 'challenge-tempo'], ['move', 'hero', 4, 4],
    ['resolve', 'guard', 'focus'], ['resolve', 'focus', 'focus'], ['resolve', 'guard', 'break']],
    ui: {opponent: 'computer', difficulty: 'standard', selected: null, preview: null, setupSide: 'red', focusIndex: 85,
      lesson: null, fight: {step: 'result', first: null, pending: null, computerChoice: 'break'}}}));
  const p = page(saved); p.node('resume').onclick(); p.fight('next');
  assert(['strike', 'break'].includes(p.ui.fight.computerChoice));
  assert(!p.node('fight-content').innerHTML.includes('电脑选招说明'));
  p.pick('focus'); p.fight('commit'); assert.equal(p.ui.state.winner, 'black');
  const state = JSON.stringify(p.ui.state), q = page(saved); q.node('resume').onclick();
  assert.equal(JSON.stringify(q.ui.state), state); assert.equal(q.timerCount(), 0);
  assert.equal(JSON.parse(saved.getItem('yiwu.autosave')).commands.length, 6);
}
console.log('残局流程、行动后果与武斗确认：24 项检查通过。');
