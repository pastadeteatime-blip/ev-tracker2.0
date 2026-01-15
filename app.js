/* =========================
   期待値トラッカー app.js（機種ごと累計：B）
   - 機種選択（machineSelect）
   - 投資は「今回追加分」→「総投資」に積む（confirmInvest）
   - 回転数は「回転ログ（データカウンター差分）」で集計
   - 回転率は「真の回転率」：総回転数 ÷ (投資玉 + リザルト出玉 - 最終持ち玉) × 250
   - 今回表示：回した回転数 / 今回の回転率（小数1桁・切り捨て）
   - 期待値（玉）は裏で計算し、累積期待値・進捗(100万固定)に反映
   - 累計は機種ごとにlocalStorageへ保存
   - iOS連打ズーム対策は投資ボタン領域だけ
   - 機種切替時：ボーダーだけ0.15sフェード更新

   ★追加：クラッシュ対策（セッション保存）
   - 回転ログ（spinLog）と周辺状態を機種ごとに localStorage へ自動保存
   - 起動時/機種切替時に復元
   - 入力途中（counterNow/payoutNow/endBallsNow）は復元しない
   ========================= */

const GOAL_YEN = 1_000_000;            // 100万円固定（未使用でも残す）
const YEN_PER_BALL = 4;
const DEFAULT_COST_PER_1K_BALLS = 250; // 4円等価の1k=250玉基準

const TAN_PAYOUT_DISP = 400; // ログ表示用
const TAN_PAYOUT_NET  = 360; // 計算用（純増）

// ===== 機種DB =====
const MACHINES = window.MACHINES;


// localStorage keys（累計）
const LS_PREFIX = "evTracker_machineTotals_v1_"; // + machineId
const LS_SELECTED_MACHINE = "evTracker_selectedMachineId_v1";

// ★セッション（回転ログ）保存
const LS_SESSION_PREFIX = "evTracker_session_v1_"; // + machineId
function getSessionKey(machineId) {
  return `${LS_SESSION_PREFIX}${machineId}`;
}

// ===== 状態 =====
let selectedMachine = MACHINES[0];
let currentGoalIndex = 0;

// 投資（入力中＝今回追加分）
let investYen = 0;
// 総投資（計算で使う）
let confirmedInvestYen = 0;

// 機種ごとの累計（差玉ベース）
let totals = {
  totalExpectBalls: 0,
  totalSpin: 0,
  totalInvestYen: 0,
  totalKInvested: 0,
  totalConsumedK: 0,
  totalHitCount: 0,
};

// ===== 回転ログ =====
// {from, to, add, nextStart, label, payout, payoutDisp}
let spinLog = [];
let pendingIndex = -1;       // 「当たり（未確定）」のログ行 index
let nextStartCounter = 0;    // 次の「開始回転数」
let payoutConfirmIndex = -1; // 表記出玉待ち（RUSH/LT）のログ行 index
let endBallsYame = null;     // ヤメ確定の持ち玉（玉）
let endBallsPending = false; // ヤメ時に入力待ちか
let hasStarted = false;      // 開始済フラグ
let investFromStop = false;  // 投資カードに来た理由
let midCheckTempCounter = null; // 仮の現在回転数


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

// ===== 総投資 表示 =====
function renderConfirmedInvest() {
  const el = $("investConfirmed");
  if (!el) return;
  el.textContent = `総投資：${fmtInt(confirmedInvestYen)} 円`;
}

