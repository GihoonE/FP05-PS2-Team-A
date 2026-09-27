// ============ Mechanism ============
// Port of src/gpu_allocation.py (github.com/GihoonE/COMPSCI206-PS2). Keep the two in sync.
// Run `node app.js` to check it against the repo's outputs/*.csv example and test truthful reporting.

const CAPACITY = 100;
const EMISSIONS_PER_GPU_HOUR = 0.24;
const CARBON_PENALTY = 0.5;
const CREDITS_PER_SCORE_UNIT = 10;

const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const emissions = t => EMISSIONS_PER_GPU_HOUR * t.d;
const carbonCost = t => CARBON_PENALTY * emissions(t);
const score = t => t.v - carbonCost(t);
const sum = (teams, group, f) => group.reduce((s, i) => s + f(teams[i]), 0);
const demand = (teams, group) => sum(teams, group, t => t.d);
const totalScore = (teams, group) => sum(teams, group, score);

// Python's tie-break: higher score, then more teams, then earlier team order.
function better(teams, a, b) {
  const sa = round(totalScore(teams, a), 10), sb = round(totalScore(teams, b), 10);
  if (sa !== sb) return sa > sb;
  if (a.length !== b.length) return a.length > b.length;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
}

// Every feasible group (2^n checked), best first.
function rankedGroups(teams, excluded = -1) {
  const groups = [];
  for (let mask = 0; mask < 1 << teams.length; mask++) {
    const g = teams.map((_, i) => i).filter(i => mask >> i & 1);
    if (!g.includes(excluded) && demand(teams, g) <= CAPACITY) groups.push(g);
  }
  return groups.sort((a, b) => better(teams, a, b) ? -1 : better(teams, b, a) ? 1 : 0);
}

function vcg(teams) {
  const selected = rankedGroups(teams)[0];
  const payments = {}, detail = {};
  for (const w of selected) {
    const alt = rankedGroups(teams, w)[0];            // best group if w had not taken part
    const others = selected.filter(i => i !== w);     // everyone else in the actual group
    const without = totalScore(teams, alt), withW = totalScore(teams, others);
    payments[w] = round(Math.max(0, without - withW));
    detail[w] = { alt, others, without, withW };
  }
  return { selected, payments, detail };
}

function fcfs(teams, order) {
  let remaining = CAPACITY;
  const selected = [], steps = [];
  for (const i of order) {
    const fits = teams[i].d <= remaining;
    steps.push({ i, fits, before: remaining });
    if (fits) { selected.push(i); remaining -= teams[i].d; }
  }
  return { selected, steps, payments: {} };
}

// Quasi-linear utility that counts the team's own carbon penalty: the utility under which
// the README's DSIC claim holds. (The repo's team_rows column currently uses true_value - payment.)
function utility(teams, outcome, i, trueValue) {
  return outcome.selected.includes(i) ? trueValue - carbonCost(teams[i]) - (outcome.payments[i] || 0) : 0;
}

function metrics(teams, outcome) {
  const g = outcome.selected;
  const paid = Object.values(outcome.payments).reduce((s, p) => s + p, 0);
  return {
    served: g.length,
    gpu: round(demand(teams, g)),
    value: round(sum(teams, g, t => t.v)),
    score: round(totalScore(teams, g)),
    emissions: round(sum(teams, g, emissions)),
    credits: round(paid * CREDITS_PER_SCORE_UNIT),
  };
}

const Mechanism = { CAPACITY, EMISSIONS_PER_GPU_HOUR, CARBON_PENALTY, CREDITS_PER_SCORE_UNIT,
  round, emissions, carbonCost, score, demand, totalScore, rankedGroups, vcg, fcfs, utility, metrics };

