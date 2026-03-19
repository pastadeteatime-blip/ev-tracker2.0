/* =========================
   期待値トラッカー app.js
   ========================= */

const GOAL_YEN = 1_000_000;
const YEN_PER_BALL = 4;
const DEFAULT_COST_PER_1K_BALLS = 250;

const TAN_PAYOUT_DISP = 400;
const TAN_PAYOUT_NET  = 360;

// ===== 機種DB =====
const MACHINES = window.MACHINES;

// localStorage keys（累計）
const LS_PREFIX = "evTracker_machineTotals_v1_";
const LS_SELECTED_MACHINE = "evTracker_selectedMachineId_v1";
const LS_SELECTED_EXCHANGE = "evTracker_selectedExchange_v1";
const LS_FAVORITE_MACHINES = "evTracker_favoriteMachineIds_v1";

// セッション保存
const LS_SESSION_PREFIX = "evTracker_session_v1_";
function getSessionKey(machineId) {
  return `${LS_SESSION_PREFIX}${machineId}`;
}

// ===== 状態 =====
let selectedMachine = MACHINES[0];
let currentGoalIndex = 0;
let selectedExchange = 28;

// 投資
let investYen = 0;
let confirmedInvestYen = 0;

// 累計
let totals = {
  totalExpectBalls: 0,
  totalSpin: 0,
  totalInvestYen: 0,
  totalKInvested: 0,
  totalConsumedK: 0,
  totalHitCount: 0,
};

// 回転ログ
let spinLog = [];
let pendingIndex = -1;
let nextStartCounter = 0;
let payoutConfirmIndex = -1;
let endBallsYame = null;
let endBallsPending = false;
let hasStarted = false;
let investFromStop = false;
let midCheckTempCounter = null;
let isSwitchingMachine = false;
let lastConfirmedInvestYen = 0;
let lastMidCheckBalls = null;
let rushEndAdjustIndex = -1;

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

// ===== スクロール =====
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