// ===== 回転ログへスクロール =====
function scrollToLogCard() {
  const card = $("logCard");
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToInvestCard() {
  const card = $("investCard");
  if (!card) return;

  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== セッション保存/復元 =====
function saveSession() {
  try {
    const key = getSessionKey(selectedMachine.id);
    const data = {
      spinLog,
      pendingIndex,
      nextStartCounter,
      payoutConfirmIndex,
      endBallsYame,
      endBallsPending,
      hasStarted,
      investYen,
      confirmedInvestYen, // ★追加
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("saveSession failed:", e);
  }
}

function loadSession() {
  try {
    const key = getSessionKey(selectedMachine.id);
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    const data = JSON.parse(raw);

    spinLog = Array.isArray(data.spinLog) ? data.spinLog : [];
    pendingIndex = Number.isFinite(data.pendingIndex) ? data.pendingIndex : -1;
    nextStartCounter = Number.isFinite(data.nextStartCounter) ? data.nextStartCounter : 0;
    payoutConfirmIndex = Number.isFinite(data.payoutConfirmIndex) ? data.payoutConfirmIndex : -1;

    endBallsYame = Number.isFinite(data.endBallsYame) ? data.endBallsYame : null;
    endBallsPending = !!data.endBallsPending;
    hasStarted = !!data.hasStarted;

    investYen = Number.isFinite(data.investYen) ? data.investYen : 0;
    setInvestYen(investYen);

    confirmedInvestYen = Number.isFinite(data.confirmedInvestYen) ? data.confirmedInvestYen : 0;
    renderConfirmedInvest();

    return true;
  } catch (e) {
    console.warn("loadSession failed:", e);
    return false;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(getSessionKey(selectedMachine.id));
  } catch {}
}

// 入力ロック
function setCounterInputLocked(locked) {
  const el = $("counterNow");
  if (!el) return;
  el.disabled = locked;
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

// ===== 回転ログリセット =====
function resetSpinLog(skipSave = false) {
  spinLog = [];
  pendingIndex = -1;
  nextStartCounter = 0;
  payoutConfirmIndex = -1;
  endBallsYame = null;
  endBallsPending = false;

  if ($("counterNow")) $("counterNow").value = "";

  $("payoutPanel")?.classList.add("is-hidden");
  if ($("payoutNow")) $("payoutNow").value = "";

  $("endBallsPanel")?.classList.add("is-hidden");
  if ($("endBallsNow")) $("endBallsNow").value = "";

  renderSpinLog();
  setLogMode("main");
  setCounterInputLocked(false);
  if (!skipSave) saveSession();
}

// ===== 開始 =====
function addStartEvent() {
  try {
    console.log("start clicked");

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

    resetSpinLog(true); // ここでは保存しない

    nextStartCounter = Math.floor(now);

    spinLog.push({
      from: nextStartCounter,
      to: null,
      add: 0,
      nextStart: nextStartCounter,
      label: "開始",
      payout: null,
      payoutDisp: null,
      startAt: nextStartCounter,
    });

    hasStarted = true;
    updateStartButton();

    if (input) input.value = "";

    renderSpinLog();
    setLogMode("main");
    saveSession();
  } catch (e) {
    console.error(e);
    alert("開始処理でエラーが出ています（Consoleを確認してください）");
  }

  setCounterInputLocked(false);
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

  const idx = spinLog.length - 1;
  const row = spinLog[idx];
  const add = now - row.from;

  row.to = now;
  row.add = add;
  row.nextStart = null;
  row.label = "当たり（未確定）";
  row.payout = null;
  row.payoutDisp = null;

  pendingIndex = idx;

  input.value = "";

  renderSpinLog();
  setLogMode("afterHit");
  setCounterInputLocked(true);
  saveSession();
  investFromStop = false;   // ← 当たり由来
  scrollToInvestCard();

  
}

// ===== 再開回転数（状態別）=====
function getRestartValue(type) {
  const map = selectedMachine?.restart || { tan: 0, rushEnd: 0, ltEnd: 0 };
  if (type === "tan") return Number(map.tan) || 0;
  if (type === "rushEnd") return Number(map.rushEnd) || 0;
  if (type === "ltEnd") return Number(map.ltEnd) || 0;
  return 0;
}

// ===== 当たり結果確定（単発は自動 / RUSH&LTは入力パネルへ）=====
function confirmHitOutcome(type) {
  if (pendingIndex === -1) {
    alert("先に「当たり」を押してください");
    return;
  }

  const nextStart = getRestartValue(type); // 仕様：固定値でOK
  const label =
    type === "charge" ? "チャージ" :
    type === "tan" ? "単発" :
    type === "rushEnd" ? "RUSH終了" : "LT終了";

  const row = spinLog[pendingIndex];
  row.nextStart = nextStart;
  row.label = label;

  nextStartCounter = nextStart;

  if (type === "tan" || type === "charge") {
  const payout =
    type === "charge"
      ? (selectedMachine.chargePayout ?? { disp: 300, net: 280 })
      : (selectedMachine.tanPayout ?? { disp: TAN_PAYOUT_DISP, net: TAN_PAYOUT_NET });

  row.payoutDisp = payout.disp;
  row.payout     = payout.net;

  pendingIndex = -1;

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
  setCounterInputLocked(false);
  saveSession();
  return;
}


  row.payout = null;
  row.payoutDisp = null;
  payoutConfirmIndex = pendingIndex;
  pendingIndex = -1;

  if ($("payoutNow")) $("payoutNow").value = "";
  $("payoutPanel")?.classList.remove("is-hidden");

  saveSession();
}

// ===== 表記出玉 確定 =====
function confirmPayout() {
  if (payoutConfirmIndex === -1) return;

  const disp = Number($("payoutNow")?.value);
  if (!Number.isFinite(disp) || disp < 0) {
    alert("リザルト表記出玉（玉）を入力してください");
    return;
  }

  const dispInt = Math.floor(disp);
  const net = calcNetFromDisplayedPayout(dispInt); // 仕様：乖離ありOK

  spinLog[payoutConfirmIndex].payoutDisp = dispInt;
  spinLog[payoutConfirmIndex].payout = net;

  payoutConfirmIndex = -1;

  $("payoutPanel")?.classList.add("is-hidden");
  if ($("payoutNow")) $("payoutNow").value = "";

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
  setCounterInputLocked(false);
  saveSession();
}

// ===== ヤメ持ち玉 確定 =====
function confirmEndBalls() {
  if (!endBallsPending) return;

  const v = Number($("endBallsNow")?.value);
  if (!Number.isFinite(v) || v < 0) {
    alert("ヤメ時の持ち玉（玉）を入力してください");
    return;
  }

  endBallsYame = Math.floor(v);
  endBallsPending = false;

  const last = spinLog[spinLog.length - 1];
  if (last && String(last.label).startsWith("ヤメ")) {
    last.label = "ヤメ";
    last.endBalls = endBallsYame;
  }

  $("endBallsPanel")?.classList.add("is-hidden");
  if ($("endBallsNow")) $("endBallsNow").value = "";

  renderSpinLog();
  setCounterInputLocked(false);
  saveSession();
  investFromStop = true;    // ← ヤメ由来
  scrollToInvestCard();

}

// ===== ひとつ戻す（安全版）=====
function undoSpinEventUnified() {
  // ヤメ持ち玉入力待ちをキャンセル
  if (endBallsPending) {
    endBallsPending = false;
    endBallsYame = null;

    $("endBallsPanel")?.classList.add("is-hidden");
    if ($("endBallsNow")) $("endBallsNow").value = "";

    const last = spinLog[spinLog.length - 1];
    if (last && String(last.label).includes("ヤメ（持ち玉未確定）")) {
      spinLog.pop();
      const prev = spinLog[spinLog.length - 1];
      nextStartCounter = Number(prev?.nextStart) || nextStartCounter;
    }

    renderSpinLog();
    setLogMode("main");
    setCounterInputLocked(false);
    saveSession();
    return;
  }

  // 表記出玉入力待ちをキャンセル
  if (payoutConfirmIndex !== -1) {
    const row = spinLog[payoutConfirmIndex];
    row.label = "当たり（未確定）";
    row.nextStart = null;
    row.payout = null;
    row.payoutDisp = null;

    pendingIndex = payoutConfirmIndex;
    payoutConfirmIndex = -1;

    $("payoutPanel")?.classList.add("is-hidden");
    if ($("payoutNow")) $("payoutNow").value = "";

    renderSpinLog();
    setLogMode("afterHit");
    setCounterInputLocked(true);
    saveSession();
    return;
  }

  // 未確定の当たり行を開始に戻す
  if (pendingIndex !== -1) {
    const row = spinLog[pendingIndex];
    row.label = "開始";
    row.to = row.from;
    row.add = 0;
    row.nextStart = row.from;
    row.payout = null;
    row.payoutDisp = null;

    pendingIndex = -1;

    renderSpinLog();
    setLogMode("main");
    setCounterInputLocked(false);
    saveSession();
    return;
  }

  // ★確定済み（単発/RUSH/LT）を「当たり（未確定）」に戻す
  if (pendingIndex === -1 && payoutConfirmIndex === -1 && spinLog.length >= 2) {
    const last = spinLog[spinLog.length - 1];
    const prev = spinLog[spinLog.length - 2];

    const prevIsOutcome =
      prev.label === "単発" || prev.label === "RUSH終了" || prev.label === "LT終了";

    const lastIsAutoStart =
      last.label === "開始" && (Number(last.add) || 0) === 0;

    if (prevIsOutcome && lastIsAutoStart) {
      spinLog.pop();

      prev.label = "当たり（未確定）";
      prev.nextStart = null;
      prev.payout = null;
      prev.payoutDisp = null;

      pendingIndex = spinLog.length - 1;

      setLogMode("afterHit");
      setCounterInputLocked(true);

      renderSpinLog();
      saveSession();
      return;
    }
  }

  // 最後のログを1つ削る（開始だけの状態も戻せる）
  if (spinLog.length === 0) return;
  spinLog.pop();

  // 開始行まで消えたら開始未実施に戻す
  if (spinLog.length === 0) {
    hasStarted = false;
    pendingIndex = -1;
    payoutConfirmIndex = -1;
    endBallsPending = false;
    endBallsYame = null;
    nextStartCounter = 0;
    setCounterInputLocked(false);
    updateStartButton();

    renderSpinLog();
    setLogMode("main");
    saveSession();
    return;
  }

  const last = spinLog[spinLog.length - 1];
  nextStartCounter = Number(last?.nextStart) || nextStartCounter;

  renderSpinLog();
  setLogMode("main");
  setCounterInputLocked(false);
  saveSession();
}

// ===== ヤメ =====
function addStopEvent() {
  if (!hasStarted || spinLog.length === 0) {
    alert("先に「開始」を押してください");
    return;
  }

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

  spinLog.push({
    from: nextStartCounter,
    to: now,
    add,
    nextStart: now,
    label: "ヤメ（持ち玉未確定）",
    payout: null,
    payoutDisp: null,
    endBalls: null,
  });

  nextStartCounter = now;
  if ($("counterNow")) $("counterNow").value = "";

  endBallsPending = true;
  if ($("endBallsNow")) $("endBallsNow").value = "";
  $("endBallsPanel")?.classList.remove("is-hidden");

  renderSpinLog();
  setLogMode("main");
  setCounterInputLocked(true);
  saveSession();
}

// ===== 機種情報 =====
function fmtBorder(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

function renderMachineInfo(animate = false) {
  const m = selectedMachine;

  const borderVal = m?.border?.[28];

  const borderEl = $("infoBorder");
  const jackpotEl = $("infoJackpot");
  const rushEl = $("infoRush");

  const borderText = `28交換ボーダー：${fmtBorder(borderVal)} 回/k`;
  const jackpotText = `図柄揃い確率：${m?.jackpot ?? "—"}`;
  const rushText = `ラッシュ突入率：${m?.rushEntry ?? "—"}`;

  // 出す順番：ボーダー → 図柄揃い確率 → 突入率
  const targets = [
    { el: borderEl, text: borderText },
    { el: jackpotEl, text: jackpotText },
    { el: rushEl, text: rushText },
  ].filter((x) => x.el);

  // 演出なし（初期表示など）
  if (!animate) {
    for (const t of targets) {
      t.el.classList.remove("is-updating", "is-revealing");
      t.el.innerText = t.text;
    }
    return;
  }

  // ① まず消す
  for (const t of targets) {
    t.el.classList.remove("is-revealing");
    t.el.classList.add("is-updating");
  }

  // ② 消えてる間に差し替え
  for (const t of targets) {
    t.el.innerText = t.text;
  }

  // ③ 順番に出す（ズラし演出）
  const baseDelay = 180; // 全体の「間」
  const stepDelay = 80;  // 0.08秒ずつ

  targets.forEach((t, i) => {
    setTimeout(() => {
      t.el.classList.remove("is-updating");
      t.el.classList.add("is-revealing");

      // アニメ終了後にクラス掃除（連続切替でも安定）
      const onEnd = () => {
        t.el.classList.remove("is-revealing");
        t.el.removeEventListener("animationend", onEnd);
      };
      t.el.addEventListener("animationend", onEnd);
    }, baseDelay + i * stepDelay);
  });
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

  sel.addEventListener("change", () => {
    const id = sel.value;
    const m = MACHINES.find((x) => x.id === id);
    if (!m) return;

    selectedMachine = m;
    updateHitButtonsForMachine();

    localStorage.setItem(LS_SELECTED_MACHINE, m.id);

    loadTotalsForSelectedMachine();

    // 入力中はクリア
    setInvestYen(0);

    hasStarted = false;
    updateStartButton();

    resetSpinLog(true);

    const restored = loadSession();
    if (restored) {
      renderSpinLog();
      if (payoutConfirmIndex !== -1) $("payoutPanel")?.classList.remove("is-hidden");
      if (endBallsPending) $("endBallsPanel")?.classList.remove("is-hidden");
      setLogMode(pendingIndex !== -1 ? "afterHit" : "main");
      updateStartButton();
    } else {
      confirmedInvestYen = 0;
      renderConfirmedInvest();
      resetSpinLog(); // 復元できない時だけ保存してOK
    }

    const resultEl = $("result");
    if (resultEl) {
      resultEl.innerText = "";
      setResultTierClass("");
    }

    updateView();
    renderMachineInfo(true);
  });
}

// ===== 機種ごとのlocalStorage（累計）=====
function getTotalsKey(machineId) {
  return `${LS_PREFIX}${machineId}`;
}

function loadTotalsForSelectedMachine() {
  const key = getTotalsKey(selectedMachine.id);
  const raw = localStorage.getItem(key);

  if (!raw) {
    totals = {
      totalExpectBalls: 0,
      totalSpin: 0,
      totalInvestYen: 0,
      totalKInvested: 0,
      totalConsumedK: 0,
      totalHitCount: 0,
    };
    return;
  }

  try {
    const obj = JSON.parse(raw);
    totals = {
      totalExpectBalls: Number(obj.totalExpectBalls) || 0,
      totalSpin: Number(obj.totalSpin) || 0,
      totalInvestYen: Number(obj.totalInvestYen) || 0,
      totalKInvested: Number(obj.totalKInvested) || 0,
      totalConsumedK: Number(obj.totalConsumedK) || 0,
      totalHitCount: Number(obj.totalHitCount) || 0,
    };
  } catch {
    totals = {
      totalExpectBalls: 0,
      totalSpin: 0,
      totalInvestYen: 0,
      totalKInvested: 0,
      totalConsumedK: 0,
      totalHitCount: 0,
    };
  }
}

function saveTotalsForSelectedMachine() {
  const key = getTotalsKey(selectedMachine.id);
  localStorage.setItem(key, JSON.stringify(totals));
}

// ===== 投資（加算式：入力中）=====
function setInvestYen(value) {
  investYen = Math.max(0, Math.round(value));
  const el = $("investYen");
  if (el) el.value = (investYen === 0 ? "" : String(investYen)); // ★0は空欄
  updateInvestButtons();
  renderConfirmedInvest();
  saveSession();
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

// ===== 総投資 =====
function confirmInvest() {
  const add = investYen;

  if (!Number.isFinite(add) || add <= 0) {
    alert("追加する投資額を入力してください");
    return;
  }

  confirmedInvestYen += add;

 const k = add / 1000;

// ★後ろから探して「回転数が増えている行（add>0）」に投資を付ける
for (let i = spinLog.length - 1; i >= 0; i--) {
  const row = spinLog[i];
  const a = Number(row.add) || 0;

  if (a > 0) {
    row.investK = (Number(row.investK) || 0) + k;
    break;
  }
}
  setInvestYen(0); // 入力中をクリア（saveSessionも走る）
  renderConfirmedInvest();
  saveSession();

  // スクロール先を分岐
if (investFromStop) {
  // ヤメ → 投資 → 次は計算
  $("finalCalcCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
} else {
  // 当たり → 投資 → 回転率チェック（ボタン位置）へ戻る
  scrollToMidCheckButton();
}

// フラグは必ずリセット
investFromStop = false;

}

function scrollToMidCheckButton() {
  const btn = $("btnMidCheck");
  if (!btn) return;
  btn.scrollIntoView({ behavior: "smooth", block: "center" });
}


// ===== 期待値計算（裏）=====
function calcExpectationBalls(rotationRate, spinCount) {
  const P = selectedMachine.perSpinPayBalls;
  const C = selectedMachine.costPer1kBalls ?? DEFAULT_COST_PER_1K_BALLS;
  const expected = spinCount * (P - C / rotationRate);
  return Math.round(expected);
}

// ★updateViewの外へ移動（グローバルにする）
function animateProgressBar(barEl, toValue, duration = 650) {
  if (!barEl) return;

  const startValue = Number(barEl.value) || 0; // 0固定じゃなく現状値から
  const endValue = Math.max(0, Number(toValue) || 0);

  const start = performance.now();

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    barEl.value = startValue + (endValue - startValue) * eased;

    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}


// ===== 画面更新 =====
function updateView() {
  // ===== 累積期待値 =====
  const totalEl = $("total");
  if (totalEl) {
    const b = totals.totalExpectBalls;
    const signText = b > 0 ? `+${fmtInt(b)}` : `${fmtInt(b)}`;
    totalEl.innerText = `累積期待値：${signText} 玉`;
    setSignedColor(totalEl, b);
  }

  // ===== 累計確率（初当たり） =====
  const spinEl = $("totalSpin");
  if (spinEl) {
    const hit = totals.totalHitCount || 0;
    const spin = totals.totalSpin || 0;

    let rateText = "—";
    if (hit > 0 && spin > 0) {
      rateText = `1/${Math.round(spin / hit)}`;
    }

    spinEl.innerText = `累計確率：${hit} / ${fmtInt(spin)} = ${rateText}`;
  }

  // ===== 累計投資 =====
  const invEl = $("totalInvest");
  if (invEl) {
    invEl.innerText = `累計投資：${fmtInt(totals.totalInvestYen)} 円`;
  }

  // ===== 累計回転率 =====
  const avgRate =
    totals.totalConsumedK > 0
      ? (totals.totalSpin / totals.totalConsumedK) * 250
      : 0;

  const rateEl = $("avgRate");
  if (rateEl) {
    rateEl.innerText = `累計回転率：${fmtRate1(avgRate)} 回/k`;
  }

  // ===== 段階目標（期待値） =====
  const totalEvYenRaw = totals.totalExpectBalls * YEN_PER_BALL;
  const totalEvYen = Math.max(0, totalEvYenRaw);

  currentGoalIndex = calcGoalIndex(totalEvYen);

  const prevGoal =
    currentGoalIndex === 0 ? 0 : GOAL_STEPS[currentGoalIndex - 1];
  const nextGoal = GOAL_STEPS[currentGoalIndex];
  const span = Math.max(1, nextGoal - prevGoal);

  const progressInStep = Math.max(
    0,
    Math.min(span, totalEvYen - prevGoal)
  );

  const goalBar = $("goalBar");
  if (goalBar) {
    goalBar.max = span;

// ★目標値を保存（アニメ用）
goalBar.dataset.targetValue = String(progressInStep);

// まず target を保存
goalBar.dataset.targetValue = String(progressInStep);

// max が変わるので、value は現在値を max 範囲に収めるだけ（0固定しない）
goalBar.value = Math.min(Number(goalBar.value) || 0, span);

// もしバーが画面内なら、今回の target までアニメする
if (goalBar.dataset.inView === "1") {
  animateProgressBar(goalBar, progressInStep, 650);
}



    goalBar.classList.remove(
      "goal-blue",
      "goal-yellow",
      "goal-green",
      "goal-red",
      "goal-rainbow"
    );
    goalBar.classList.add(getGoalColorClass(currentGoalIndex));
  }

  const percentEl = $("percent");
  if (percentEl) {
    const pct = (progressInStep / span) * 100;
    percentEl.innerText = `達成率：${fmtRate2(Math.min(100, pct))} %`;
  }

  const goalTitle = document.querySelector(".goal-title");
  if (goalTitle) {
    goalTitle.innerText = `目標期待値：${fmtInt(nextGoal)} 円`;
  }
}

// ===== 回転ログ描画 =====
function renderSpinLog() {
  const list = $("logList");

  // ===== 当日の回転数・初当たり =====
  const totalSpins = spinLog.reduce((a, x) => a + (Number(x.add) || 0), 0);
  const hitCount = spinLog.filter(x =>
    x.label === "単発" ||
    x.label === "RUSH終了" ||
    x.label === "LT終了"
  ).length;

  const hot = $("hitOverTotal");
  if (hot) {
    let rateText = "—";
    if (hitCount > 0 && totalSpins > 0) {
      rateText = `1/${Math.round(totalSpins / hitCount)}`;
    }
    hot.textContent = `${hitCount} / ${totalSpins}   =   ${rateText}`;
  }

  if (!list) return;
  list.innerHTML = "";

  // ===== ログ一覧 =====
  for (let i = 0; i < spinLog.length; i++) {
    const x = spinLog[i];

    // 表示用整形
    const fromText = (x.from === null || x.from === undefined) ? "" : x.from;
    const toText   = (x.to === null || x.to === undefined) ? "" : x.to;

    let rangeText = "";

if (x.label === "開始") {
  const s = Number(x.from);
  rangeText = Number.isFinite(s) ? `${s} ` : "";
} else {
  const fromText = (x.from === null || x.from === undefined) ? "" : x.from;
  const toText   = (x.to === null || x.to === undefined) ? "" : x.to;

  rangeText =
    toText !== ""
      ? `${fromText} → ${toText}`
      : `${fromText}`;
}

    const addText =
      x.add > 0
        ? `（+${x.add}）`
        : ""; // ★ +0回は表示しない

    const investText =
  x.investK && x.investK > 0
    ? ` / ${x.investK.toFixed(1)}k`
    : "";

    const disp = (x.payoutDisp ?? x.payout);
    const payoutText =
      (disp === null || disp === undefined)
        ? ""
        : ` / 表記出玉：${disp}玉`;

    const endBallsText =
      (x.endBalls === null || x.endBalls === undefined)
        ? ""
        : ` / 持ち玉：${x.endBalls}玉`;

    const row = document.createElement("div");
    row.className = "log-item";
    row.innerHTML = `
      <div>
        <div>${x.label}</div>
        <small>
          ${rangeText}${addText}${investText}${payoutText}${endBallsText}
        </small>
      </div>
      <div><small>#${i + 1}</small></div>
    `;
    list.appendChild(row);
  }
}


function getTotalSpinsFromLog() {
  return spinLog.reduce((a, x) => a + (Number(x.add) || 0), 0);
}

// ★純増出玉（計算用）合計
function getTotalPayoutFromLog() {
  return spinLog.reduce((sum, x) => sum + (Number(x.payout) || 0), 0);
}

// ===== 計算 =====
function calc() {
  const spinCount = getTotalSpinsFromLog();
  if (spinCount <= 0) { alert("回転ログを入れてください"); return; }
  if (payoutConfirmIndex !== -1) { alert("先に「表記出玉を確定」してください"); return; }
  if (endBallsPending) { alert("先に「持ち玉を確定」してください"); return; }
  if (endBallsYame === null || !Number.isFinite(endBallsYame) || endBallsYame < 0) {
    alert("ヤメ時の持ち玉が未確定です（ヤメ → 持ち玉を確定）"); return;
  }

  // 総投資を使用
  const investK = confirmedInvestYen / 1000;
  if (!Number.isFinite(investK) || investK <= 0) {
    alert("総投資がありません（投資額の追加 を押してください）");
    return;
  }

  const payout = getTotalPayoutFromLog();
  const endBalls = endBallsYame;
  const investBalls = investK * 250;
  const consumedBalls = investBalls + payout - endBalls;

  if (!(consumedBalls > 0)) {
    alert("出玉/持ち玉の入力が不正です（消費玉が0以下）");
    return;
  }

  const rotationRate = (spinCount / consumedBalls) * 250;
  const todayBalls = calcExpectationBalls(rotationRate, spinCount);

  // ★当日の初当たり回数
  const todayHitCount = spinLog.filter(x =>
    x.label === "単発" ||
    x.label === "RUSH終了" ||
    x.label === "LT終了"
  ).length;

  totals.totalExpectBalls += todayBalls;
  totals.totalSpin += spinCount;
  totals.totalInvestYen += confirmedInvestYen;
  totals.totalKInvested += investK;
  totals.totalHitCount += todayHitCount;
  totals.totalConsumedK += consumedBalls;

  saveTotalsForSelectedMachine();

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText =
      `回した回転数：${fmtInt(spinCount)} 回\n` +
      `今回の回転率：${fmtRate1(rotationRate)} 回/k`;

    const borderVal = selectedMachine?.border?.[28];
    setResultTierClass(getRateTierClass(rotationRate, borderVal));
  }

  hasStarted = false;
  updateStartButton();
  // resetSpinLog(); // ★当日のログは消さない（消すのは「当日のログをリセット」だけ）
  updateView();

  // ★計算後に総投資をクリア
  confirmedInvestYen = 0;
  renderConfirmedInvest();
  saveSession();

  // 入力中もクリア
  setInvestYen(0);
}

// 表記出玉 → 純増（仕様：乖離ありOK）
function calcNetFromDisplayedPayout(disp) {
  const v = Math.floor(Number(disp));
  if (!Number.isFinite(v) || v <= 0) return 0;

  const BASE_DISP = 400;
  const BASE_NET  = 360;
  const RETURN = 15;

  if (v <= BASE_DISP) return BASE_NET;

  const rest = v - BASE_DISP;
  const used = Math.floor(rest / RETURN);
  const restNet = rest - used;

  return BASE_NET + restNet;
}

// ===== リセット（選択中の機種だけ）=====
function resetSelectedMachineTotals() {
  if (!confirm(`「${selectedMachine.name}」の累積データをリセットしますか？`)) return;

  totals = {
    totalExpectBalls: 0,
    totalSpin: 0,
    totalInvestYen: 0,
    totalKInvested: 0,
    totalConsumedK: 0,
    totalHitCount: 0,
  };

  currentGoalIndex = 0;

  saveTotalsForSelectedMachine();

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText = "";
    setResultTierClass("");
  }

  hasStarted = false;
  updateStartButton();

  setInvestYen(0);
  confirmedInvestYen = 0;
  renderConfirmedInvest();

  clearSession();
  resetSpinLog(true);
  setCounterInputLocked(false);

  updateView();
}

function resetTodayLog() {
  if (!confirm("当日の回転ログをリセットしますか？")) return;

  // ★投資も当日扱いなのでリセット（累計には影響しない）
  setInvestYen(0);
  confirmedInvestYen = 0;
  renderConfirmedInvest();

  // 回転ログ系だけ初期化
  spinLog = [];
  pendingIndex = -1;
  payoutConfirmIndex = -1;
  endBallsPending = false;
  endBallsYame = null;
  nextStartCounter = 0;
  hasStarted = false;

  // 入力・UIを元に戻す
  setCounterInputLocked(false);
  updateStartButton();

  $("counterNow") && ($("counterNow").value = "");
  $("payoutPanel")?.classList.add("is-hidden");
  $("endBallsPanel")?.classList.add("is-hidden");

  renderSpinLog();
  setLogMode("main");

  // ★投資カードの表示（回した回転数 / 今回の回転率）を消す
const resultEl = $("result");
if (resultEl) {
  resultEl.innerText = "";
  setResultTierClass(""); // 色クラスもリセット（付いている場合）
}
  // ★累計は触らない／セッションだけ消す
  clearSession();
}

function calcGoalIndex(totalEvYen) {
  const v = Math.max(0, Number(totalEvYen) || 0);

  for (let i = 0; i < GOAL_STEPS.length; i++) {
    if (v < GOAL_STEPS[i]) return i;
  }
  return GOAL_STEPS.length - 1;
}

// ===== 段階目標（円）=====
const GOAL_STEPS = [
  10_000,
  30_000,
  100_000,
  500_000,
  1_000_000,
];

function getGoalColorClass(index) {
  switch (index) {
    case 0: return "goal-blue";
    case 1: return "goal-yellow";
    case 2: return "goal-green";
    case 3: return "goal-red";
    default: return "goal-rainbow";
  }
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

function updateHitOptionButtons() {
  const opts = selectedMachine.hitOptions || ["tan", "rushEnd", "ltEnd"];

  const map = {
    charge: $("btnCharge"),
    tan: $("btnTan"),
    rushEnd: $("btnRushEnd"),
    ltEnd: $("btnLtEnd"),
  };

  // いったん全部隠す
  Object.values(map).forEach((btn) => btn && btn.classList.add("is-hidden"));

  // 機種が持つものだけ表示
  for (const key of opts) {
    map[key]?.classList.remove("is-hidden");
  }
}

function updateHitButtonsForMachine() {
  const hitTypes = selectedMachine.hitTypes || [];

  document.querySelectorAll("[data-hit]").forEach((btn) => {
    const type = btn.dataset.hit;
    btn.classList.toggle("is-hidden", !hitTypes.includes(type));
  });
}

function skipInvest() {
  // 入力中の投資はゼロ扱い
  setInvestYen(0);

  // スクロール先を分岐
  if (investFromStop) {
    // ヤメ経由 → 期待値計算へ
    $("finalCalcCard")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } else {
    // 当たり経由 → 回転ログへ
    scrollToLogCard();
  }

  // フラグは必ずリセット
  investFromStop = false;
}

// 途中回転率の計算関数
function calcMidRotationRate() {
  const spinCount = getTotalSpinsFromLog();
  if (spinCount <= 0) return null;

  const investBalls = (confirmedInvestYen / 1000) * 250;
  const payout = getTotalPayoutFromLog();

  const consumedBalls = investBalls + payout;
  if (consumedBalls <= 0) return null;

  return {
    spinCount,
    rotationRate: (spinCount / consumedBalls) * 250,
  };
}

// 途中結果の表示処理
function showMidCheck() {
  if (!(confirmedInvestYen > 0)) {
    alert("投資額を追加して下さい");
    scrollToInvestCard();
    return;
  }
  const result = calcMidRotationRateB();
  // ★キャンセル時（何もしない）
if (result === undefined) {
  return;
}
// ★本当に計算できないケース
if (result === null) {
  alert("途中経過を計算できません");
  return;
}

  const { spinCount, rotationRate } = result;
  const border = selectedMachine?.border?.[28];
  updateMidRateMeter(rotationRate, border);

  const diff =
    Number.isFinite(border) ? rotationRate - border : null;

  const text =
  `<span class="mid-sub">回転数：${fmtInt(spinCount)} 回</span>\n` +
  `<span class="mid-sub">現在の回転率：${fmtRate1(rotationRate)} 回/k</span>\n` +
  `<span class="mid-sub">28交換ボーダー：${fmtRate1(border)}</span>\n` +
  (diff !== null
    ? `差：${diff >= 0 ? "+" : ""}${fmtRate1(diff)}`
    : "");


  const card = $("midCheckCard");
  const pre = $("midCheckResult");

  pre.innerHTML = text;
  card.classList.remove("is-hidden");

  setResultTierClass(getRateTierClass(rotationRate, border));
}

// 途中結果を閉じる
function closeMidCheck() {
  $("midCheckCard")?.classList.add("is-hidden");
  setResultTierClass("");
}

function getMidCheckCurrentCounter() {
  const input = $("counterNow");
  const raw = input?.value?.trim();

  // ① 先に入力されている場合
  if (raw !== "") {
    const v = Number(raw);
    if (Number.isFinite(v) && v >= nextStartCounter) {
      return Math.floor(v);
    }
  }

  // ② 入力されていない場合 → 後で聞く
  return null;
}

function promptMidCheckCounter() {
  const v = prompt(
    `現在のデータカウンター回転数を入力してください\n（開始: ${nextStartCounter} 以上）`
  );

  if (v === null) return null;

  const n = Number(v);
  if (!Number.isFinite(n) || n < nextStartCounter) {
    alert("回転数が不正です");
    return null;
  }

  return Math.floor(n);
}

function getMidCheckSpinCount(tempCounter) {
  const confirmedSpins = getTotalSpinsFromLog();

  if (spinLog.length === 0) return confirmedSpins;

  const last = spinLog[spinLog.length - 1];

  // 最後が「開始」なら、そこから仮回転数までを足す
  if (last.label === "開始") {
    const add = tempCounter - last.from;
    return confirmedSpins + Math.max(0, add);
  }

  return confirmedSpins;
}

function calcMidRotationRateB() {
  let counter = getMidCheckCurrentCounter();

  // 後出し入力ルート
  if (counter === null) {
    counter = promptMidCheckCounter();
    if (counter === null) return undefined;
  }

  const spinCount = getMidCheckSpinCount(counter);
  if (spinCount <= 0) return null;

  const investBalls = (confirmedInvestYen / 1000) * 250;
  const payout = getTotalPayoutFromLog();

  const consumedBalls = investBalls + payout;
  if (consumedBalls <= 0) return null;

  return {
    spinCount,
    rotationRate: (spinCount / consumedBalls) * 250,
  };
}

function updateMidRateMeter(rotationRate, border) {
  const meter = document.getElementById("midRateMeter");
  const needle = document.getElementById("midMeterNeedle");
  const minEl = document.getElementById("midMeterMin");
  const maxEl = document.getElementById("midMeterMax");

  if (!meter || !needle) return;

  if (!Number.isFinite(rotationRate) || !Number.isFinite(border)) {
    meter.classList.add("is-hidden");
    return;
  }

  meter.classList.remove("is-hidden");

  // 表示レンジ：ボーダー±5回/k（好みで調整OK）
  const range = 5;
  const min = border - range;
  const max = border + range;

  // 目盛り表示
  if (minEl) minEl.textContent = `${(Math.floor(min * 10) / 10).toFixed(1)}`;
  if (maxEl) maxEl.textContent = `${(Math.floor(max * 10) / 10).toFixed(1)}`;

  // 位置（0〜100%に正規化して針を動かす）
  let pct = ((rotationRate - min) / (max - min)) * 100;
  pct = Math.max(0, Math.min(100, pct));

  needle.style.left = `${pct}%`;
}

// 閉じる時に針を戻す
function closeMidCheck() {
  $("midCheckCard")?.classList.add("is-hidden");

  const needle = $("midMeterNeedle");
  if (needle) needle.style.left = "50%";
}



// ===== 初期化 =====
function init() {
  initMachineSelect();
  renderMachineInfo(false);
  updateHitButtonsForMachine();

  $("btnStart")?.addEventListener("click", addStartEvent);
  $("btnHit")?.addEventListener("click", addHitEvent);
  $("btnTan")?.addEventListener("click", () => confirmHitOutcome("tan"));
  $("btnRushEnd")?.addEventListener("click", () => confirmHitOutcome("rushEnd"));
  $("btnLtEnd")?.addEventListener("click", () => confirmHitOutcome("ltEnd"));
  $("btnUndo")?.addEventListener("click", undoSpinEventUnified);
  $("btnUndo2")?.addEventListener("click", undoSpinEventUnified);
  $("btnStop")?.addEventListener("click", addStopEvent);
  $("btnEndBallsConfirm")?.addEventListener("click", confirmEndBalls);
  $("btnPayoutConfirm")?.addEventListener("click", confirmPayout);
  $("resetLogBtn")?.addEventListener("click", resetTodayLog);
  $("btnCharge")?.addEventListener("click", () => confirmHitOutcome("charge"));
  
  $("add500")?.addEventListener("click", () => addInvest(500));
  $("add1000")?.addEventListener("click", () => addInvest(1000));
  $("add5000")?.addEventListener("click", () => addInvest(5000));
  $("sub500")?.addEventListener("click", () => subInvest(500));
  $("skipInvest")?.addEventListener("click", skipInvest);
  $("clearInvest")?.addEventListener("click", () => setInvestYen(0));

  $("btnMidCheck")?.addEventListener("click", showMidCheck);
  $("midCheckClose")?.addEventListener("click", closeMidCheck);


  // ★投資額の追加
  $("calcBtn")?.addEventListener("click", confirmInvest);

  // ★期待値計算
  $("finalCalcBtn")?.addEventListener("click", calc);

  $("resetBtn")?.addEventListener("click", resetSelectedMachineTotals);

  $("investYen")?.addEventListener("change", () => {
    const val = Number($("investYen").value);
    if (!Number.isFinite(val)) return;
    setInvestYen(val);
  });

  enableInvestFastTap(".invest-buttons");

  // ===== セッション復元 =====
  const restored = loadSession();
  if (restored) {
    renderSpinLog();
    if (payoutConfirmIndex !== -1) $("payoutPanel")?.classList.remove("is-hidden");
    if (endBallsPending) $("endBallsPanel")?.classList.remove("is-hidden");
    setLogMode(pendingIndex !== -1 ? "afterHit" : "main");
  } else {
    resetSpinLog();
    confirmedInvestYen = 0;
    renderConfirmedInvest();
  }

  currentGoalIndex = 0;
  updateStartButton();
  updateView();
  updateHitOptionButtons();
  renderMachineInfo(false);

// ===== 達成率バー：表示された瞬間に「にょい」 =====
const goalBar = $("goalBar");
if (goalBar) {
  const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      goalBar.dataset.inView = "1";

      // 表示された瞬間もアニメ（初回＆スクロール再表示でもOK）
      const target = Number(goalBar.dataset.targetValue) || 0;
      animateProgressBar(goalBar, target, 650);
    } else {
      goalBar.dataset.inView = "0";
    }
  }
   }, { threshold: 0.25 });

   io.observe(goalBar);
}

  saveSession();
}

document.addEventListener("DOMContentLoaded", init);