if (typeof module !== 'undefined' && require.main === module) {
  {
    // default_example() from the repo; expected numbers are outputs/summary.csv
    const assert = require('assert');
    const teams = [[25, 9], [20, 6], [15, 3], [25, 9], [20, 6], [15, 3]].map(([d, v]) => ({ d, v }));
    const v = vcg(teams), f = fcfs(teams, [0, 1, 4, 2, 3, 5]);
    assert.deepStrictEqual(v.selected, [0, 1, 3, 4]);
    assert.deepStrictEqual(v.payments, { 0: 2.4, 1: 2.4, 3: 2.4, 4: 2.4 });
    assert.deepStrictEqual(f.selected, [0, 1, 4, 2, 5]);
    assert.deepStrictEqual(metrics(teams, v), { served: 4, gpu: 90, value: 30, score: 19.2, emissions: 21.6, credits: 96 });
    assert.deepStrictEqual(metrics(teams, f), { served: 5, gpu: 95, value: 27, score: 15.6, emissions: 22.8, credits: 0 });
    console.log('mechanism matches repo outputs ✓');

    // DSIC: on random instances no misreport beats reporting the true value.
    for (let n = 0; n < 200; n++) {
      const ts = teams.map(() => ({ d: 5 * (1 + Math.floor(Math.random() * 6)), v: 1 + Math.floor(Math.random() * 10) }));
      ts.forEach((t, i) => {
        const u = r => { const x = ts.map((y, j) => j === i ? { ...y, v: r } : y); return utility(x, vcg(x), i, t.v); };
        const truthful = u(t.v);
        for (let r = 0; r <= 10; r += 0.5) assert(u(r) <= truthful + 1e-9, `misreport ${r} beats truth ${t.v}`);
      });
    }
    console.log('truthful reporting is optimal on 200 random instances ✓');
    process.exit(0);   // the rest of this file is browser UI
  }
}

// ============ Browser UI ============
const M = Mechanism;
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, REDUCED ? 0 : ms));
const fmt = x => String(M.round(x));
const LETTERS = 'ABCDEF';
const TIERS = [{ d: 15, v: 3 }, { d: 20, v: 6 }, { d: 25, v: 9 }];   // repo's Low / Medium / High
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const names = (teams, g) => g.length ? g.map(i => teams[i].name).join(' + ') : 'nobody';
const credits = p => fmt(p * M.CREDITS_PER_SCORE_UNIT);

// Teams are { name, d, v: reported value, tv: true value, you }. Rivals are simulated and report truthfully.
const rival = name => { const t = pick(TIERS); return { name, d: t.d, v: t.v, tv: t.v }; };
const S = {};   // me, tv, teams1, fcfs1, teams2, vcg2, guess, cmp

// ---------- scene switching with the chevron wipe ----------
let scene = 'intro', prevScene = 'intro';
async function go(id) {
  const w = $('#wipe');
  if (!REDUCED) { w.classList.remove('run'); void w.offsetWidth; w.classList.add('run'); await sleep(500); }
  scene = id;
  $$('.scene').forEach(s => { s.hidden = s.id !== id; });
  scrollTo(0, 0);
}

// ---------- shared drawing helpers ----------
function say(el, text) {
  el.innerHTML = text.split(' ').map((w, i) =>
    `<span style="animation-delay:${i * 70}ms">${w.replace(/\*(.+?)\*/g, '<em>$1</em>')}</span>`).join(' ');
}

function bar(el, draw = false) {
  el.innerHTML = `<div class="track${draw ? ' draw' : ''}"><span class="end">100 GPU-h</span></div><div class="out"></div>`;
  return { track: el.querySelector('.track'), out: el.querySelector('.out') };
}

function block(b, t, at, cls = '') {
  const el = document.createElement('div');
  el.className = `block ${cls}${t.you ? ' you' : ''}`;
  el.style.left = at + '%';
  el.style.width = t.d + '%';
  el.innerHTML = `<span>${t.name} · ${t.d}h</span>`;
  b.track.append(el);
}

function reject(b, t, left) {
  const el = document.createElement('span');
  el.className = 'chip' + (t.you ? ' you' : '');
  el.textContent = `${t.name} ${t.d}h`;
  el.title = `Only ${left}h left`;
  b.out.append(el);
}

function fillGroup(b, teams, group) {
  let at = 0;
  for (const i of group) { block(b, teams[i], at); at += teams[i].d; }
  const g = document.createElement('div');
  g.className = 'group';
  g.style.width = at + '%';
  b.track.append(g);
}

