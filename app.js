/* =========================
   期待値トラッカー app.js（機種ごと累計：B）
   - 機種選択（machineSelect）
   - 投資は加算式（addInvest）
   - 回転数は「回転ログ（データカウンター差分）」で集計
   - 回転率は「真の回転率」：総回転数 ÷ (投資玉 + リザルト出玉 - 最終持ち玉) × 250
   - 今回表示：回した回転数 / 今回の回転率（小数1桁・切り捨て）
   - 期待値（玉）は裏で計算し、累積期待値・進捗(100万固定)に反映
   - 累計は機種ごとにlocalStorageへ保存
   - iOS連打ズーム対策は投資ボタン領域だけ
   - 機種切替時：ボーダーだけ0.15sフェード更新

   ★今回の議題対応
   - 単発：表記出玉 400 を自動確定（ログに併記）
   - RUSH/LT：表記出玉の入力パネルを表示→「確定」ボタンで確定（ログに併記）
   - 表記出玉は常時入力欄ではなく、ログの流れの中で確定する
   ========================= */

const GOAL_YEN = 1_000_000;            // 100万円固定
const YEN_PER_BALL = 4;
const DEFAULT_COST_PER_1K_BALLS = 250; // 4円等価の1k=250玉基準

const TAN_PAYOUT_DISP = 400; // ログ表示用
const TAN_PAYOUT_NET  = 360; // 計算用（純増）


// ===== 機種DB =====
const MACHINES = [
  {
    id: "madoka3",
    name: "P魔法少女まどか☆マギカ3",
    perSpinPayBalls: 14.85,
    costPer1kBalls: 250,
    border: { 25: 17.1, 28: 18.0, 30: 18.5, 33: 19.2 },
    jackpot: "1/199",
    rushEntry: "50%",
    restart: { tan: 0, rushEnd: 64, ltEnd: 124 },
    payoutRule: {
    baseDisp: 400,   // 初当たり 表記
    baseNet: 360,    // 初当たり 純増
    stepDisp: 1500,  // 以降の増分（表記）
    stepNet: 1400,   // 以降の増分（純増）
    unit: 15,        // 表記は15の倍数
},

  },
  {
    id: "megamiCafe",
    name: "e女神のカフェテラスFLX",
    perSpinPayBalls: 9.37,
    costPer1kBalls: 250,
    border: { 25: 27.4, 28: 28.9, 30: 29.8, 33: 31.2 },
    jackpot: "1/399",
    rushEntry: "40%",
    restart: { tan: 0, rushEnd: 100 },
  },
  {
    id: "shamanking",
    name: "eシャーマンキング でっけぇなあver.",
    perSpinPayBalls: 8.08,
    costPer1kBalls: 250,
    border: { 25: 31.7, 28: 33.5, 30: 34.6, 33: 36.2 },
    jackpot: "1/349",
    rushEntry: "50%",
    restart: { tan: 0, rushEnd: 60, ltEnd: 120 },
  },
];

// localStorage keys
const LS_PREFIX = "evTracker_machineTotals_v1_"; // + machineId
const LS_SELECTED_MACHINE = "evTracker_selectedMachineId_v1";

// ===== 状態 =====
let selectedMachine = MACHINES[0];
let investYen = 0;

// 機種ごとの累計（差玉ベース）
let totals = {
  totalExpectBalls: 0,
  totalSpin: 0,
  totalInvestYen: 0,
  totalKInvested: 0,
};

// ===== 回転ログ =====
// {from, to, add, nextStart, label, payout}
let spinLog = [];
let pendingIndex = -1;       // 「当たり（未確定）」のログ行 index
let nextStartCounter = 0;    // 次の「開始回転数」
let payoutConfirmIndex = -1; // 表記出玉待ち（RUSH/LT）のログ行 index
let endBallsYame = null;     // ヤメ確定の持ち玉（玉）
let endBallsPending = false; // ヤメ時に入力待ちか
let hasStarted = false;      // 開始済フラグ


// ===== DOM helper =====
function $(id) {
  return document.getElementById(id);
}

