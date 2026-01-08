/* =========================
   期待値トラッカー app.js（機種ごと累計：B）
   - 機種選択（machineSelect）
   - 開始回転 / 現在回転
   - 投資は加算式（addInvest）
   - 期待値は「差玉（玉）」で管理し表示
   - 累計は機種ごとにlocalStorageへ保存
   - 目標は100万円固定（進捗UI）
   - iOS連打ズーム対策は投資ボタン領域だけ
   - 機種切替時：ボーダーだけ0.15sフェード更新
   ========================= */

const GOAL_YEN = 1_000_000;            // ★100万円固定
const YEN_PER_BALL = 4;
const DEFAULT_COST_PER_1K_BALLS = 250; // 4円等価の1k=250玉基準

// ===== 機種DB：増やす前提 =====
const MACHINES = [
  {
    id: "madoka3",
    name: "P魔法少女まどか☆マギカ3",
    perSpinPayBalls: 14.85,
    costPer1kBalls: 250,
    border: { 25: 16.8, 28: 18.9, 30: 20.2, 33: 22.2 },
    jackpot: "1/199",
    rushEntry: "50%",
  },
  {
    id: "megamiCafe",
    name: "e女神のカフェテラスFLX",
    perSpinPayBalls: 9.37,
    costPer1kBalls: 250,
    border: { 25: 26.7, 28: 29.9, 30: 32.0, 33: 35.2 },
    jackpot: "1/399",
    rushEntry: "40%",
  },
  {
    id: "shamanking",
    name: "eシャーマンキング でっけぇなあver.",
    perSpinPayBalls: 8.08,
    costPer1kBalls: 250,
    border: { 25: 30.9, 28: 34.7, 30: 37.1, 33: 40.8 },
    jackpot: "1/349",
    rushEntry: "50%",
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
  totalExpectBalls: 0, // 累積期待値（玉）
  totalSpin: 0,        // 累計回転数
  totalInvestYen: 0,   // 累計投資（円）
  totalKInvested: 0,   // 累計投入k（円/1000）
};

// ===== DOM helper =====
function $(id) {
  return document.getElementById(id);
}

function fmtInt(n) {
  return Math.round(n).toLocaleString("ja-JP");
}

function fmtRate(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

// 表示専用：回転率（小数1桁・切り捨て）
function fmtRate1(n) {
  if (!Number.isFinite(n)) return "0.0";
  return (Math.floor(n * 10) / 10).toFixed(1);
}


function setSignedColor(el, val) {
  if (!el) return;
  if (val > 0) el.style.color = "#3b82f6"; // 青
  else if (val < 0) el.style.color = "#ef4444"; // 赤
  else el.style.color = "";
}

// ===== 回転率 tier 判定 & 反映（★calc() の外に置く）=====
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

  // ★古いクラス名のままにしない（blue/green含めて全部remove）
  el.classList.remove(
    "tier-bad",
  "tier-blue",
  "tier-green",
  "tier-purple"
  );

  if (tierClass) el.classList.add(tierClass);
}

// ===== 機種情報 =====
function fmtBorder(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

/**
 * 機種スペック表示
 * @param {boolean} animateBorder 機種切替時のみtrue（ボーダーだけ0.15sフェード）
 */
function renderMachineInfo(animateBorder = false) {
  const m = selectedMachine;
  const borderVal = m?.border?.[28]; // 交換率

  const borderEl = $("infoBorder");
  const jackpotEl = $("infoJackpot");
  const rushEl = $("infoRush");

  const borderText = `28交換ボーダー：${fmtBorder(borderVal)} 回/k`;

  // ボーダーだけフェード
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

  // 前回選択復元
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

    const resultEl = $("result");
    if (resultEl) {
      resultEl.innerText = "";
      setResultTierClass(""); // tierも初期化
    }

    updateView();
    renderMachineInfo(true); // ★機種切替時だけボーダーフェード
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

// ===== 入力取得（開始/現在回転）=====
function getSpinInputs() {
  const start = Number($("startSpin")?.value);
  const current = Number($("currentSpin")?.value);
  return { start, current };
}

function validateForCalc() {
  const { start, current } = getSpinInputs();

  if (!Number.isFinite(start) || !Number.isFinite(current)) {
    return { ok: false, msg: "データランプ開始回転数と終了回転数を入力してください" };
  }
  if (current <= start) {
    return { ok: false, msg: "終了回転数は開始回転数より大きくしてください" };
  }
  if (!Number.isFinite(investYen) || investYen <= 0) {
    return { ok: false, msg: "投資額を追加してください（+1000円など）" };
  }
  return { ok: true };
}

// ===== 計算（機種共通）=====
// 差玉 = 回転数 * ( 単回転出玉 - (1k玉 / 回転率) )
function calcExpectationBalls(rotationRate, spinCount) {
  const P = selectedMachine.perSpinPayBalls; // 単回転出玉（玉/回転）
  const C = selectedMachine.costPer1kBalls ?? DEFAULT_COST_PER_1K_BALLS; // 1k玉（通常250）
  const expected = spinCount * (P - C / rotationRate);
  return Math.round(expected);
}

// ===== 画面更新 =====
function updateView() {
  // 累積期待値（玉）
  const totalEl = $("total");
  if (totalEl) {
    const b = totals.totalExpectBalls;
    const signText = b > 0 ? `+${fmtInt(b)}` : `${fmtInt(b)}`;
    totalEl.innerText = `累積期待値：${signText} 玉`;
    setSignedColor(totalEl, b);
  }

  // 累計回転数
  const spinEl = $("totalSpin");
  if (spinEl) spinEl.innerText = `累計回転数：${fmtInt(totals.totalSpin)}`;

  // 累計投資
  const invEl = $("totalInvest");
  if (invEl) invEl.innerText = `累計投資：${fmtInt(totals.totalInvestYen)} 円`;

  // 累計回転率（回/k）
  const avgRate = totals.totalKInvested > 0 ? totals.totalSpin / totals.totalKInvested : 0;
  const rateEl = $("avgRate");
  if (rateEl) rateEl.innerText = `累計回転率：${fmtRate(avgRate)} 回/k`;

  // 進捗（円換算でprogress / 100万円固定）
  const totalEvYen = totals.totalExpectBalls * YEN_PER_BALL;

  const goalBar = $("goalBar");
  if (goalBar) {
    goalBar.max = GOAL_YEN;
    goalBar.value = Math.max(0, Math.min(GOAL_YEN, totalEvYen));
  }

  const percentEl = $("percent");
  if (percentEl) {
    const pct = GOAL_YEN > 0 ? (totalEvYen / GOAL_YEN) * 100 : 0;
    percentEl.innerText = `達成率：${fmtRate(Math.max(0, pct))} %`;
  }
}

// ===== 計算ボタン（今回分を加算して保存）=====
function calc() {
  const v = validateForCalc();
  if (!v.ok) {
    alert(v.msg);
    return;
  }

  const { start, current } = getSpinInputs();
  const spinCount = current - start;

  // 投資k
  const k = investYen / 1000;

  // 回転率（回/k）
  const rotationRate = spinCount / k;

  // 今回期待値（差玉）※表示はしない（裏だけ）
  const todayBalls = calcExpectationBalls(rotationRate, spinCount);

  // 累計更新（機種ごと）
  totals.totalExpectBalls += todayBalls;
  totals.totalSpin += spinCount;
  totals.totalInvestYen += investYen;
  totals.totalKInvested += k;

  saveTotalsForSelectedMachine();

  // 表示（第1段階：回転数 & 今回回転率のみ）
  const resultEl = $("result");
  if (resultEl) {
    const rateText = fmtRate1(rotationRate);
    resultEl.innerText =
      `回した回転数：${fmtInt(spinCount)} 回\n` +
      `今回の回転率：${rateText} 回/k`;

    const borderVal = selectedMachine?.border?.[28];
    setResultTierClass(getRateTierClass(rotationRate, borderVal));
  }

  updateView();
  setInvestYen(0);

  // UX：終了→開始へコピー / 終了空 / focus
  const startEl = $("startSpin");
  const endEl = $("currentSpin");
  if (startEl && endEl) {
    startEl.value = endEl.value;
    endEl.value = "";
  }
}

// ===== リセット（選択中の機種だけ初期化）=====
function resetSelectedMachineTotals() {
  if (!confirm(`「${selectedMachine.name}」の累積データをリセットしますか？`)) return;

  totals = { totalExpectBalls: 0, totalSpin: 0, totalInvestYen: 0, totalKInvested: 0 };
  saveTotalsForSelectedMachine();

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText = "";
    setResultTierClass("");
  }

  setInvestYen(0);
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

  // ★投資ボタンだけ連打ズーム対策
  enableInvestFastTap(".invest-buttons");

  // Enterキー＝計算（startSpin/currentSpin）
  ["startSpin", "currentSpin"].forEach((id) => {
    $(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        calc();
      }
    });
  });

  // 初期化
  setInvestYen(0);
  updateView();
  renderMachineInfo(false);
}


document.addEventListener("DOMContentLoaded", init);