function cards(el, teams, { showScore = false } = {}) {
  el.innerHTML = teams.map((t, i) => `
    <div class="card${t.you ? ' you open' : ''}" data-i="${i}">
      <div class="inner">
        <div class="face back"><b>Team ${t.name}</b><span>hidden</span></div>
        <div class="face front">
          <span class="tag">${t.you ? 'you' : 'simulated'}</span>
          <b>Team ${t.name}</b><br>
          ${t.d} GPU-h<br>
          ${t.you && showScore ? `reports ${t.v}<br><small>true ${t.tv}</small>` : t.you ? `true value ${t.tv}` : `value ${t.v}`}<br>
          ${showScore ? `score <b>${fmt(M.score(t))}</b>` : `<small>${fmt(M.emissions(t))} kg CO₂e</small>`}
          <span class="order"></span>
        </div>
      </div>
    </div>`).join('');
}

async function reveal(el) {
  for (const c of el.querySelectorAll('.card:not(.open)')) { c.classList.add('open'); await sleep(130); }
  await sleep(600);
}

const card = (el, i) => el.querySelector(`.card[data-i="${i}"]`);

// ---------- I. intro: ~14 s typographic explainer ----------
const DEMO = [['A', 25], ['B', 20], ['C', 15], ['D', 25], ['E', 20], ['F', 15]].map(([name, d]) => ({ name, d }));
let introRun = 0;

async function playIntro() {
  const run = ++introRun;
  const alive = () => run === introRun && scene === 'intro';
  const viz = $('#introViz'), text = $('#introText'), label = $('#introLabel');
  $('#skip').textContent = 'Skip ›';

  label.textContent = 'The problem';
  let b = bar(viz, true);
  say(text, '*100* GPU-hours to share.');
  await sleep(2400); if (!alive()) return;

  say(text, 'Six teams ask for *120.*');
  let at = 0;
  for (const t of DEMO) { block(b, t, at, at + t.d > 100 ? 'over' : ''); at += t.d; await sleep(160); }
  await sleep(1500); if (!alive()) return;

  label.textContent = 'Rule one';
  b = bar(viz);
  say(text, 'First come, first served?');
  at = 0;
  for (const i of [0, 1, 4, 2, 3, 5]) {       // the repo's illustrative arrival order
    const t = DEMO[i];
    if (at + t.d <= 100) { block(b, t, at); at += t.d; } else reject(b, t, 100 - at);
    await sleep(380);
  }
  await sleep(700); if (!alive()) return;

  label.textContent = 'Rule two';
  viz.innerHTML = `<div class="eq">
    <span style="--fy:-40px">score</span><span style="animation-delay:.25s">=</span>
    <span style="--fx:-60px;--fy:0;animation-delay:.45s">value</span><span style="animation-delay:.7s">−</span>
    <span style="--fx:60px;--fy:0;animation-delay:.9s">carbon</span></div>`;
  say(text, 'Every team gets a *score.*');
  await sleep(3000); if (!alive()) return;

  b = bar(viz);
  fillGroup(b, DEMO, [0, 1, 3, 4]);
  say(text, 'Pick the best *group* that fits.');
  await sleep(1800); if (!alive()) return;
  say(text, 'Winners pay what their seat cost the others.');
  await sleep(1600); if (!alive()) return;
  $('#skip').textContent = 'Start ›';
}

// ---------- II. Stage 1: FCFS ----------
function newGame() {
  S.me = Math.floor(Math.random() * 6);
  S.tv = 1 + Math.floor(Math.random() * 10);
  $$('.me').forEach(e => { e.textContent = 'Team ' + LETTERS[S.me]; });
  $$('.tv').forEach(e => { e.textContent = S.tv; });
  $('#d').disabled = $('#submit1').disabled = false;
  ['#bar1', '#log1', '#res1'].forEach(s => { $(s).innerHTML = ''; });
  $('#next1').hidden = $('#rule1').hidden = true;
  S.teams1 = [...LETTERS].map((name, i) => i === S.me ? mine() : rival(name));
  preview1();
  $$('input[name=pref]').forEach(r => { r.checked = false; });
  $('#whyReport').value = $('#surprise').value = '';
}