function fmtInt(n) {
  return Math.round(n).toLocaleString("ja-JP");
}
function fmtRate2(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
// 表示専用：回転率（小数1桁・切り捨て）
function fmtRate1(n) {
  if (!Number.isFinite(n)) return "0.0";
  return (Math.floor(n * 10) / 10).toFixed(1);
}

function setSignedColor(el, val) {
  if (!el) return;
  if (val > 0) el.style.color = "#2563eb";
  else if (val < 0) el.style.color = "#dc2626";
  else el.style.color = "";
}

// ===== 回転率 tier =====
function getRateTierClass(rate, border) {
  if (!Number.isFinite(rate) || !Number.isFinite(border)) return "";
  const d = rate - border;
  if (d < 0) return "tier-bad";
  if (d <= 1.0) return "tier-blue";
  if (d <= 2.0) return "tier-green";
  return "tier-purple";
}

function setResultTierClass(tierClass) {
  const el = $("result");
  if (!el) return;
  el.classList.remove("tier-bad", "tier-blue", "tier-green", "tier-purple");
  if (tierClass) el.classList.add(tierClass);
}

// ===== ボタン表示切替 =====
function setLogMode(mode) {
  const main = $("logActionsMain");
  const after = $("logActionsAfter");
  if (!main || !after) return;

  if (mode === "afterHit") {
    main.classList.add("is-hidden");
    after.classList.remove("is-hidden");
  } else {
    after.classList.add("is-hidden");
    main.classList.remove("is-hidden");
  }
}

function updateStartButton() {
  const btn = $("btnStart");
  if (!btn) return;

  if (hasStarted) {
    btn.disabled = true;
    btn.textContent = "開始済";
    btn.classList.add("is-disabled");
  } else {
    btn.disabled = false;
    btn.textContent = "開始";
    btn.classList.remove("is-disabled");
  }
}

// ===== 回転ログリセット（グローバルに置く）=====
function resetSpinLog() {
  spinLog = [];
  pendingIndex = -1;
  nextStartCounter = 0;
  payoutConfirmIndex = -1;
  endBallsYame = null;
  endBallsPending = false;

  if ($("counterNow")) $("counterNow").value = "";

  // パネル閉じる
  $("payoutPanel")?.classList.add("is-hidden");
  if ($("payoutNow")) $("payoutNow").value = "";

  renderSpinLog();
$("endBallsPanel")?.classList.add("is-hidden");
if ($("endBallsNow")) $("endBallsNow").value = "";


  setLogMode("main");
}

// ===== 開始 =====
function addStartEvent() {
  const input = $("counterNow");
  const raw = input?.value?.trim();
  if (!raw) {
    alert("データカウンター回転数を入力してください");
    return;
  }

  const now = Number(raw);
  if (!Number.isFinite(now) || now < 0) {
    alert("回転数を正しく入力してください");
    return;
  }

  resetSpinLog();
  nextStartCounter = Math.floor(now);

  // 開始ログ
  spinLog.push({
    from: nextStartCounter,
    to: nextStartCounter,
    add: 0,
    nextStart: nextStartCounter,
    label: "開始",
    payout: null,
  });

  hasStarted = true;
  updateStartButton();

  input.value = "";
  renderSpinLog();
  setLogMode("main");
}

// ===== 当たり =====
function addHitEvent() {
  if (pendingIndex !== -1) {
    alert("当たり種別（単発 / RUSH / LT）を先に選んでください");
    return;
  }
  if (payoutConfirmIndex !== -1) {
    alert("先に「表記出玉を確定」してください");
    return;
  }

  // 最後が「開始」であること
  if (spinLog.length === 0 || spinLog[spinLog.length - 1].label !== "開始") {
    alert("先に「開始」を押してください");
    return;
  }

  const input = $("counterNow");
  const raw = input?.value?.trim();
  if (!raw) {
    alert("当たった時点のデータカウンター回転数を入力してください");
    return;
  }

  const now = Number(raw);
  if (!Number.isFinite(now) || now < nextStartCounter) {
    alert(`回転数が不正です（開始 ${nextStartCounter} 以上）`);
    return;
  }

  // 最後の「開始」行を当たり行に上書き
  const idx = spinLog.length - 1;
  const row = spinLog[idx];
  const add = now - row.from;

  row.to = now;
  row.add = add;
  row.nextStart = null; // 未確定
  row.label = "当たり（未確定）";
  row.payout = null;

  pendingIndex = idx;

  input.value = "";
  renderSpinLog();
  setLogMode("afterHit");
}

// ===== 再開回転数（状態別）=====
function getRestartValue(type) {
  const map = selectedMachine?.restart || { tan: 0, rushEnd: 0, ltEnd: 0 };
  if (type === "tan") return Number(map.tan) || 0;
  if (type === "rushEnd") return Number(map.rushEnd) || 0;
  if (type === "ltEnd") return Number(map.ltEnd) || 0;
  return 0;
}

// ===== 当たり結果確定（単発は自動400 / RUSH&LTは入力パネルへ）=====
function confirmHitOutcome(type) {
  if (pendingIndex === -1) {
    alert("先に「当たり」を押してください");
    return;
  }

  const nextStart = getRestartValue(type);
  const label =
    type === "tan" ? "単発" :
    type === "rushEnd" ? "RUSH終了" : "LT終了";

  const row = spinLog[pendingIndex];
  row.nextStart = nextStart;
  row.label = label;

  // 次の開始回転数はここで確定
  nextStartCounter = nextStart;

  if (type === "tan") {
    // 単発は表記出玉400で自動確定（純増は360）
   // 単発は「表示400 / 計算360」
  row.payoutDisp = TAN_PAYOUT_DISP;
  row.payout     = TAN_PAYOUT_NET;

    pendingIndex = -1;

    // 次の開始ログを自動追加
    spinLog.push({
      from: nextStartCounter,
      to: nextStartCounter,
      add: 0,
      nextStart: nextStartCounter,
      label: "開始",
      payout: null,
    });

    renderSpinLog();
    setLogMode("main");
    return;
  }

  // RUSH/LT：表記出玉の入力待ち
  row.payout = null;
  row.payoutDisp = null;
  payoutConfirmIndex = pendingIndex;
  pendingIndex = -1;

  // 入力パネル表示
  $("payoutNow").value = "";
  $("payoutPanel")?.classList.remove("is-hidden");
}

// ===== 表記出玉 確定ボタン =====
function confirmPayout() {
  if (payoutConfirmIndex === -1) return;

  const disp = Number($("payoutNow")?.value);
  if (!Number.isFinite(disp) || disp < 0) {
    alert("リザルト表記出玉（玉）を入力してください");
    return;
  }

  const dispInt = Math.floor(disp);
  const net = calcNetFromDisplayedPayout(dispInt); // ★ここが新ロジック（チェック無し）

  // 表示用 / 計算用
  spinLog[payoutConfirmIndex].payoutDisp = dispInt;
  spinLog[payoutConfirmIndex].payout = net;

  payoutConfirmIndex = -1;

  $("payoutPanel")?.classList.add("is-hidden");
  if ($("payoutNow")) $("payoutNow").value = "";

  // 次の開始ログ（あなたの仕様）
  spinLog.push({
    from: nextStartCounter,
    to: nextStartCounter,
    add: 0,
    nextStart: nextStartCounter,
    label: "開始",
    payout: null,
    payoutDisp: null,
  });

  renderSpinLog();
  setLogMode("main");
}



function confirmEndBalls() {
  if (!endBallsPending) return;

  const v = Number($("endBallsNow")?.value);
  if (!Number.isFinite(v) || v < 0) {
    alert("ヤメ時の持ち玉（玉）を入力してください");
    return;
  }

  endBallsYame = Math.floor(v);
  endBallsPending = false;

  // 最後のヤメ行のラベルを確定に変える
  const last = spinLog[spinLog.length - 1];
  if (last && String(last.label).startsWith("ヤメ")) {
    last.label = "ヤメ";
  }

  $("endBallsPanel")?.classList.add("is-hidden");
  if ($("endBallsNow")) $("endBallsNow").value = "";

  renderSpinLog();
}

// ===== ひとつ戻す（最低限：安全に動く版）=====
function undoSpinEventUnified() {
  // 表記出玉入力待ちをキャンセル
  if (payoutConfirmIndex !== -1) {
    // 対象行を「当たり（未確定）」に戻す
    const row = spinLog[payoutConfirmIndex];
    row.label = "当たり（未確定）";
    row.nextStart = null;
    row.payout = null;

    pendingIndex = payoutConfirmIndex;
    payoutConfirmIndex = -1;

    $("payoutPanel")?.classList.add("is-hidden");
    if ($("payoutNow")) $("payoutNow").value = "";

    renderSpinLog();
    setLogMode("afterHit");
    return;
  }

  // 未確定の当たり行を消す（＝開始に戻す）
  if (pendingIndex !== -1) {
    const row = spinLog[pendingIndex];
    row.label = "開始";
    row.to = row.from;
    row.add = 0;
    row.nextStart = row.from;
    row.payout = null;

    pendingIndex = -1;

    renderSpinLog();
    setLogMode("main");
    return;
  }

  // それ以外：最後のログを1つ削る（開始だけ残すのは好み）
  if (spinLog.length <= 1) return;
  spinLog.pop();

  // nextStartCounter を末尾に合わせる
  const last = spinLog[spinLog.length - 1];
  nextStartCounter = Number(last?.nextStart) || nextStartCounter;

  renderSpinLog();
  setLogMode("main");
}

// ===== ヤメ =====
function addStopEvent() {
  if (pendingIndex !== -1) {
    alert("当たり種別（単発 / RUSH / LT）を先に選んでください");
    return;
  }
  if (payoutConfirmIndex !== -1) {
    alert("先に「表記出玉を確定」してください");
    return;
  }
  if (endBallsPending) {
    alert("先に「持ち玉を確定」してください");
    return;
  }

  const raw = $("counterNow")?.value?.trim();
  const now = raw === "" ? nextStartCounter : Number(raw);

  if (!Number.isFinite(now) || now < nextStartCounter) {
    alert(`回転数が不正です（開始 ${nextStartCounter} 以上）`);
    return;
  }

  const add = now - nextStartCounter;

  // ヤメログを追加（持ち玉は未確定）
  spinLog.push({
    from: nextStartCounter,
    to: now,
    add,
    nextStart: now,
    label: "ヤメ（持ち玉未確定）",
    payout: null,
  });

  nextStartCounter = now;
  if ($("counterNow")) $("counterNow").value = "";

  // 持ち玉入力パネルを表示
  endBallsPending = true;
  $("endBallsNow").value = "";
  $("endBallsPanel")?.classList.remove("is-hidden");

  renderSpinLog();
  setLogMode("main");
}


// ===== 機種情報 =====
function fmtBorder(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function renderMachineInfo(animateBorder = false) {
  const m = selectedMachine;
  const borderVal = m?.border?.[28];

  const borderEl = $("infoBorder");
  const jackpotEl = $("infoJackpot");
  const rushEl = $("infoRush");

  const borderText = `28交換ボーダー：${fmtBorder(borderVal)} 回/k`;

  if (borderEl) {
    if (animateBorder) {
      borderEl.classList.add("is-updating");
      setTimeout(() => {
        borderEl.innerText = borderText;
        borderEl.classList.remove("is-updating");
      }, 150);
    } else {
      borderEl.innerText = borderText;
    }
  }

  jackpotEl && (jackpotEl.innerText = `図柄揃い確率：${m?.jackpot ?? "—"}`);
  rushEl && (rushEl.innerText = `ラッシュ突入率：${m?.rushEntry ?? "—"}`);
}

// ===== 機種セレクト =====
function initMachineSelect() {
  const sel = $("machineSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const m of MACHINES) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  }

  const savedId = localStorage.getItem(LS_SELECTED_MACHINE);
  const found = MACHINES.find((m) => m.id === savedId);
  selectedMachine = found || MACHINES[0];
  sel.value = selectedMachine.id;

  loadTotalsForSelectedMachine();
  updateView();
  renderMachineInfo(false);

  sel.addEventListener("change", () => {
    const id = sel.value;
    const m = MACHINES.find((x) => x.id === id);
    if (!m) return;

    selectedMachine = m;
    localStorage.setItem(LS_SELECTED_MACHINE, m.id);

    loadTotalsForSelectedMachine();
    setInvestYen(0);

    // 機種切替で開始を復活
    hasStarted = false;
    updateStartButton();

    // 回転ログリセット
    resetSpinLog();

    const resultEl = $("result");
    if (resultEl) {
      resultEl.innerText = "";
      setResultTierClass("");
    }

    if ($("endBalls")) $("endBalls").value = "";

    updateView();
    renderMachineInfo(true);
  });
}

// ===== 機種ごとのlocalStorage =====
function getTotalsKey(machineId) {
  return `${LS_PREFIX}${machineId}`;
}

function loadTotalsForSelectedMachine() {
  const key = getTotalsKey(selectedMachine.id);
  const raw = localStorage.getItem(key);

  if (!raw) {
    totals = { totalExpectBalls: 0, totalSpin: 0, totalInvestYen: 0, totalKInvested: 0 };
    return;
  }

  try {
    const obj = JSON.parse(raw);
    totals = {
      totalExpectBalls: Number(obj.totalExpectBalls) || 0,
      totalSpin: Number(obj.totalSpin) || 0,
      totalInvestYen: Number(obj.totalInvestYen) || 0,
      totalKInvested: Number(obj.totalKInvested) || 0,
    };
  } catch {
    totals = { totalExpectBalls: 0, totalSpin: 0, totalInvestYen: 0, totalKInvested: 0 };
  }
}

function saveTotalsForSelectedMachine() {
  const key = getTotalsKey(selectedMachine.id);
  localStorage.setItem(key, JSON.stringify(totals));
}

// ===== 投資（加算式）=====
function setInvestYen(value) {
  investYen = Math.max(0, Math.round(value));
  const el = $("investYen");
  if (el) el.value = investYen;
  updateInvestButtons();
}

function addInvest(amount) {
  setInvestYen(investYen + amount);
}
function subInvest(amount) {
  setInvestYen(investYen - amount);
}
function updateInvestButtons() {
  $("sub500") && ($("sub500").disabled = investYen < 500);
}

// ===== 期待値計算（裏）=====
function calcExpectationBalls(rotationRate, spinCount) {
  const P = selectedMachine.perSpinPayBalls;
  const C = selectedMachine.costPer1kBalls ?? DEFAULT_COST_PER_1K_BALLS;
  const expected = spinCount * (P - C / rotationRate);
  return Math.round(expected);
}

// ===== 画面更新 =====
function updateView() {
  const totalEl = $("total");
  if (totalEl) {
    const b = totals.totalExpectBalls;
    const signText = b > 0 ? `+${fmtInt(b)}` : `${fmtInt(b)}`;
    totalEl.innerText = `累積期待値：${signText} 玉`;
    setSignedColor(totalEl, b);
  }

  const spinEl = $("totalSpin");
  if (spinEl) spinEl.innerText = `累計回転数：${fmtInt(totals.totalSpin)}`;

  const invEl = $("totalInvest");
  if (invEl) invEl.innerText = `累計投資：${fmtInt(totals.totalInvestYen)} 円`;

  const avgRate = totals.totalKInvested > 0 ? totals.totalSpin / totals.totalKInvested : 0;
  const rateEl = $("avgRate");
  if (rateEl) rateEl.innerText = `累計回転率：${fmtRate2(avgRate)} 回/k`;

  const totalEvYen = totals.totalExpectBalls * YEN_PER_BALL;

  const goalBar = $("goalBar");
  if (goalBar) {
    goalBar.max = GOAL_YEN;
    goalBar.value = Math.max(0, Math.min(GOAL_YEN, totalEvYen));
  }

  const percentEl = $("percent");
  if (percentEl) {
    const pct = GOAL_YEN > 0 ? (totalEvYen / GOAL_YEN) * 100 : 0;
    percentEl.innerText = `達成率：${fmtRate2(Math.max(0, pct))} %`;
  }
}

// ===== 回転ログ描画 =====
function renderSpinLog() {
  const list = $("logList");

  const totalSpins = spinLog.reduce((a, x) => a + (Number(x.add) || 0), 0);
  const hitCount = spinLog.filter(x =>
    x.label === "単発" ||
    x.label === "RUSH終了" ||
    x.label === "LT終了"
  ).length;

  const hot = $("hitOverTotal");
  if (hot) hot.textContent = `${hitCount} / ${totalSpins}`;

  if (!list) return;
  list.innerHTML = "";

  for (let i = 0; i < spinLog.length; i++) {
    const x = spinLog[i];

    const disp = (x.payoutDisp ?? x.payout);
    const payoutText =
     +(disp === null || disp === undefined) ? "" : ` / 表記出玉：${disp}玉`;


    const row = document.createElement("div");
    row.className = "log-item";
    row.innerHTML = `
      <div>
        <div>${x.label}</div>
        <small>${x.from} → ${x.to}（+${x.add}回）${payoutText}</small>
      </div>
      <div><small>#${i + 1}</small></div>
    `;
    list.appendChild(row);
  }
}

function getTotalSpinsFromLog() {
  return spinLog.reduce((a, x) => a + (Number(x.add) || 0), 0);
}

function getHitCountFromLog() {
  return spinLog.filter(x =>
    x.label === "当たり（未確定）" ||
    x.label === "単発" ||
    x.label === "RUSH終了" ||
    x.label === "LT終了"
  ).length;
}

// ★表記出玉（ログ）合計
function getTotalPayoutFromLog() {
  return spinLog.reduce((sum, x) => sum + (Number(x.payout) || 0), 0);
}

// ===== 計算 =====
function calc() {
  const spinCount = getTotalSpinsFromLog();
  if (spinCount <= 0) {
    alert("回転ログを入れてください");
    return;
  }

  if (payoutConfirmIndex !== -1) {
    alert("先に「表記出玉を確定」してください");
    return;
  }

  // ★ヤメ持ち玉が未確定なら計算させない
  if (endBallsPending) {
    alert("先に「持ち玉を確定」してください");
    return;
  }
  if (endBallsYame === null || !Number.isFinite(endBallsYame) || endBallsYame < 0) {
    alert("ヤメ時の持ち玉が未確定です（ヤメ → 持ち玉を確定）");
    return;
  }

  const investK = investYen / 1000;
  if (!Number.isFinite(investK) || investK <= 0) {
    alert("投資額を追加してください（+1000円など）");
    return;
  }

  // 表記出玉はログ合計（単発400は自動で入っている）
  const payout = getTotalPayoutFromLog();

  // ★ここが変更点：確定値から持ち玉を取る
  const endBalls = endBallsYame;

  const investBalls = investK * 250;
  const consumedBalls = investBalls + payout - endBalls;

  if (!(consumedBalls > 0)) {
    alert("出玉/持ち玉の入力が不正です（消費玉が0以下）");
    return;
  }

  const rotationRate = (spinCount / consumedBalls) * 250;

  const todayBalls = calcExpectationBalls(rotationRate, spinCount);

  totals.totalExpectBalls += todayBalls;
  totals.totalSpin += spinCount;
  totals.totalInvestYen += investYen;
  totals.totalKInvested += investK;

  saveTotalsForSelectedMachine();

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText =
      `回した回転数：${fmtInt(spinCount)} 回\n` +
      `今回の回転率：${fmtRate1(rotationRate)} 回/k`;

    const borderVal = selectedMachine?.border?.[28];
    setResultTierClass(getRateTierClass(rotationRate, borderVal));
  }

  updateView();
  setInvestYen(0);
}

// 表記出玉から純増への変換
function calcNetFromDisplayedPayout(disp) {
  const v = Math.floor(Number(disp));
  if (!Number.isFinite(v) || v <= 0) return 0;

  // 初当たり：表記400 / 純増360 固定
  const BASE_DISP = 400;
  const BASE_NET  = 360;

  // 15個返し：純増 = 表記 - 表記/15
  const RETURN = 15;

  if (v <= BASE_DISP) return BASE_NET; // 400以下はとりあえず360扱い（実戦ではほぼ起きない）

  const rest = v - BASE_DISP;                 // RUSH/LT分の表記合計
  const used = Math.floor(rest / RETURN);     // 消化（= 表記/15）
  const restNet = rest - used;                // RUSH/LT分の純増

  return BASE_NET + restNet;
}



// ===== リセット（選択中の機種だけ）=====
function resetSelectedMachineTotals() {
  if (!confirm(`「${selectedMachine.name}」の累積データをリセットしますか？`)) return;

  totals = { totalExpectBalls: 0, totalSpin: 0, totalInvestYen: 0, totalKInvested: 0 };
  saveTotalsForSelectedMachine();

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText = "";
    setResultTierClass("");
  }

  hasStarted = false;
  updateStartButton();

  setInvestYen(0);
  resetSpinLog();
  if ($("endBalls")) $("endBalls").value = "";

  updateView();
}

// ===== iOS: 投資ボタンの連打ズーム対策（投資ボタンだけ） =====
function enableInvestFastTap(areaSelector) {
  const area = document.querySelector(areaSelector);
  if (!area) return;

  let suppressUntil = 0;
  let allowSyntheticClick = false;

  area.addEventListener(
    "touchend",
    (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const now = Date.now();
      e.preventDefault();

      suppressUntil = now + 700;

      allowSyntheticClick = true;
      btn.click();
      allowSyntheticClick = false;
    },
    { passive: false }
  );

  area.addEventListener(
    "click",
    (e) => {
      const now = Date.now();
      if (allowSyntheticClick) return;
      if (now < suppressUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  area.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  area.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  area.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });
}

// ===== 初期化 =====
function init() {
  initMachineSelect();
  renderMachineInfo(false);

  // 回転ログのボタン
  $("btnStart")?.addEventListener("click", addStartEvent);
  $("btnHit")?.addEventListener("click", addHitEvent);
  $("btnTan")?.addEventListener("click", () => confirmHitOutcome("tan"));
  $("btnRushEnd")?.addEventListener("click", () => confirmHitOutcome("rushEnd"));
  $("btnLtEnd")?.addEventListener("click", () => confirmHitOutcome("ltEnd"));
  $("btnUndo")?.addEventListener("click", undoSpinEventUnified);
  $("btnUndo2")?.addEventListener("click", undoSpinEventUnified);
  $("btnStop")?.addEventListener("click", addStopEvent);
  $("btnEndBallsConfirm")?.addEventListener("click", confirmEndBalls);


  // 表記出玉 確定
  $("btnPayoutConfirm")?.addEventListener("click", confirmPayout);

  updateStartButton();
  setLogMode("main");

  // 投資ボタン
  $("add500")?.addEventListener("click", () => addInvest(500));
  $("add1000")?.addEventListener("click", () => addInvest(1000));
  $("add5000")?.addEventListener("click", () => addInvest(5000));
  $("sub500")?.addEventListener("click", () => subInvest(500));
  $("clearInvest")?.addEventListener("click", () => setInvestYen(0));

  // 計算ボタン
  $("calcBtn")?.addEventListener("click", calc);

  // リセットボタン（機種ごと）
  $("resetBtn")?.addEventListener("click", resetSelectedMachineTotals);

  // 手打ち投資
  $("investYen")?.addEventListener("change", () => {
    const val = Number($("investYen").value);
    if (!Number.isFinite(val)) return;
    setInvestYen(val);
  });

  // 投資ボタンだけ連打ズーム対策
  enableInvestFastTap(".invest-buttons");

  // 初期化
  setInvestYen(0);
  updateView();
  renderMachineInfo(false);
  resetSpinLog();
}

document.addEventListener("DOMContentLoaded", init);