function scrollToMidCheckButton() {
  const btn = $("btnMidCheck");
  if (!btn) return;
  btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ===== セッション保存/復元 =====
function saveSession() {
  if (isSwitchingMachine) return;
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
      confirmedInvestYen,
      lastMidCheckBalls,
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
    setInvestYen(investYen, true);

    confirmedInvestYen = Number.isFinite(data.confirmedInvestYen) ? data.confirmedInvestYen : 0;
    renderConfirmedInvest();

    lastMidCheckBalls = Number.isFinite(data.lastMidCheckBalls) ? data.lastMidCheckBalls : null;

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

function getCurrentBorder() {
  return selectedMachine?.border?.[selectedExchange];
}

function getFavoriteMachineIds() {
  try {
    const raw = localStorage.getItem(LS_FAVORITE_MACHINES);
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFavoriteMachineIds(ids) {
  localStorage.setItem(LS_FAVORITE_MACHINES, JSON.stringify(ids));
}

function isFavoriteMachine(machineId) {
  return getFavoriteMachineIds().includes(machineId);
}

function toggleFavoriteMachine(machineId) {
  const ids = getFavoriteMachineIds();
  const next = ids.includes(machineId)
    ? ids.filter(id => id !== machineId)
    : [...ids, machineId];
  saveFavoriteMachineIds(next);
}

function getSortedMachines() {
  const favIds = getFavoriteMachineIds();

  const favs = MACHINES.filter(m => favIds.includes(m.id));
  const others = MACHINES.filter(m => !favIds.includes(m.id));

  return [...favs, ...others];
}

function renderFavoriteButton() {
  const btn = $("favoriteBtn");
  if (!btn) return;

  const fav = isFavoriteMachine(selectedMachine.id);
  btn.textContent = fav ? "★ お気に入り" : "☆ お気に入り";
}

// ===== 入力ロック =====
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
  updateRushEndAdjustUI();
}

function updateRushEndAdjustUI() {
  const row = $("rushEndAdjustRow");
  if (!row) return;

  const canUse = selectedMachine?.rushEndAdjustable;
  const isAfter = !$("logActionsAfter")?.classList.contains("is-hidden");

  if (canUse && isAfter) {
    row.classList.remove("is-hidden");
  } else {
    row.classList.add("is-hidden");
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
  lastMidCheckBalls = null;

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
    investFromStop = false;
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
  investFromStop = false;
  scrollToInvestCard();
}

// ===== 再開回転数 =====
function getRestartValue(type) {
  const map = selectedMachine?.restart || { tan: 0, rushEnd: 0, ltEnd: 0 };

  if (type === "tan") return Number(map.tan) || 0;

  if (type === "rushEnd") {
    let base = Number(map.rushEnd) || 0;

    if (selectedMachine?.rushEndAdjustable) {
      const add = Number($("rushEndAdjust")?.value) || 0;
      base += add;
    }

    return base;
  }

  if (type === "ltEnd") return Number(map.ltEnd) || 0;

  return 0;
}

// ===== 当たり結果確定 =====
function confirmHitOutcome(type) {
  if (pendingIndex === -1) {
    alert("先に「当たり」を押してください");
    return;
  }

  const nextStart = getRestartValue(type);
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
    row.payout = payout.net;

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
  const net = calcNetFromDisplayedPayout(dispInt);

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
  investFromStop = true;
  scrollToInvestCard();
}

// ===== ひとつ戻す =====
function undoSpinEventUnified() {
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

  if (pendingIndex === -1 && payoutConfirmIndex === -1 && spinLog.length >= 2) {
    const last = spinLog[spinLog.length - 1];
    const prev = spinLog[spinLog.length - 2];

    const prevIsOutcome =
      prev.label === "単発" || prev.label === "RUSH終了" || prev.label === "LT終了" || prev.label === "チャージ";

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

  if (spinLog.length === 0) return;
  spinLog.pop();

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

  if (Number.isFinite(lastMidCheckBalls) && lastMidCheckBalls >= 0) {
    endBallsYame = Math.floor(lastMidCheckBalls);
    endBallsPending = false;

    const last = spinLog[spinLog.length - 1];
    if (last && String(last.label).startsWith("ヤメ")) {
      last.label = "ヤメ";
      last.endBalls = endBallsYame;
    }

    $("endBallsPanel")?.classList.add("is-hidden");
    if ($("endBallsNow")) $("endBallsNow").value = "";

    renderSpinLog();
    setLogMode("main");
    setCounterInputLocked(false);
    saveSession();
    investFromStop = true;
    scrollToInvestCard();
    return;
  }

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

  const borderVal = m?.border?.[selectedExchange];

  const borderEl = $("infoBorder");
  const jackpotEl = $("infoJackpot");
  const rushEl = $("infoRush");

  const borderText = `${selectedExchange}ボーダー：${fmtBorder(borderVal)} 回/k`;
  const jackpotText = `図柄揃い確率：${m?.jackpot ?? "—"}`;
  const rushText = `ラッシュ突入率：${m?.rushEntry ?? "—"}`;

  const targets = [
    { el: borderEl, text: borderText },
    { el: jackpotEl, text: jackpotText },
    { el: rushEl, text: rushText },
  ].filter((x) => x.el);

  if (!animate) {
    for (const t of targets) {
      t.el.classList.remove("is-updating", "is-revealing");
      t.el.innerText = t.text;
    }
    return;
  }

  for (const t of targets) {
    t.el.classList.remove("is-revealing");
    t.el.classList.add("is-updating");
  }

  for (const t of targets) {
    t.el.innerText = t.text;
  }

  const baseDelay = 180;
  const stepDelay = 80;

  targets.forEach((t, i) => {
    setTimeout(() => {
      t.el.classList.remove("is-updating");
      t.el.classList.add("is-revealing");

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
for (const m of getSortedMachines()) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = isFavoriteMachine(m.id) ? `★ ${m.name}` : m.name;
  sel.appendChild(opt);
}

  const savedId = localStorage.getItem(LS_SELECTED_MACHINE);
  const found = MACHINES.find((m) => m.id === savedId);
  selectedMachine = found || MACHINES[0];
  sel.value = selectedMachine.id;
  renderFavoriteButton();

  loadTotalsForSelectedMachine();

  const savedExchange = Number(localStorage.getItem(LS_SELECTED_EXCHANGE));
if ([25, 28, 30, 33].includes(savedExchange)) {
  selectedExchange = savedExchange;
}

  sel.addEventListener("change", () => {
    isSwitchingMachine = true;
    saveSession();

    const id = sel.value;
    const m = MACHINES.find((x) => x.id === id);
    if (!m) {
      isSwitchingMachine = false;
      return;
    }

    const exchangeSel = $("exchangeSelect");
if (exchangeSel) {
  exchangeSel.value = String(selectedExchange);

  exchangeSel.addEventListener("change", () => {
    const v = Number(exchangeSel.value);
    if (![25, 28, 30, 33].includes(v)) return;

    selectedExchange = v;
    localStorage.setItem(LS_SELECTED_EXCHANGE, String(v));

    renderMachineInfo(true);

    const finalResultText = $("finalResult")?.textContent?.trim();
    if (finalResultText) {
      const borderVal = getCurrentBorder();
      const rateText = $("finalResult")?.textContent || "";
      const m = rateText.match(/今回の回転率：([\d.]+)\s*回\/k/);
      if (m) {
        const rotationRate = Number(m[1]);
        updateFinalRateMeter(rotationRate, borderVal);
      }
    }
  });
}

    selectedMachine = m;
    localStorage.setItem(LS_SELECTED_MACHINE, selectedMachine.id);

    loadTotalsForSelectedMachine();

    setInvestYen(0, true);
    confirmedInvestYen = 0;
    renderConfirmedInvest();

    resetSpinLog(true);
    hasStarted = false;
    updateStartButton();

    const restored = loadSession();
    if (restored) {
      renderSpinLog();
      if (payoutConfirmIndex !== -1) $("payoutPanel")?.classList.remove("is-hidden");
      if (endBallsPending) $("endBallsPanel")?.classList.remove("is-hidden");
      setLogMode(pendingIndex !== -1 ? "afterHit" : "main");
      updateStartButton();
    } else {
      resetSpinLog(true);
    }

    isSwitchingMachine = false;
    saveSession();

    const resultEl = $("result");
    if (resultEl) {
      resultEl.innerText = "";
      setResultTierClass("");
    }

    const totalEl = $("total");
    if (totalEl) {
      totalEl.innerText = "累積期待値：0 玉";
      totalEl.style.color = "";
    }
    $("totalSpin") && ($("totalSpin").innerText = "累計確率：0 / 0 = —");
    $("totalInvest") && ($("totalInvest").innerText = "累計投資：0 円");
    $("avgRate") && ($("avgRate").innerText = "累計回転率：0.0 回/k");

    updateView();
    renderMachineInfo(true);
    updateHitOptionButtons();
    renderFavoriteButton();
    updateRushEndAdjustUI();
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

// ===== 投資 =====
function setInvestYen(value, skipSave = false) {
  investYen = Math.round(Number(value) || 0);

  const el = $("investYen");
  if (el) {
    el.value = (investYen === 0 ? "" : String(investYen));
    el.style.color = investYen < 0 ? "#dc2626" : "";
  }

  updateInvestButtons();
  if (!skipSave) saveSession();
}

function addInvest(amount) {
  setInvestYen(investYen + amount);
}
function subInvest(amount) {
  setInvestYen(investYen - amount);
}
function updateInvestButtons() {
}

function undoLastInvest() {
  if (lastConfirmedInvestYen <= 0) {
    alert("戻せる投資がありません");
    return;
  }

  confirmedInvestYen -= lastConfirmedInvestYen;
  if (confirmedInvestYen < 0) confirmedInvestYen = 0;

  lastConfirmedInvestYen = 0;

  renderConfirmedInvest();
  saveSession();
}

// ===== 総投資 =====
function confirmInvest() {
  const add = Number(investYen);

  if (!Number.isFinite(add) || add === 0) {
    alert("投資額を入力してください");
    return;
  }

  lastConfirmedInvestYen = add;
  confirmedInvestYen += add;
  if (confirmedInvestYen < 0) confirmedInvestYen = 0;

  const k = add / 1000;

  for (let i = spinLog.length - 1; i >= 0; i--) {
    const row = spinLog[i];
    const a = Number(row.add) || 0;

    if (a > 0) {
      row.investK = (Number(row.investK) || 0) + k;
      if (row.investK < 0) row.investK = 0;
      break;
    }
  }

  setInvestYen(0, true);
  renderConfirmedInvest();
  saveSession();

  if (investFromStop) {
    $("finalCalcCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    scrollToMidCheckButton();
  }

  investFromStop = false;
}

// ===== 期待値計算（裏）=====
function calcExpectationBalls(rotationRate, spinCount) {
  const P = selectedMachine.perSpinPayBalls;
  const C = selectedMachine.costPer1kBalls ?? DEFAULT_COST_PER_1K_BALLS;
  const expected = spinCount * (P - C / rotationRate);
  return Math.round(expected);
}

function animateProgressBar(barEl, toValue, duration = 650) {
  if (!barEl) return;

  const startValue = Number(barEl.value) || 0;
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
  const totalEl = $("total");
  if (totalEl) {
    const b = totals.totalExpectBalls;

    const yen = b * YEN_PER_BALL;
    const ballText = b > 0 ? `+${fmtInt(b)}` : `${fmtInt(b)}`;
    const yenText  = yen > 0 ? `+${fmtInt(yen)}` : `${fmtInt(yen)}`;

    totalEl.innerText = `累積期待値：${ballText} 玉（${yenText} 円）`;
    setSignedColor(totalEl, b);
  }

  const spinEl = $("totalSpin");
  if (spinEl) {
    const hit = totals.totalHitCount || 0;
    const spin = totals.totalSpin || 0;

    if (hit > 0 && spin > 0) {
      spinEl.innerText =
        `累計確率：${hit} / ${fmtInt(spin)} = 1 / ${Math.round(spin / hit)}`;
    } else {
      spinEl.innerText =
        `累計確率：${hit} / ${fmtInt(spin)} = —`;
    }
  }

  const invEl = $("totalInvest");
  if (invEl) {
    invEl.innerText = `累計投資：${fmtInt(totals.totalInvestYen)} 円`;
  }

  const avgRate =
    totals.totalConsumedK > 0
      ? (totals.totalSpin / totals.totalConsumedK) * 250
      : 0;

  const rateEl = $("avgRate");
  if (rateEl) {
    rateEl.innerText = `累計回転率：${fmtRate1(avgRate)} 回/k`;
  }

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
    goalBar.dataset.targetValue = String(progressInStep);
    goalBar.value = Math.min(Number(goalBar.value) || 0, span);

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
    percentEl.innerText = `達成率：${(Math.floor(Math.min(100, pct) * 10) / 10).toFixed(1)} %`;
  }

  const goalTitle = document.querySelector(".goal-title");
  if (goalTitle) {
    goalTitle.innerText = `目標期待値：${fmtInt(nextGoal)} 円`;
  }

  const noteEl = document.querySelector(".note");
if (noteEl) {
  noteEl.textContent = `※ボーダー表示は${selectedExchange}玉交換、期待値計算は等価換算です`;
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
  if (hot) {
    let rateText = "—";
    if (hitCount > 0 && totalSpins > 0) {
      rateText = `1/${Math.round(totalSpins / hitCount)}`;
    }
    hot.textContent = `${hitCount} / ${totalSpins}   =   ${rateText}`;
  }

  if (!list) return;
  list.innerHTML = "";

  for (let i = 0; i < spinLog.length; i++) {
    const x = spinLog[i];

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
        ? `（${x.add}回転）`
        : "";

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

  const finalEl = $("finalResult");
  if (finalEl) {
    const investK = confirmedInvestYen / 1000;
    const bonusBalls = payout - endBalls;
    const bonusK = bonusBalls / 250;

    finalEl.innerText =
      `${fmtInt(spinCount)} / ( ${fmtRate1(investK)}k + ${fmtRate2(bonusK)}k玉 )\n` +
      `今回の回転率：${fmtRate1(rotationRate)} 回/k`;
  }

  const borderVal = getCurrentBorder();
  updateFinalRateMeter(rotationRate, borderVal);

  hasStarted = false;
  updateStartButton();
  updateView();

  confirmedInvestYen = 0;
  renderConfirmedInvest();
  saveSession();

  setInvestYen(0);
  lastMidCheckBalls = null;
}

// ===== 表記出玉 → 純増 =====
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

// ===== リセット =====
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

  setInvestYen(0);
  confirmedInvestYen = 0;
  renderConfirmedInvest();

  spinLog = [];
  pendingIndex = -1;
  payoutConfirmIndex = -1;
  endBallsPending = false;
  endBallsYame = null;
  nextStartCounter = 0;
  hasStarted = false;
  lastMidCheckBalls = null;

  setCounterInputLocked(false);
  updateStartButton();

  $("counterNow") && ($("counterNow").value = "");
  $("payoutPanel")?.classList.add("is-hidden");
  $("endBallsPanel")?.classList.add("is-hidden");

  renderSpinLog();
  setLogMode("main");

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText = "";
    setResultTierClass("");
  }

  clearSession();
}

function calcGoalIndex(totalEvYen) {
  const v = Math.max(0, Number(totalEvYen) || 0);

  for (let i = 0; i < GOAL_STEPS.length; i++) {
    if (v < GOAL_STEPS[i]) return i;
  }
  return GOAL_STEPS.length - 1;
}

// ===== 段階目標 =====
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

// ===== iOS: 投資ボタンの連打ズーム対策 =====
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

  Object.values(map).forEach((btn) => btn && btn.classList.add("is-hidden"));

  for (const key of opts) {
    map[key]?.classList.remove("is-hidden");
  }
}

function skipInvest() {
  setInvestYen(0);

  if (investFromStop) {
    $("finalCalcCard")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } else {
    scrollToLogCard();
  }

  investFromStop = false;
}

// ===== 途中回転率 =====
function showMidCheck() {
  if (!(confirmedInvestYen > 0)) {
    alert("投資額を追加して下さい");
    scrollToInvestCard();
    return;
  }

  $("midSpinVal").textContent = "—";
  $("midRateVal").textContent = "—";
  $("midBorderVal").textContent = "—";
  $("midDiffVal").textContent = "—";
  $("midDiffVal")?.classList.remove("is-plus", "is-minus");

  const needle = $("midMeterNeedle");
  if (needle) needle.style.left = "50%";

  $("midCheckCard")?.classList.remove("is-hidden");
  $("midOverlay")?.classList.remove("is-hidden");

  const hitCount = spinLog.filter(x =>
    x.label === "単発" ||
    x.label === "RUSH終了" ||
    x.label === "LT終了"
  ).length;

  const inputWrap = $("midBallsNow")?.closest("label");
  const btn = $("midBallsConfirm");

  if (hitCount === 0) {
    inputWrap?.classList.add("is-hidden");
    btn?.classList.add("is-hidden");
    confirmMidCheck();
    return;
  }

  inputWrap?.classList.remove("is-hidden");
  btn?.classList.remove("is-hidden");

  const input = $("midBallsNow");
  if (input) {
    input.value = "";
    input.focus();
  }
}

function confirmMidCheck() {
  const hitCount = spinLog.filter(x =>
    x.label === "単発" ||
    x.label === "RUSH終了" ||
    x.label === "LT終了"
  ).length;

  let tempEndBalls = 0;

  if (hitCount > 0) {
    const v = Number($("midBallsNow")?.value);
    if (!Number.isFinite(v) || v < 0) {
      alert("現在の持ち玉（玉）を入力してください");
      return;
    }
    tempEndBalls = Math.floor(v);
  }

  lastMidCheckBalls = tempEndBalls;

  const result = calcMidRotationRateB(tempEndBalls);
  if (result === undefined) return;
  if (result === null) {
    alert("途中経過を計算できません");
    return;
  }

  const { spinCount, rotationRate } = result;
  const border = getCurrentBorder();
  updateMidRateMeter(rotationRate, border);

  const diff = Number.isFinite(border) ? rotationRate - border : null;

  $("midSpinVal").textContent   = `${fmtInt(spinCount)} 回`;
  $("midRateVal").textContent   = `${fmtRate1(rotationRate)} 回/k`;
  $("midBorderVal").textContent = `${fmtRate1(border)}`;

  const diffEl = $("midDiffVal");
  if (diffEl) {
    if (diff !== null && Number.isFinite(diff)) {
      diffEl.textContent = `${diff >= 0 ? "+" : ""}${fmtRate1(diff)}`;
      diffEl.classList.remove("is-plus", "is-minus");
      if (diff > 0) diffEl.classList.add("is-plus");
      else if (diff < 0) diffEl.classList.add("is-minus");
    } else {
      diffEl.textContent = "—";
      diffEl.classList.remove("is-plus", "is-minus");
    }
  }

  setResultTierClass(getRateTierClass(rotationRate, border));
}

function getMidCheckCurrentCounter() {
  const input = $("counterNow");
  const raw = input?.value?.trim();

  if (raw !== "") {
    const v = Number(raw);
    if (Number.isFinite(v) && v >= nextStartCounter) {
      return Math.floor(v);
    }
  }

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

  if (last.label === "開始") {
    const add = tempCounter - last.from;
    return confirmedSpins + Math.max(0, add);
  }

  return confirmedSpins;
}

function calcMidRotationRateB(tempEndBalls) {
  let counter = getMidCheckCurrentCounter();

  if (counter === null) {
    counter = promptMidCheckCounter();
    if (counter === null) return undefined;
  }

  const spinCount = getMidCheckSpinCount(counter);
  if (spinCount <= 0) return null;

  const investBalls = (confirmedInvestYen / 1000) * 250;
  const payout = getTotalPayoutFromLog();

  const consumedBalls = investBalls + payout - tempEndBalls;
  if (consumedBalls <= 0) return null;

  return {
    spinCount,
    rotationRate: (spinCount / consumedBalls) * 250,
  };
}

function updateMidRateMeter(rotationRate, border) {
  const meter = $("midRateMeter");
  const needle = $("midMeterNeedle");
  const minEl = $("midMeterMin");
  const maxEl = $("midMeterMax");

  if (!meter || !needle) return;

  if (!Number.isFinite(rotationRate) || !Number.isFinite(border)) {
    meter.classList.add("is-hidden");
    return;
  }

  meter.classList.remove("is-hidden");

  const range = 5;
  const min = border - range;
  const max = border + range;

  if (minEl) minEl.textContent = `${(Math.floor(min * 10) / 10).toFixed(1)}`;
  if (maxEl) maxEl.textContent = `${(Math.floor(max * 10) / 10).toFixed(1)}`;

  let pct = ((rotationRate - min) / (max - min)) * 100;
  pct = Math.max(0, Math.min(100, pct));

  needle.style.left = `${pct}%`;
}

function updateFinalRateMeter(rotationRate, border) {
  const meter = $("finalRateMeter");
  const needle = $("finalMeterNeedle");
  const minEl = $("finalMeterMin");
  const maxEl = $("finalMeterMax");
  if (!meter || !needle || !minEl || !maxEl) return;

  if (!Number.isFinite(rotationRate) || !Number.isFinite(border)) {
    meter.classList.add("is-hidden");
    return;
  }

  const range = 5;
  const min = border - range;
  const max = border + range;

  minEl.textContent = fmtRate1(min);
  maxEl.textContent = fmtRate1(max);

  let pct = ((rotationRate - min) / (max - min)) * 100;
  pct = Math.max(0, Math.min(100, pct));

  needle.style.left = `${pct}%`;
}

function closeMidCheck() {
  $("midCheckCard")?.classList.add("is-hidden");
  $("midOverlay")?.classList.add("is-hidden");

  const needle = $("midMeterNeedle");
  if (needle) needle.style.left = "50%";
}

// ===== 初期化 =====
function init() {
  initMachineSelect();
  renderMachineInfo(false);
  updateHitOptionButtons();

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
  $("midOverlay")?.addEventListener("click", closeMidCheck);
  $("midBallsConfirm")?.addEventListener("click", confirmMidCheck);

  $("calcBtn")?.addEventListener("click", confirmInvest);
  $("finalCalcBtn")?.addEventListener("click", calc);
  $("undoInvest")?.addEventListener("click", undoLastInvest);

  $("resetBtn")?.addEventListener("click", resetSelectedMachineTotals);

  $("investYen")?.addEventListener("change", () => {
    const val = Number($("investYen").value);
    if (!Number.isFinite(val)) return;
    setInvestYen(val);
  });

  enableInvestFastTap(".invest-buttons");

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

  const goalBar = $("goalBar");
  if (goalBar) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          goalBar.dataset.inView = "1";
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

  $("favoriteBtn")?.addEventListener("click", () => {
  toggleFavoriteMachine(selectedMachine.id);

  const sel = $("machineSelect");
  if (sel) {
    const currentId = selectedMachine.id;
    sel.innerHTML = "";

    for (const m of getSortedMachines()) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = isFavoriteMachine(m.id) ? `★ ${m.name}` : m.name;
      sel.appendChild(opt);
    }

    sel.value = currentId;
  }

  renderFavoriteButton();
  updateRushEndAdjustUI();
});
}

document.addEventListener("DOMContentLoaded", init);