const mine = (report = S.tv) => ({ name: LETTERS[S.me], d: +$('#d').value, v: report, tv: S.tv, you: true });

function preview1() {
  const t = mine();
  $('#dOut').textContent = t.d;
  $('#preview1').textContent = `Estimated emissions: 0.24 × ${t.d} = ${fmt(M.emissions(t))} kg CO₂e.`;
  if (!$('#submit1').disabled) { S.teams1[S.me] = t; cards($('#cards1'), S.teams1); }
}

async function runStage1() {
  $('#d').disabled = $('#submit1').disabled = true;
  const teams = S.teams1, el = $('#cards1');
  await reveal(el);

  const order = shuffle([0, 1, 2, 3, 4, 5]);
  order.forEach((i, k) => { card(el, i).querySelector('.order').textContent = `arrives #${k + 1}`; });
  $('#rule1').hidden = false;
  await sleep(900);

  const b = bar($('#bar1'));
  const out = S.fcfs1 = M.fcfs(teams, order);
  let at = 0;
  for (const [k, s] of out.steps.entries()) {
    const t = teams[s.i], c = card(el, s.i);
    c.classList.add('active');
    const li = document.createElement('li');
    if (s.fits) {
      block(b, t, at); at += t.d;
      li.textContent = `#${k + 1} Team ${t.name} asks ${t.d}h → granted · ${s.before - t.d}h left`;
    } else {
      reject(b, t, s.before);
      c.classList.add('lost');
      li.className = 'no';
      li.textContent = `#${k + 1} Team ${t.name} asks ${t.d}h → only ${s.before}h left · skipped`;
    }
    $('#log1').append(li);
    await sleep(800);
    c.classList.remove('active');
  }

  const won = out.selected.includes(S.me);
  $('#res1').innerHTML = `Served ${names(teams, out.selected)} · ${fmt(M.demand(teams, out.selected))} / 100 GPU-h used.
    <em>${won ? 'Your team was served.' : 'Your team was skipped: the queue got there first.'}</em>`;
  $('#next1').hidden = false;
}

// ---------- III. Stage 2: report, predict, then scored group selection ----------
function setupStage2() {
  S.teams2 = [...LETTERS].map((name, i) => i === S.me ? { ...S.teams1[S.me] } : rival(name));
  $('#r').value = S.tv;
  $('#r').disabled = false;
  preview2();
  $$('.ask .btn').forEach(b => { b.disabled = false; b.classList.remove('picked'); });
  $('#out2').hidden = $('#whatif').hidden = $('#payHead').hidden = $('#next2').hidden = true;
  ['#rank', '#bar2', '#best', '#why', '#pay', '#verdict'].forEach(s => { $(s).innerHTML = ''; });
}

function preview2() {
  const t = S.teams2[S.me];
  t.v = +$('#r').value;
  $('#rOut').textContent = t.v;
  $('#preview2').innerHTML = `Your reported score = ${t.v} − 0.12 × ${t.d} = <b>${fmt(M.score(t))}</b>` +
    (t.v === S.tv ? ' (truthful report)' : ` (${t.v > S.tv ? 'over' : 'under'}reporting by ${Math.abs(t.v - S.tv)})`);
  cards($('#cards2'), S.teams2, { showScore: true });
}

async function runStage2(guess) {
  S.guess = guess;
  $('#r').disabled = true;
  $$('.ask .btn').forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.guess === guess); });
  const teams = S.teams2, el = $('#cards2');
  await reveal(el);

  // 1. ranking by score
  $('#out2').hidden = false;
  const order = teams.map((_, i) => i).sort((a, b) => M.score(teams[b]) - M.score(teams[a]));
  const rank = $('#rank');
  rank.innerHTML = '<tr><th>#</th><th>Team</th><th>GPU-h</th><th>Reported value</th><th>− Carbon</th><th>Score</th></tr>' +
    order.map((i, k) => { const t = teams[i]; return `<tr class="row${t.you ? ' you' : ''}" data-i="${i}" style="animation-delay:${k * 120}ms">
      <td>${k + 1}</td><td>Team ${t.name}</td><td>${t.d}</td><td>${t.v}</td><td>${fmt(M.carbonCost(t))}</td><td>${fmt(M.score(t))}</td></tr>`; }).join('');
  rank.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  await sleep(order.length * 120 + 900);

  // 2. the best feasible group
  const out = S.vcg2 = M.vcg(teams);
  const win = new Set(out.selected);
  rank.querySelectorAll('tr.row').forEach(r => r.classList.add(win.has(+r.dataset.i) ? 'win' : 'lose'));
  teams.forEach((_, i) => card(el, i).classList.toggle('lost', !win.has(i)));
  fillGroup(bar($('#bar2')), teams, out.selected);
  $('#best').innerHTML = `Best group that fits: <b>${names(teams, out.selected)}</b> · ${fmt(M.demand(teams, out.selected))} GPU-h ·
    total score <b>${fmt(M.totalScore(teams, out.selected))}</b>`;
  await sleep(1200);

  // 3. why this group, not just the top of the ranking.
  // Rival tiers are coarse, so many groups tie: show the 3 best distinct totals, not 3 copies of one.
  const levels = [];
  for (const g of M.rankedGroups(teams)) {
    const s = fmt(M.totalScore(teams, g)), last = levels[levels.length - 1];
    if (last && last.s === s) last.n++;
    else if (levels.length < 3) levels.push({ s, g, n: 1 });
    else break;
  }
  let greedy = [], used = 0;
  for (const i of order) if (M.score(teams[i]) > 0 && used + teams[i].d <= 100) { greedy.push(i); used += teams[i].d; }
  const same = greedy.slice().sort().join() === out.selected.slice().sort().join();
  const tied = n => n > 1 ? ` <span class="note">(+${n - 1} other group${n > 2 ? 's' : ''} with the same total)</span>` : '';
  $('#why').innerHTML = `<p class="note">The 3 best totals among all groups that fit (every one of the 64 groups is checked):</p>
    <ol class="groups">${levels.map(({ s, g, n }, k) => `<li class="${k ? '' : 'top'}" style="animation-delay:${k * 200}ms">
      total ${s} · ${names(teams, g)} · ${fmt(M.demand(teams, g))} GPU-h${k ? '' : ' ← chosen'}${tied(n)}</li>`).join('')}</ol>
    <p class="note">${same
      ? 'Here, going down the ranking gives the same group, but only by luck: the rule compares whole groups, not single teams.'
      : `Going straight down the ranking would give ${names(teams, greedy)} (total ${fmt(M.totalScore(teams, greedy))}). Comparing whole groups finds a better fit.`}
    ${levels[0].n > 1 ? ' Several groups tie for the top total, so the published tie-break decides: more teams first, then earlier team letter.' : ''}</p>`;
  await sleep(1400);

  // 4. VCG payments
  $('#payHead').hidden = false;
  $('#pay').innerHTML = out.selected.map((w, k) => {
    const d = out.detail[w], n = 'Team ' + teams[w].name, p = out.payments[w];
    return `<div class="payline" style="animation-delay:${k * 350}ms">
      <b${teams[w].you ? ' class="you"' : ''}>${n}</b>: without ${n}, the others' best group is ${names(teams, d.alt)} → ${fmt(d.without)}.
      With ${n} in, the others get ${names(teams, d.others)} → ${fmt(d.withW)}.
      <div class="math">${fmt(d.without)} − ${fmt(d.withW)} = <b>${fmt(p)}</b> → <b>${credits(p)} credits</b>${p ? '' : ' (this seat pushed nobody out)'}</div></div>`;
  }).join('');
  await sleep(out.selected.length * 350 + 600);

  // 5. prediction check and your utility
  const me = teams[S.me], won = win.has(S.me), right = (S.guess === 'yes') === won;
  const u = M.utility(teams, out, S.me, S.tv);
  $('#verdict').innerHTML = `You predicted <b>${S.guess === 'yes' ? 'selected' : 'left out'}</b>. Your team was
    <b>${won ? 'selected' : 'left out'}</b>. <em>${right ? 'Correct.' : 'Not this time.'}</em><br>
    Your utility: ${won
      ? `true value ${S.tv} − carbon ${fmt(M.carbonCost(me))} − payment ${fmt(out.payments[S.me])} = <b>${fmt(u)}</b>`
      : '<b>0</b> (not selected)'}.`;
  $('#verdict').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  await sleep(1200);

  // 6. what-if: sweep your report, everything else fixed
  S.curve = [];
  for (let r = 0; r <= 10.001; r += 0.1) S.curve.push([M.round(r, 1), whatIf(M.round(r, 1)).u]);
  $('#w').value = me.v;
  $('#whatif').hidden = false;
  drawWhatIf();
  $('#next2').hidden = false;
}

function whatIf(r) {
  const t = S.teams2.map((x, i) => i === S.me ? { ...x, v: r } : x);
  const o = M.vcg(t);
  return { win: o.selected.includes(S.me), p: o.payments[S.me] || 0, u: M.utility(t, o, S.me, S.tv) };
}

function drawWhatIf() {
  const r = +$('#w').value, w = whatIf(r);
  $('#wOut').textContent = r;
  $('#wRes').innerHTML = `Report ${r}${r === S.tv ? ' (your true value)' : ''}: <b>${w.win ? 'selected' : 'left out'}</b>` +
    (w.win ? ` · payment ${fmt(w.p)} (${credits(w.p)} credits)` : '') + ` · utility <b>${fmt(w.u)}</b>`;

  const us = S.curve.map(c => c[1]);
  const lo = Math.min(0, ...us) - 0.5, hi = Math.max(0.5, ...us) + 0.5;
  const X = v => 44 + v * 53, Y = u => 186 - (u - lo) / (hi - lo) * 166;
  const truth = whatIf(S.tv).u;
  $('#curve').innerHTML = `
    <line x1="44" x2="574" y1="${Y(0)}" y2="${Y(0)}" class="axis0"/>
    <text x="36" y="${Y(0) + 4}" class="lab" text-anchor="end">0</text>
    ${[0, 2, 4, 6, 8, 10].map(v => `<text x="${X(v)}" y="208" class="lab" text-anchor="middle">${v}</text>`).join('')}
    <text x="574" y="200" class="lab" text-anchor="end">report →</text>
    <text x="44" y="14" class="lab">utility</text>
    <line x1="${X(S.tv)}" x2="${X(S.tv)}" y1="18" y2="188" class="truth"/>
    <text x="${X(S.tv) + 5}" y="30" class="lab truthlab">true value ${S.tv}</text>
    <polyline class="u" points="${S.curve.map(([x, u]) => `${X(x)},${Y(u)}`).join(' ')}"/>
    <circle cx="${X(r)}" cy="${Y(w.u)}" r="6" class="dot"/>`;
  const best = Math.max(...us);
  $('#wNote').textContent = truth >= best - 1e-9
    ? `No report gives more than your truthful report (utility ${fmt(truth)}). This is the rule's rational benchmark: telling the truth is a dominant strategy.`
    : `Warning: a misreport beats the truth here (${fmt(best)} vs ${fmt(truth)}). Please report this game to the team.`;
}

// ---------- IV. comparison on the Stage 2 teams + reflection ----------
function renderCompare() {
  const teams = S.teams2;
  const order = shuffle([0, 1, 2, 3, 4, 5]);
  const f = M.fcfs(teams, order), v = S.vcg2;
  // Welfare numbers use true values (rivals are truthful, so only your report can differ).
  const truthful = teams.map(t => ({ ...t, v: t.tv }));
  const mf = M.metrics(truthful, f), mv = M.metrics(truthful, v);
  const you = o => o.selected.includes(S.me) ? 'selected' : 'left out';
  S.cmp = { fcfs: you(f), fcfsU: M.utility(teams, f, S.me, S.tv) };
  $('#cmpLede').textContent = `Both rules on the Stage 2 teams. FCFS uses a fresh random arrival order: ${order.map(i => teams[i].name).join(' → ')}.`;
  const rows = [
    ['Winners', names(teams, f.selected), names(teams, v.selected)],
    ['Your team', you(f), you(v)],
    ['Your utility', fmt(S.cmp.fcfsU), fmt(M.utility(teams, v, S.me, S.tv))],
    ['Teams served', mf.served, mv.served],
    ['GPU-hours used', `${mf.gpu} / 100`, `${mv.gpu} / 100`],
    ['Total true project value', mf.value, mv.value],
    ['Total true score (value − carbon)', mf.score, mv.score],
    ['Emissions (kg CO₂e)', mf.emissions, mv.emissions],
    ['Payments (credits)', mf.credits, mv.credits],
    ['What decides', 'arrival order', 'published score rule'],
  ];
  $('#cmp').innerHTML = '<tr><th></th><th>First come, first served</th><th>Scored group selection</th></tr>' +
    rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');

  const r = teams[S.me].v;
  $('#reportQ').textContent = r === S.tv
    ? `You reported your true value (${S.tv}). Why?`
    : `You reported ${r} instead of your true value ${S.tv}. Why?`;
  summarize();
}

function summarize() {
  const t = S.teams2[S.me], v = S.vcg2, won = v.selected.includes(S.me);
  const pref = ($('input[name=pref]:checked') || {}).value || '-';
  const clean = s => s.trim().replace(/\s+/g, ' ').replace(/\|/g, '/') || '-';
  $('#summary').value = [
    `PS2-TeamA-GPU`, `Team ${t.name}`, `request ${t.d}h`, `true value ${S.tv}`, `report ${t.v}`,
    `Stage1 FCFS: ${S.fcfs1.selected.includes(S.me) ? 'served' : 'skipped'}`,
    `predicted: ${S.guess === 'yes' ? 'selected' : 'left out'}`,
    `VCG: ${won ? `selected, pays ${credits(v.payments[S.me])} credits` : 'left out'}, utility ${fmt(M.utility(S.teams2, v, S.me, S.tv))}`,
    `FCFS same teams: ${S.cmp.fcfs}, utility ${fmt(S.cmp.fcfsU)}`,
    `prefers: ${pref}`, `why report: ${clean($('#whyReport').value)}`, `surprise: ${clean($('#surprise').value)}`,
  ].join(' | ');
}

async function copySummary() {
  summarize();
  try { await navigator.clipboard.writeText($('#summary').value); }
  catch { $('#summary').select(); document.execCommand('copy'); }
  $('#copy').textContent = 'Copied ✓';
  setTimeout(() => { $('#copy').textContent = 'Copy my result'; }, 1800);
}

// ---------- wiring ----------
$('#skip').onclick = async () => { introRun++; newGame(); await go('stage1'); };
$('#replay').onclick = playIntro;
$('#d').oninput = preview1;
$('#submit1').onclick = runStage1;
$('#next1').onclick = async () => { setupStage2(); await go('stage2'); };
$('#r').oninput = preview2;
$$('.ask .btn').forEach(b => { b.onclick = () => runStage2(b.dataset.guess); });
$('#w').oninput = drawWhatIf;
$('#next2').onclick = async () => { renderCompare(); await go('compare'); };
$$('input[name=pref], #whyReport, #surprise').forEach(e => { e.oninput = summarize; });
$('#copy').onclick = copySummary;
if ($('#formLink').href.includes('REPLACE_ME')) $('#formLink').hidden = true;   // no form link yet
$('#again').onclick = async () => { newGame(); await go('stage1'); };
$('#toIntro').onclick = async () => { await go('intro'); playIntro(); };
$$('[data-about]').forEach(b => { b.onclick = async () => { if (scene !== 'about') prevScene = scene; await go('about'); }; });
$('#back').onclick = async () => { await go(prevScene); if (prevScene === 'intro') playIntro(); };

playIntro();
