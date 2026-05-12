const GOAL_YEN = 1_000_000;
const YEN_PER_BALL = 4;
const DEFAULT_COST_PER_1K_BALLS = 250;

const TAN_PAYOUT_DISP = 400;
const TAN_PAYOUT_NET  = 360;

const MACHINES = window.MACHINES;

const LS_PREFIX = "evTracker_machineTotals_v1_";
const LS_SELECTED_MACHINE = "evTracker_selectedMachineId_v1";
const LS_SELECTED_EXCHANGE = "evTracker_selectedExchange_v1";
const LS_FAVORITE_MACHINES = "evTracker_favoriteMachineIds_v1";
const LS_RECENT_MACHINES = "evTracker_recentMachineIds_v1";
const LS_SELECTED_STORE = "evTracker_selectedStore_v1";
const LS_STORE_NAMES = "evTracker_storeNames_v1";
const LS_OWNED_BALANCES = "evTracker_ownedBalances_v1";
const LS_STORE_EXCHANGES = "evTracker_storeExchanges_v1";
const LS_TOTAL_VIEW_MODE = "evTracker_totalViewMode_v1";
const LS_DAILY_LOG_DATE = "evTracker_dailyLogDate_v1";


const LS_SESSION_PREFIX = "evTracker_session_v1_";
function getSessionKey(machineId) {
  return `${LS_SESSION_PREFIX}${machineId}`;
}

let selectedMachine = MACHINES[0];
let currentGoalIndex = 0;
let selectedExchange = 28;
let selectedStore = "";
let playSource = "cash";
let totalViewMode = localStorage.getItem(LS_TOTAL_VIEW_MODE) === "all" ? "all" : "selected";
let isAddingStore = false;

let investYen = 0;
let confirmedInvestYen = 0;
let ownedUseBalls = 0;
let confirmedOwnedBalls = 0;
let lastConfirmedOwnedBalls = 0;

let totals = {
  totalExpectBalls: 0,
  totalExpectYen: 0,
  totalSpin: 0,
  totalInvestYen: 0,
  totalOwnedBallsUsed: 0,
  totalOutputBallsUsed: 0,
  totalKInvested: 0,
  totalConsumedK: 0,
  totalTrueBorderWeighted: 0,
  totalTrueBorderCount: 0,
  totalOwnedRatioWeighted: 0,
  totalOwnedRatioCount: 0,
  totalHitCount: 0,
  totalTanCount: 0,
  totalRushCount: 0,
  totalLtCount: 0,
  totalRushPayoutDispSum: 0,
  totalRushPayoutDispCount: 0,
  totalLtPayoutDispSum: 0,
  totalLtPayoutDispCount: 0,
};


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

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function getExchangeYenPerBall() {
  return 100 / selectedExchange;
}

function calcExpectationYenFromBalls(expectBalls) {
  return Math.round((Number(expectBalls) || 0) * YEN_PER_BALL);
}

function normalizeStoreName(name) {
  return String(name || "").trim();
}

function isValidExchange(value) {
  return [25, 28, 30, 33].includes(Number(value));
}

function getStoreNames() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_STORE_NAMES) || "[]");
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveStoreName(name) {
  const clean = normalizeStoreName(name);
  if (!clean) return;
  const names = getStoreNames();
  if (!names.includes(clean)) {
    localStorage.setItem(LS_STORE_NAMES, JSON.stringify([...names, clean]));
  }
}

function saveStoreNames(names) {
  const unique = [];
  for (const name of names.map(normalizeStoreName).filter(Boolean)) {
    if (!unique.includes(name)) unique.push(name);
  }
  localStorage.setItem(LS_STORE_NAMES, JSON.stringify(unique));
}

function getStoreExchanges() {
  try {
    const obj = JSON.parse(localStorage.getItem(LS_STORE_EXCHANGES) || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveStoreExchange(name, exchange = selectedExchange) {
  const clean = normalizeStoreName(name);
  const v = Number(exchange);
  if (!clean || !isValidExchange(v)) return;

  const exchanges = getStoreExchanges();
  exchanges[clean] = v;
  localStorage.setItem(LS_STORE_EXCHANGES, JSON.stringify(exchanges));
}

function deleteStore(name) {
  const clean = normalizeStoreName(name);
  if (!clean) return;
  if (!confirm(`「${clean}」を削除しますか？\n店舗の交換率と持ち玉データも削除されます。`)) return;

  saveStoreNames(getStoreNames().filter((item) => item !== clean));

  const exchanges = getStoreExchanges();
  delete exchanges[clean];
  localStorage.setItem(LS_STORE_EXCHANGES, JSON.stringify(exchanges));

  const balances = getOwnedBalances();
  for (const key of Object.keys(balances)) {
    if (key === clean || key.startsWith(`${clean}__`)) delete balances[key];
  }
  saveOwnedBalances(balances);

  if (selectedStore === clean) {
    selectedStore = "";
    localStorage.removeItem(LS_SELECTED_STORE);
  }

  renderStoreControls();
  renderStorePickerList();
  saveSession();
}

function getStoreExchange(name) {
  const clean = normalizeStoreName(name);
  if (!clean) return null;

  const v = Number(getStoreExchanges()[clean]);
  return isValidExchange(v) ? v : null;
}

function setSelectedExchange(value, saveForStore = true, animate = true) {
  const v = Number(value);
  if (!isValidExchange(v)) return;

  selectedExchange = v;
  localStorage.setItem(LS_SELECTED_EXCHANGE, String(v));

  const exchangeSel = $("exchangeSelect");
  if (exchangeSel) exchangeSel.value = String(v);

  if (saveForStore && selectedStore) {
    saveStoreExchange(selectedStore, v);
  }

  renderMachineInfo(animate);
  renderOwnedBalance();
  renderMachinePickerList();
  updateView();
}

function getOwnedBalances() {
  try {
    const obj = JSON.parse(localStorage.getItem(LS_OWNED_BALANCES) || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveOwnedBalances(obj) {
  localStorage.setItem(LS_OWNED_BALANCES, JSON.stringify(obj));
}

function getOwnedKey(store = selectedStore, exchange = selectedExchange) {
  const clean = normalizeStoreName(store);
  return clean ? `${clean}__${exchange}` : "";
}

function getOwnedBalance() {
  const key = getOwnedKey();
  if (!key) return 0;
  return Math.max(0, Number(getOwnedBalances()[key]) || 0);
}

function setOwnedBalance(value) {
  const key = getOwnedKey();
  if (!key) return;
  const balances = getOwnedBalances();
  balances[key] = Math.max(0, Math.floor(Number(value) || 0));
  saveOwnedBalances(balances);
  renderOwnedBalance();
}

function addOwnedBalance(delta) {
  setOwnedBalance(getOwnedBalance() + Math.floor(Number(delta) || 0));
}

function setSelectedStoreDisplay() {
  const el = $("selectedStoreName");
  if (el) el.textContent = selectedStore || "店舗を選択";

  const select = $("storeSelect");
  if (select) select.value = selectedStore || "";
}

function renderStorePickerList() {
  const list = $("storePickerList");
  if (!list) return;

  const query = ($("storeSearchInput")?.value || "").trim().toLowerCase();
  const names = getStoreNames().filter((name) => name.toLowerCase().includes(query));

  list.innerHTML = "";

  if (names.length === 0) {
    const empty = document.createElement("p");
    empty.className = "store-picker-empty";
    empty.textContent = "該当する店舗がありません";
    list.appendChild(empty);
    return;
  }

  for (const name of names) {
    const row = document.createElement("div");
    row.className = "store-picker-item";
    if (name === selectedStore) row.classList.add("is-current");

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "store-picker-select";
    selectBtn.dataset.storeName = name;

    const title = document.createElement("strong");
    title.textContent = name;
    selectBtn.appendChild(title);

    const meta = document.createElement("span");
    const exchange = getStoreExchange(name) || selectedExchange;
    const balance = getOwnedBalances()[getOwnedKey(name, exchange)] || 0;
    meta.textContent = `${exchange}玉交換 / 持ち玉 ${fmtInt(balance)}玉`;
    selectBtn.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "store-picker-delete";
    deleteBtn.dataset.storeDelete = name;
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", `${name}を削除`);

    row.appendChild(selectBtn);
    row.appendChild(deleteBtn);
    list.appendChild(row);
  }
}

function openStorePicker() {
  $("storePickerOverlay")?.classList.remove("is-hidden");
  $("storePickerModal")?.classList.remove("is-hidden");
  renderStorePickerList();
  setTimeout(() => $("storeSearchInput")?.focus(), 30);
}

function closeStorePicker() {
  $("storePickerOverlay")?.classList.add("is-hidden");
  $("storePickerModal")?.classList.add("is-hidden");
}

function renderStoreControls() {
  const names = getStoreNames();
  const row = document.querySelector(".store-row");
  row?.classList.toggle("is-adding-store", isAddingStore);

  const select = $("storeSelect");
  if (select) {
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = names.length ? "店を選択" : "店を追加してください";
    select.appendChild(placeholder);

    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }

    select.value = names.includes(selectedStore) ? selectedStore : "";
    select.disabled = isAddingStore;
  }

  setSelectedStoreDisplay();

  const input = $("storeName");
  if (input && !isAddingStore) input.value = "";

  $("storeAddBtn")?.classList.toggle("is-hidden", isAddingStore);
  $("storeSaveBtn")?.classList.toggle("is-hidden", !isAddingStore);
  $("storeCancelBtn")?.classList.toggle("is-hidden", !isAddingStore);

  const list = $("storeList");
  if (list) {
    list.innerHTML = "";
    for (const name of getStoreNames()) {
      const opt = document.createElement("option");
      opt.value = name;
      list.appendChild(opt);
    }
  }

  renderOwnedBalance();
  renderStorePickerList();
}

function renderOwnedBalance() {
  const currentBalance = getOwnedBalance();

  const label = $("ownedKeyLabel");
  if (label) {
    label.textContent = selectedStore
      ? `${selectedStore} / ${selectedExchange}玉交換`
      : "店名を入力してください";
  }

  const balance = $("ownedBalance");
  if (balance) {
    balance.textContent = `持ち玉：${fmtInt(currentBalance)}玉`;
  }

  const input = $("ownedBalanceInput");
  if (input && document.activeElement !== input) {
    input.value = selectedStore ? String(currentBalance) : "";
    input.disabled = !selectedStore;
  }

  const saveBtn = $("ownedBalanceSaveBtn");
  if (saveBtn) saveBtn.disabled = !selectedStore;
}

function saveOwnedBalanceInput() {
  if (!selectedStore) {
    alert("\u5148\u306b\u5e97\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044");
    return;
  }

  const input = $("ownedBalanceInput");
  const value = Number(input?.value);
  if (!Number.isFinite(value) || value < 0) {
    alert("\u6301\u3061\u7389\u30920\u4ee5\u4e0a\u306e\u6570\u5024\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044");
    input?.focus();
    return;
  }

  setOwnedBalance(value);
  saveSession();
}

function selectStore(name) {
  selectedStore = normalizeStoreName(name);
  if (selectedStore) {
    localStorage.setItem(LS_SELECTED_STORE, selectedStore);
    const storeExchange = getStoreExchange(selectedStore);
    if (storeExchange !== null) {
      setSelectedExchange(storeExchange, false);
    } else {
      saveStoreExchange(selectedStore, selectedExchange);
    }
  }
  isAddingStore = false;
  renderStoreControls();
  closeStorePicker();
  saveSession();
}

function startStoreAdd() {
  isAddingStore = true;
  renderStoreControls();
  const input = $("storeName");
  if (input) {
    input.value = "";
    input.focus();
  }
}

function cancelStoreAdd() {
  isAddingStore = false;
  const input = $("storeName");
  if (input) input.value = "";
  renderStoreControls();
  saveSession();
}

function saveNewStore() {
  const input = $("storeName");
  const name = normalizeStoreName(input?.value);
  if (!name) {
    alert("\u8ffd\u52a0\u3059\u308b\u5e97\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044");
    input?.focus();
    return;
  }

  saveStoreName(name);
  saveStoreExchange(name, selectedExchange);
  selectStore(name);
}

function renderConfirmedInvest() {
  const el = $("investConfirmed");
  if (!el) return;
  el.textContent = `現金投資：${fmtInt(confirmedInvestYen)} 円`;
}


function renderConfirmedOwned() {
  const el = $("ownedConfirmed");
  if (!el) return;
  el.textContent = `持ち玉使用：${fmtInt(confirmedOwnedBalls)}玉`;
}

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

function scrollToFinalCalcCard() {
  const card = $("finalCalcCard");
  if (!card) return;
  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function flashFinalCalcButton() {
  const btn = $("finalCalcBtn");
  if (!btn) return;
  btn.classList.remove("is-ev-flashing");
  void btn.offsetWidth;
  btn.classList.add("is-ev-flashing");
  window.setTimeout(() => btn.classList.remove("is-ev-flashing"), 900);
}

function scrollToMidCheckButton() {
  const btn = $("btnMidCheck");
  if (!btn) return;
  btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
}


function getTodayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clearAllDailySessions() {
  for (const machine of MACHINES) {
    localStorage.removeItem(getSessionKey(machine.id));
  }
}

function clearCurrentDailyState() {
  setInvestYen(0, true);
  setOwnedUseBalls(0, true);
  confirmedInvestYen = 0;
  confirmedOwnedBalls = 0;
  renderConfirmedInvest();
  renderConfirmedOwned();

  spinLog = [];
  pendingIndex = -1;
  payoutConfirmIndex = -1;
  endBallsPending = false;
  endBallsYame = null;
  nextStartCounter = 0;
  hasStarted = false;
  lastMidCheckBalls = null;
  lastConfirmedInvestYen = 0;
  lastConfirmedOwnedBalls = 0;

  setCounterInputLocked(false);
  updateStartButton();

  $("counterNow") && ($("counterNow").value = "");
  $("payoutPanel")?.classList.add("is-hidden");
  $("endBallsPanel")?.classList.add("is-hidden");
  $("payoutNow") && ($("payoutNow").value = "");
  $("endBallsNow") && ($("endBallsNow").value = "");

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText = "";
    setResultTierClass("");
  }

  const finalEl = $("finalResult");
  if (finalEl) finalEl.innerText = "";
  $("finalRateMeter")?.classList.add("is-hidden");
  const finalNeedle = $("finalMeterNeedle");
  if (finalNeedle) finalNeedle.style.left = "50%";

  renderSpinLog();
  setLogMode("main");
}

function checkDailyLogRollover() {
  const today = getTodayStamp();
  const saved = localStorage.getItem(LS_DAILY_LOG_DATE);

  if (!saved) {
    localStorage.setItem(LS_DAILY_LOG_DATE, today);
    return;
  }

  if (saved === today) return;

  clearAllDailySessions();
  clearCurrentDailyState();
  localStorage.setItem(LS_DAILY_LOG_DATE, today);
  saveSession();
}

function saveSession() {
  if (isSwitchingMachine) return;
  try {
    const key = getSessionKey(selectedMachine.id);
    const sessionStore = getStoreNames().includes(selectedStore) ? selectedStore : "";
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
      ownedUseBalls,
      confirmedOwnedBalls,
      selectedStore: sessionStore,
      playSource,
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

    ownedUseBalls = Number.isFinite(data.ownedUseBalls) ? data.ownedUseBalls : 0;
    setOwnedUseBalls(ownedUseBalls, true);

    confirmedOwnedBalls = Number.isFinite(data.confirmedOwnedBalls) ? data.confirmedOwnedBalls : 0;
    renderConfirmedOwned();

    selectedStore = typeof data.selectedStore === "string" ? data.selectedStore : selectedStore;
    playSource = data.playSource === "owned" ? "owned" : "cash";
    renderStoreControls();
    setPlaySource(playSource);

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
  btn.classList.toggle("is-favorite", fav);
}

function getRecentMachineIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_RECENT_MACHINES) || "[]");
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveRecentMachineIds(ids) {
  localStorage.setItem(LS_RECENT_MACHINES, JSON.stringify(ids.slice(0, 12)));
}

function addRecentMachine(machineId) {
  if (!machineId) return;
  const next = [machineId, ...getRecentMachineIds().filter((id) => id !== machineId)];
  saveRecentMachineIds(next);
}

function setSelectedMachineDisplay() {
  const nameEl = $("selectedMachineName");
  if (nameEl) nameEl.textContent = selectedMachine?.name || "機種を選択";

  const nativeSelect = $("machineSelect");
  if (nativeSelect) nativeSelect.value = selectedMachine?.id || "";
}

function getMachineSearchText(machine) {
  return [
    machine.id,
    machine.name,
    machine.maker,
    machine.jackpot,
    machine.rushEntry,
    ...(Array.isArray(machine.tags) ? machine.tags : []),
    machine.keyword,
  ].filter(Boolean).join(" ").toLowerCase();
}

function getMachinePickerFilter() {
  return document.querySelector(".machine-picker-tab.is-active")?.dataset.machineFilter || "all";
}

function renderMachinePickerList() {
  const list = $("machinePickerList");
  if (!list) return;

  const query = ($("machineSearchInput")?.value || "").trim().toLowerCase();
  const filter = getMachinePickerFilter();
  const favIds = getFavoriteMachineIds();
  const recentIds = getRecentMachineIds();

  let machines = getSortedMachines();
  if (filter === "favorite") machines = machines.filter((m) => favIds.includes(m.id));
  if (filter === "recent") {
    machines = recentIds
      .map((id) => MACHINES.find((m) => m.id === id))
      .filter(Boolean);
  }
  if (query) {
    machines = machines.filter((m) => getMachineSearchText(m).includes(query));
  }

  list.innerHTML = "";

  if (machines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "machine-picker-empty";
    empty.textContent = "該当する機種がありません";
    list.appendChild(empty);
    return;
  }

  for (const machine of machines) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "machine-picker-item";
    if (machine.id === selectedMachine.id) btn.classList.add("is-current");
    btn.dataset.machineId = machine.id;

    const title = document.createElement("strong");
    title.textContent = `${isFavoriteMachine(machine.id) ? "★ " : ""}${machine.name}`;
    btn.appendChild(title);

    const meta = document.createElement("span");
    const border = machine?.border?.[selectedExchange];
    meta.textContent = `大当り ${machine.jackpot || "—"} / ${selectedExchange}玉ボーダー ${fmtBorder(border)}回/k`;
    btn.appendChild(meta);

    list.appendChild(btn);
  }
}

function openMachinePicker() {
  $("machinePickerOverlay")?.classList.remove("is-hidden");
  $("machinePickerModal")?.classList.remove("is-hidden");
  renderMachinePickerList();
  setTimeout(() => $("machineSearchInput")?.focus(), 30);
}

function closeMachinePicker() {
  $("machinePickerOverlay")?.classList.add("is-hidden");
  $("machinePickerModal")?.classList.add("is-hidden");
}


function setCounterInputLocked(locked) {
  const el = $("counterNow");
  if (!el) return;
  el.disabled = locked;
}

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
    alert("開始処理でエラーが出ています。");
  }

  setCounterInputLocked(false);
}

function addHitEvent() {
  if (pendingIndex !== -1) {
    alert("当たり種別（単発 / RUSH / LT）を先に選んでください");
    return;
  }
  if (payoutConfirmIndex !== -1) {
    alert("先に「表記出玉」を確定してください");
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
    alert("先に「表記出玉」を確定してください");
    return;
  }
  if (endBallsPending) {
    alert("先に「持ち玉」を確定してください");
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

  if ($("endBallsNow")) $("endBallsNow").value = "0";
  $("endBallsPanel")?.classList.remove("is-hidden");

  renderSpinLog();
  setLogMode("main");
  setCounterInputLocked(true);
  saveSession();
}

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
  const jackpotText = `図柄当たり確率：${m?.jackpot ?? "—"}`;
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
  setSelectedMachineDisplay();
  renderFavoriteButton();
  renderMachinePickerList();

  loadTotalsForSelectedMachine();

  const savedExchange = Number(localStorage.getItem(LS_SELECTED_EXCHANGE));
if (isValidExchange(savedExchange)) {
  selectedExchange = savedExchange;
}

  const exchangeSel = $("exchangeSelect");
  if (exchangeSel) {
    exchangeSel.value = String(selectedExchange);
    exchangeSel.addEventListener("change", () => {
      setSelectedExchange(exchangeSel.value);
    });
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
    renderOwnedBalance();

    $("finalRateMeter")?.classList.add("is-hidden");
  });
}

    selectedMachine = m;
    localStorage.setItem(LS_SELECTED_MACHINE, selectedMachine.id);
    addRecentMachine(selectedMachine.id);
    setSelectedMachineDisplay();

    loadTotalsForSelectedMachine();

    setInvestYen(0, true);
    setOwnedUseBalls(0, true);
    confirmedInvestYen = 0;
    confirmedOwnedBalls = 0;
    renderConfirmedInvest();
    renderConfirmedOwned();

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
    $("totalSpin") && ($("totalSpin").innerText = "初当たり確率：0 / 0 = —");
    $("totalInvest") && ($("totalInvest").innerText = "累計投資：0 円");
    $("avgRate") && ($("avgRate").innerText = "累計回転率：0.0 回/k");

    updateView();
    renderMachineInfo(true);
    updateHitOptionButtons();
    renderFavoriteButton();
    renderMachinePickerList();
    updateRushEndAdjustUI();
  });
}


function getTotalsKey(machineId) {
  return `${LS_PREFIX}${machineId}`;
}

function createEmptyTotals() {
  return {
    totalExpectBalls: 0,
    totalExpectYen: 0,
    totalSpin: 0,
    totalInvestYen: 0,
    totalOwnedBallsUsed: 0,
    totalOutputBallsUsed: 0,
    totalKInvested: 0,
    totalConsumedK: 0,
    totalTrueBorderWeighted: 0,
    totalTrueBorderCount: 0,
    totalOwnedRatioWeighted: 0,
    totalOwnedRatioCount: 0,
    totalHitCount: 0,
    totalTanCount: 0,
    totalRushCount: 0,
    totalLtCount: 0,
    totalRushPayoutDispSum: 0,
    totalRushPayoutDispCount: 0,
    totalLtPayoutDispSum: 0,
    totalLtPayoutDispCount: 0,
  };
}

function normalizeTotals(obj) {
  const expectBalls = Number(obj?.totalExpectBalls) || 0;
  return {
    totalExpectBalls: expectBalls,
    totalExpectYen: Number.isFinite(Number(obj?.totalExpectYen))
      ? Number(obj.totalExpectYen)
      : calcExpectationYenFromBalls(expectBalls),
    totalSpin: Number(obj?.totalSpin) || 0,
    totalInvestYen: Number(obj?.totalInvestYen) || 0,
    totalOwnedBallsUsed: Number(obj?.totalOwnedBallsUsed) || 0,
    totalOutputBallsUsed: Number(obj?.totalOutputBallsUsed) || 0,
    totalKInvested: Number(obj?.totalKInvested) || 0,
    totalConsumedK: Number(obj?.totalConsumedK) || 0,
    totalTrueBorderWeighted: Number(obj?.totalTrueBorderWeighted) || 0,
    totalTrueBorderCount: Number(obj?.totalTrueBorderCount) || 0,
    totalOwnedRatioWeighted: Number(obj?.totalOwnedRatioWeighted) || 0,
    totalOwnedRatioCount: Number(obj?.totalOwnedRatioCount) || 0,
    totalHitCount: Number(obj?.totalHitCount) || 0,
    totalTanCount: Number(obj?.totalTanCount) || 0,
    totalRushCount: Number(obj?.totalRushCount) || 0,
    totalLtCount: Number(obj?.totalLtCount) || 0,
    totalRushPayoutDispSum: Number(obj?.totalRushPayoutDispSum) || 0,
    totalRushPayoutDispCount: Number(obj?.totalRushPayoutDispCount) || 0,
    totalLtPayoutDispSum: Number(obj?.totalLtPayoutDispSum) || 0,
    totalLtPayoutDispCount: Number(obj?.totalLtPayoutDispCount) || 0,
  };
}

function loadTotalsForMachine(machineId) {
  const raw = localStorage.getItem(getTotalsKey(machineId));
  if (!raw) return createEmptyTotals();

  try {
    return normalizeTotals(JSON.parse(raw));
  } catch {
    return createEmptyTotals();
  }
}

function loadTotalsForSelectedMachine() {
  totals = loadTotalsForMachine(selectedMachine.id);
}

function saveTotalsForSelectedMachine() {
  const key = getTotalsKey(selectedMachine.id);
  localStorage.setItem(key, JSON.stringify(totals));
}

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

function setOwnedUseBalls(value, skipSave = false) {
  ownedUseBalls = Math.max(0, Math.floor(Number(value) || 0));

  const el = $("ownedUseBalls");
  if (el) el.value = ownedUseBalls === 0 ? "" : String(ownedUseBalls);

  if (!skipSave) saveSession();
}

function setPlaySource(source) {
  playSource = source === "owned" ? "owned" : "cash";

  $("playCashBtn")?.classList.toggle("is-active", playSource === "cash");
  $("playOwnedBtn")?.classList.toggle("is-active", playSource === "owned");
  $("investYen")?.closest("label")?.classList.toggle("is-hidden", playSource !== "cash");
  $("calcBtn")?.classList.toggle("is-hidden", playSource !== "cash");
  $("ownedUseLabel")?.classList.toggle("is-hidden", playSource !== "owned");
  $("ownedUseBtn")?.classList.toggle("is-hidden", playSource !== "owned");

  updateInvestButtons();
  saveSession();
}

function addInvest(amount) {
  setInvestYen(investYen + amount);
}
function subInvest(amount) {
  setInvestYen(investYen - amount);
}
function updateInvestButtons() {
  const owned = playSource === "owned";
  const add500 = $("add500");
  const add1000 = $("add1000");
  const add5000 = $("add5000");
  const sub500 = $("sub500");

  if (add500) add500.textContent = owned ? "+125玉" : "+500円";
  if (add1000) add1000.textContent = owned ? "+250玉" : "+1000円";
  if (add5000) add5000.textContent = owned ? "+1250玉" : "+5000円";
  if (sub500) sub500.textContent = owned ? "-125玉" : "-500円";
}

function addQuickAmount(amount) {
  if (playSource === "owned") {
    setOwnedUseBalls(ownedUseBalls + amount);
    return;
  }
  setInvestYen(investYen + amount);
}

function clearCurrentPlayInput() {
  if (playSource === "owned") {
    setOwnedUseBalls(0);
    return;
  }
  setInvestYen(0);
}

function undoLastInvest() {
  if (lastConfirmedInvestYen <= 0 && lastConfirmedOwnedBalls <= 0) {
    alert("戻せる投資・持ち玉使用がありません");
    return;
  }

  if (lastConfirmedInvestYen > 0) {
    confirmedInvestYen -= lastConfirmedInvestYen;
    if (confirmedInvestYen < 0) confirmedInvestYen = 0;
  }

  if (lastConfirmedOwnedBalls > 0) {
    confirmedOwnedBalls -= lastConfirmedOwnedBalls;
    if (confirmedOwnedBalls < 0) confirmedOwnedBalls = 0;
    addOwnedBalance(lastConfirmedOwnedBalls);
  }

  lastConfirmedInvestYen = 0;
  lastConfirmedOwnedBalls = 0;

  renderConfirmedInvest();
  renderConfirmedOwned();
  saveSession();
}

function confirmInvest() {
  const add = Number(investYen);

  if (!Number.isFinite(add) || add === 0) {
    alert("投資額を入力してください");
    return;
  }

  lastConfirmedInvestYen = add;
  lastConfirmedOwnedBalls = 0;
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

function confirmOwnedUse() {
  const store = normalizeStoreName(selectedStore || $("storeName")?.value);
  if (!store) {
    alert("\u6301\u3061\u7389\u3092\u4f7f\u3046\u5e97\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044");
    $("storeName")?.focus();
    return;
  }

  selectedStore = store;
  saveStoreName(selectedStore);
  localStorage.setItem(LS_SELECTED_STORE, selectedStore);

  const add = Math.floor(Number(ownedUseBalls) || 0);
  if (!Number.isFinite(add) || add <= 0) {
    alert("\u4f7f\u7528\u3059\u308b\u6301\u3061\u7389\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044");
    return;
  }

  if (add > getOwnedBalance()) {
    alert("\u767b\u9332\u3055\u308c\u3066\u3044\u308b\u6301\u3061\u7389\u3088\u308a\u591a\u304f\u306f\u4f7f\u3048\u307e\u305b\u3093");
    return;
  }

  lastConfirmedInvestYen = 0;
  lastConfirmedOwnedBalls = add;
  confirmedOwnedBalls += add;
  addOwnedBalance(-add);

  for (let i = spinLog.length - 1; i >= 0; i--) {
    const row = spinLog[i];
    const a = Number(row.add) || 0;

    if (a > 0) {
      row.ownedBalls = (Number(row.ownedBalls) || 0) + add;
      break;
    }
  }

  setOwnedUseBalls(0, true);
  renderConfirmedOwned();
  renderStoreControls();
  saveSession();

  if (investFromStop) {
    $("finalCalcCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    scrollToMidCheckButton();
  }

  investFromStop = false;
}


function calcExpectationBalls(rotationRate, spinCount) {
  const P = selectedMachine.perSpinPayBalls;
  const C = selectedMachine.costPer1kBalls ?? DEFAULT_COST_PER_1K_BALLS;
  const expected = spinCount * (P - C / rotationRate);
  return Math.round(expected);
}

function calcTrueBorder(ownedRatio) {
  const equalBorder = Number(selectedMachine?.border?.[25]);
  const cashBorder = Number(selectedMachine?.border?.[selectedExchange]);
  const ratio = Math.max(0, Math.min(1, Number(ownedRatio) || 0));

  if (!Number.isFinite(equalBorder) || !Number.isFinite(cashBorder)) return null;
  return cashBorder - (cashBorder - equalBorder) * ratio;
}

function calcWeightedAverage(sum, count) {
  const s = Number(sum) || 0;
  const c = Number(count) || 0;
  return c > 0 ? s / c : null;
}

function formatOwnedRatioForTotals(itemTotals) {
  const ratio = calcWeightedAverage(
    itemTotals?.totalOwnedRatioWeighted,
    itemTotals?.totalOwnedRatioCount
  );
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
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

function hasAnyTotals(t) {
  return (
    (Number(t.totalExpectBalls) || 0) !== 0 ||
    (Number(t.totalSpin) || 0) > 0 ||
    (Number(t.totalInvestYen) || 0) > 0 ||
    (Number(t.totalOwnedBallsUsed) || 0) > 0 ||
    (Number(t.totalHitCount) || 0) > 0
  );
}

function getGoalProgress(totalExpectBalls) {
  const totalEvYen = Math.max(0, calcExpectationYenFromBalls(totalExpectBalls));
  const index = calcGoalIndex(totalEvYen);
  const prevGoal = index === 0 ? 0 : GOAL_STEPS[index - 1];
  const nextGoal = GOAL_STEPS[index];
  const span = Math.max(1, nextGoal - prevGoal);
  const value = Math.max(0, Math.min(span, totalEvYen - prevGoal));

  return {
    index,
    max: span,
    value,
    percent: (value / span) * 100,
    nextGoal,
  };
}

function getAllMachineTotals() {
  return MACHINES.reduce((sum, machine) => {
    const itemTotals = machine.id === selectedMachine.id
      ? totals
      : loadTotalsForMachine(machine.id);

    sum.totalExpectBalls += Number(itemTotals.totalExpectBalls) || 0;
    return sum;
  }, createEmptyTotals());
}

function setTotalViewMode(mode, shouldScroll = false) {
  totalViewMode = mode === "all" ? "all" : "selected";
  localStorage.setItem(LS_TOTAL_VIEW_MODE, totalViewMode);

  $("totalTabAll")?.classList.toggle("is-active", totalViewMode === "all");
  $("totalTabSelected")?.classList.toggle("is-active", totalViewMode === "selected");
  document.body.classList.toggle("is-total-all-mode", totalViewMode === "all");

  renderMachineTotalCards();

  if (shouldScroll) {
    $("totalCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderMachineTotalCards() {
  const wrap = $("machineTotalCards");
  if (!wrap) return;

  wrap.innerHTML = "";

  const selectedHeading = document.querySelector("#totalCard .section-title");
  if (selectedHeading) {
    selectedHeading.textContent = totalViewMode === "all" ? "全機種累計" : "選択機種累計";
  }

  if (totalViewMode === "all") {
    renderAllMachineTotalCard(wrap);
    return;
  }

  const source = [selectedMachine];

  const machinesToShow = source
    .map((machine) => ({
      machine,
      totals: machine.id === selectedMachine.id ? totals : loadTotalsForMachine(machine.id),
    }))
    .filter(({ machine, totals: itemTotals }) => (
      totalViewMode === "selected" ||
      machine.id === selectedMachine.id ||
      hasAnyTotals(itemTotals)
    ));

  for (const { machine, totals: itemTotals } of machinesToShow) {
    const expectBalls = Number(itemTotals.totalExpectBalls) || 0;
    const expectYen = calcExpectationYenFromBalls(expectBalls);
    const ballText = expectBalls > 0 ? `+${fmtInt(expectBalls)}` : fmtInt(expectBalls);
    const yenText = expectYen > 0 ? `+${fmtInt(expectYen)}` : fmtInt(expectYen);
    const hit = Number(itemTotals.totalHitCount) || 0;
    const spin = Number(itemTotals.totalSpin) || 0;
    const avgRate =
      itemTotals.totalConsumedK > 0
        ? (spin / itemTotals.totalConsumedK) * 250
        : 0;
    const avgOwnedRatio = calcWeightedAverage(
      itemTotals.totalOwnedRatioWeighted,
      itemTotals.totalOwnedRatioCount
    );
    const avgTrueBorder = calcWeightedAverage(
      itemTotals.totalTrueBorderWeighted,
      itemTotals.totalTrueBorderCount
    );
    const progress = getGoalProgress(expectBalls);

    const card = document.createElement("article");
    card.className = "machine-total-card";
    if (machine.id === selectedMachine.id) card.classList.add("is-current");

    const title = document.createElement("h3");
    title.className = "machine-total-card__title";
    title.textContent = machine.name;
    card.appendChild(title);

    const addMetricRow = (label, valueBuilder, extraClass = "") => {
      const row = document.createElement("p");
      row.className = `machine-total-card__metric${extraClass ? ` ${extraClass}` : ""}`;
      const labelEl = document.createElement("span");
      labelEl.className = "machine-total-card__metric-label";
      labelEl.textContent = label;
      const colonEl = document.createElement("span");
      colonEl.className = "machine-total-card__metric-colon";
      colonEl.textContent = "：";
      const valueEl = document.createElement("span");
      valueEl.className = "machine-total-card__metric-value";
      valueBuilder(valueEl);
      row.appendChild(labelEl);
      row.appendChild(colonEl);
      row.appendChild(valueEl);
      return row;
    };

    card.appendChild(addMetricRow("累積期待値", (valueEl) => {
      valueEl.textContent = `${ballText}玉（${yenText}円）`;
      setSignedColor(valueEl, expectBalls);
    }, "machine-total-card__metric--ev"));

    card.appendChild(addMetricRow("初当たり確率", (valueEl) => {
      valueEl.textContent = hit > 0 && spin > 0
        ? `${hit} / ${fmtInt(spin)} = 1 / ${Math.round(spin / hit)}`
        : `${hit} / ${fmtInt(spin)} = —`;
    }));

    const outcomeList = document.createElement("div");
    outcomeList.className = "machine-total-card__outcomes";

    const addOutcomeRow = (label, count) => {
      const safeCount = Number(count) || 0;
      if (safeCount <= 0 || hit <= 0) return;
      const pct = hit > 0 ? Math.round((safeCount / hit) * 100) : 0;
      const row = document.createElement("p");
      const name = document.createElement("span");
      name.className = "machine-total-card__outcome-label";
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "machine-total-card__outcome-value";
      value.textContent = `${fmtInt(safeCount)}/${fmtInt(hit)}\uff08${pct}%\uff09`;
      row.appendChild(name);
      row.appendChild(value);
      outcomeList.appendChild(row);
    };

    addOutcomeRow("\u5358\u767a", itemTotals.totalTanCount);
    addOutcomeRow("\u30e9\u30c3\u30b7\u30e5", itemTotals.totalRushCount);
    addOutcomeRow("LT", itemTotals.totalLtCount);
    if (outcomeList.children.length > 0) card.appendChild(outcomeList);

    const rushAvg = itemTotals.totalRushPayoutDispCount > 0
      ? Math.round(itemTotals.totalRushPayoutDispSum / itemTotals.totalRushPayoutDispCount)
      : null;
    const ltAvg = itemTotals.totalLtPayoutDispCount > 0
      ? Math.round(itemTotals.totalLtPayoutDispSum / itemTotals.totalLtPayoutDispCount)
      : null;

    if (rushAvg !== null || ltAvg !== null) {
      if (rushAvg !== null) {
        const rushAvgLine = document.createElement("p");
        rushAvgLine.className = "machine-total-card__payout-average";
        rushAvgLine.textContent = `ラッシュ時平均出玉 ${fmtInt(rushAvg)}`;
        card.appendChild(rushAvgLine);
      }

      if (ltAvg !== null) {
        const ltAvgLine = document.createElement("p");
        ltAvgLine.className = "machine-total-card__payout-average";
        ltAvgLine.textContent = `LT時平均出玉 ${fmtInt(ltAvg)}`;
        card.appendChild(ltAvgLine);
      }
    }

    const ownedBallsTotal =
      (Number(itemTotals.totalOwnedBallsUsed) || 0) +
      (Number(itemTotals.totalOutputBallsUsed) || 0);
    card.appendChild(addMetricRow("累計投資", (valueEl) => {
      valueEl.textContent = `現金${fmtInt(itemTotals.totalInvestYen)}円 / 持ち玉${fmtInt(ownedBallsTotal)}玉`;
    }, "machine-total-card__metric--invest"));

    card.appendChild(addMetricRow("持ち玉比率", (valueEl) => {
      valueEl.textContent = formatOwnedRatioForTotals(itemTotals);
    }));

    card.appendChild(addMetricRow("真ボーダー", (valueEl) => {
      valueEl.textContent = avgTrueBorder !== null
        ? `${fmtRate1(avgTrueBorder)} 回/k`
        : "—";
    }));

    card.appendChild(addMetricRow("累計回転率", (valueEl) => {
      valueEl.appendChild(document.createTextNode(`${fmtRate1(avgRate)} 回/k`));
      if (avgTrueBorder !== null && Number.isFinite(avgTrueBorder)) {
        const rateDiff = avgRate - avgTrueBorder;
        const diffSpan = document.createElement("span");
        diffSpan.className = "rate-diff";
        if (rateDiff > 0) diffSpan.classList.add("is-plus");
        else if (rateDiff < 0) diffSpan.classList.add("is-minus");
        diffSpan.textContent = ` (${rateDiff >= 0 ? "+" : ""}${fmtRate1(rateDiff)})`;
        valueEl.appendChild(diffSpan);
      }
    }));

    const goal = document.createElement("div");
    goal.className = "goal";

    goal.appendChild(addMetricRow("目標期待値", (valueEl) => {
      valueEl.textContent = `${fmtInt(GOAL_STEPS[progress.index])}円（${GOAL_LEVELS[progress.index]}）`;
    }, "goal-title"));

    const bar = document.createElement("progress");
    bar.value = progress.value;
    bar.max = progress.max;
    bar.classList.add(getGoalColorClass(progress.index));
    goal.appendChild(bar);

    goal.appendChild(addMetricRow("達成率", (valueEl) => {
      valueEl.textContent = `${(Math.floor(Math.min(100, progress.percent) * 10) / 10).toFixed(1)} %`;
    }));
    card.appendChild(goal);

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "※通常ボーダーは選択交換率、真ボーダーは持ち玉比率を加味、期待値は等価換算です";
    card.appendChild(note);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "machine-reset-btn";
    reset.dataset.machineId = machine.id;
    reset.textContent = "リセット";
    card.appendChild(reset);

    wrap.appendChild(card);
  }
}

function renderAllMachineTotalCard(wrap) {
  const allTotals = getAllMachineTotals();
  const expectBalls = Number(allTotals.totalExpectBalls) || 0;
  const expectYen = calcExpectationYenFromBalls(expectBalls);
  const ballText = expectBalls > 0 ? `+${fmtInt(expectBalls)}` : fmtInt(expectBalls);
  const yenText = expectYen > 0 ? `+${fmtInt(expectYen)}` : fmtInt(expectYen);
  const progress = getGoalProgress(expectBalls);

  const card = document.createElement("article");
  card.className = "machine-total-card machine-total-card--summary";

  const title = document.createElement("h3");
  title.className = "machine-total-card__title";
  title.textContent = "全機種合計";
  card.appendChild(title);

  const totalLine = document.createElement("p");
  totalLine.className = "machine-total-card__ev";
  totalLine.appendChild(document.createTextNode("累積期待値："));
  const totalValue = document.createElement("span");
  totalValue.textContent = `${ballText}玉（${yenText}円）`;
  setSignedColor(totalValue, expectBalls);
  totalLine.appendChild(totalValue);
  card.appendChild(totalLine);

  const goalTitle = document.createElement("p");
  goalTitle.className = "machine-total-card__goal-label";
    goalTitle.textContent = getGoalLabel(progress.index);
  card.appendChild(goalTitle);

  const goal = document.createElement("div");
  goal.className = "goal";

  const bar = document.createElement("progress");
  bar.value = progress.value;
  bar.max = progress.max;
  bar.classList.add(getGoalColorClass(progress.index));
  goal.appendChild(bar);

  const percent = document.createElement("p");
  percent.textContent = `達成率：${(Math.floor(Math.min(100, progress.percent) * 10) / 10).toFixed(1)} %`;
  goal.appendChild(percent);

  card.appendChild(goal);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "machine-reset-btn all-machine-reset-btn";
  reset.dataset.action = "resetAllMachines";
  reset.textContent = "全機種リセット";
  card.appendChild(reset);

  wrap.appendChild(card);
}

function updateView() {
  const totalEl = $("total");
  if (totalEl) {
    const b = totals.totalExpectBalls;

    const yen = calcExpectationYenFromBalls(b);
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
        `初当たり確率：${hit} / ${fmtInt(spin)} = 1 / ${Math.round(spin / hit)}`;
    } else {
      spinEl.innerText =
        `初当たり確率：${hit} / ${fmtInt(spin)} = —`;
    }
  }

  const invEl = $("totalInvest");
  if (invEl) {
    const ownedBallsTotal =
      (Number(totals.totalOwnedBallsUsed) || 0) +
      (Number(totals.totalOutputBallsUsed) || 0);
    invEl.innerText =
      `累計投資：現金${fmtInt(totals.totalInvestYen)}円 / 持ち玉${fmtInt(ownedBallsTotal)}玉`;
  }

  const avgRate =
    totals.totalConsumedK > 0
      ? (totals.totalSpin / totals.totalConsumedK) * 250
      : 0;

  const rateEl = $("avgRate");
  if (rateEl) {
    rateEl.innerText = `累計回転率：${fmtRate1(avgRate)} 回/k`;
  }

  const totalEvYenRaw = calcExpectationYenFromBalls(totals.totalExpectBalls);
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
    goalTitle.innerText = getGoalLabel(currentGoalIndex);
  }

const noteEl = document.querySelector(".note");
if (noteEl) {
  noteEl.textContent = "※通常ボーダーは選択交換率、真ボーダーは持ち玉比率を加味、期待値は等価換算です";
}
  renderMachineTotalCards();
}

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
        ? `（+${x.add}回転）`
        : "";

    const investText =
      x.investK && x.investK > 0
        ? ` / ${x.investK.toFixed(1)}k`
        : "";

    const ownedText =
      x.ownedBalls && x.ownedBalls > 0
        ? ` / 持ち玉${fmtInt(x.ownedBalls)}玉`
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
          ${rangeText}${addText}${investText}${ownedText}${payoutText}${endBallsText}
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

function getPlayInputsFromLog() {
  return spinLog.reduce((sum, row) => {
    sum.investK += Number(row.investK) || 0;
    sum.ownedBalls += Number(row.ownedBalls) || 0;
    return sum;
  }, { investK: 0, ownedBalls: 0 });
}

function getOutcomeStatsFromLog() {
  return spinLog.reduce((stats, x) => {
    if (x.label === "単発") {
      stats.tanCount += 1;
      stats.hitCount += 1;
      return stats;
    }

    if (x.label === "RUSH終了") {
      stats.rushCount += 1;
      stats.hitCount += 1;

      const disp = Number(x.payoutDisp ?? x.payout);
      if (Number.isFinite(disp) && disp > 0) {
        stats.rushPayoutDispSum += disp;
        stats.rushPayoutDispCount += 1;
      }
      return stats;
    }

    if (x.label === "LT終了") {
      stats.rushCount += 1;
      stats.ltCount += 1;
      stats.hitCount += 1;

      const disp = Number(x.payoutDisp ?? x.payout);
      if (Number.isFinite(disp) && disp > 0) {
        stats.ltPayoutDispSum += disp;
        stats.ltPayoutDispCount += 1;
      }
    }

    return stats;
  }, {
    hitCount: 0,
    tanCount: 0,
    rushCount: 0,
    ltCount: 0,
    rushPayoutDispSum: 0,
    rushPayoutDispCount: 0,
    ltPayoutDispSum: 0,
    ltPayoutDispCount: 0,
  });
}

function calc() {
  const spinCount = getTotalSpinsFromLog();
  if (spinCount <= 0) { alert("回転ログを入れてください"); return; }
  if (payoutConfirmIndex !== -1) { alert("先に「表記出玉」を確定してください"); return; }
  if (endBallsPending) { alert("先に「持ち玉」を確定してください"); return; }
  if (endBallsYame === null || !Number.isFinite(endBallsYame) || endBallsYame < 0) {
    alert("ヤメ時の持ち玉が未確定です（ヤメ → 持ち玉を確定）");
    return;
  }

  const playInputs = getPlayInputsFromLog();
  const investK = Number(playInputs.investK) || (confirmedInvestYen / 1000);
  const ownedBallsUsed = Number(playInputs.ownedBalls) || confirmedOwnedBalls;
  if ((!Number.isFinite(investK) || investK <= 0) && ownedBallsUsed <= 0) {
    alert("総投資または持ち玉使用がありません");
    return;
  }

  const payout = getTotalPayoutFromLog();
  const endBalls = endBallsYame;
  const cashInvestBalls = investK * 250;
  const investBalls = cashInvestBalls + ownedBallsUsed;
  const consumedBalls = investBalls + payout - endBalls;
  const outputUsedBalls = Math.max(0, payout - endBalls);
  const playSourceBalls = cashInvestBalls + ownedBallsUsed + outputUsedBalls;
  const ownedRatio = playSourceBalls > 0
    ? Math.max(0, Math.min(1, (ownedBallsUsed + outputUsedBalls) / playSourceBalls))
    : 0;
  const trueBorder = calcTrueBorder(ownedRatio);

  if (!(consumedBalls > 0)) {
    alert("出玉・持ち玉の入力が不正です（消費玉が0以下）");
    return;
  }

  const rotationRate = (spinCount / consumedBalls) * 250;
  const todayBalls = calcExpectationBalls(rotationRate, spinCount);
  const todayYen = calcExpectationYenFromBalls(todayBalls);

  const outcomeStats = getOutcomeStatsFromLog();

  totals.totalExpectBalls += todayBalls;
  totals.totalExpectYen = (Number(totals.totalExpectYen) || 0) + todayYen;
  totals.totalSpin += spinCount;
  totals.totalInvestYen += confirmedInvestYen;
  totals.totalOwnedBallsUsed = (Number(totals.totalOwnedBallsUsed) || 0) + confirmedOwnedBalls;
  totals.totalOutputBallsUsed = (Number(totals.totalOutputBallsUsed) || 0) + outputUsedBalls;
  totals.totalKInvested += investK;
  totals.totalHitCount += outcomeStats.hitCount;
  totals.totalTanCount = (Number(totals.totalTanCount) || 0) + outcomeStats.tanCount;
  totals.totalRushCount = (Number(totals.totalRushCount) || 0) + outcomeStats.rushCount;
  totals.totalLtCount = (Number(totals.totalLtCount) || 0) + outcomeStats.ltCount;
  totals.totalRushPayoutDispSum = (Number(totals.totalRushPayoutDispSum) || 0) + outcomeStats.rushPayoutDispSum;
  totals.totalRushPayoutDispCount = (Number(totals.totalRushPayoutDispCount) || 0) + outcomeStats.rushPayoutDispCount;
  totals.totalLtPayoutDispSum = (Number(totals.totalLtPayoutDispSum) || 0) + outcomeStats.ltPayoutDispSum;
  totals.totalLtPayoutDispCount = (Number(totals.totalLtPayoutDispCount) || 0) + outcomeStats.ltPayoutDispCount;
  totals.totalConsumedK += consumedBalls;
  totals.totalOwnedRatioWeighted = (Number(totals.totalOwnedRatioWeighted) || 0) + ownedRatio * spinCount;
  totals.totalOwnedRatioCount = (Number(totals.totalOwnedRatioCount) || 0) + spinCount;
  if (trueBorder !== null) {
    totals.totalTrueBorderWeighted = (Number(totals.totalTrueBorderWeighted) || 0) + trueBorder * spinCount;
    totals.totalTrueBorderCount = (Number(totals.totalTrueBorderCount) || 0) + spinCount;
  }

  saveTotalsForSelectedMachine();

  if (selectedStore) {
    addOwnedBalance(endBalls);
  }

  const finalEl = $("finalResult");
  const borderVal = getCurrentBorder();
  const diffBorder = trueBorder ?? borderVal;
  const rateDiff = Number.isFinite(diffBorder) ? rotationRate - diffBorder : null;
  const rateDiffText = rateDiff === null
    ? ""
    : ` (${rateDiff >= 0 ? "+" : ""}${fmtRate1(rateDiff)})`;
  const rateDiffClass =
    rateDiff === null || rateDiff === 0
      ? ""
      : rateDiff > 0
        ? "is-plus"
        : "is-minus";
  if (finalEl) {
    const bonusBalls = payout - endBalls;
    const bonusK = bonusBalls / 250;

    finalEl.innerHTML = "";

    const formulaLine = document.createElement("div");
    formulaLine.textContent =
      `${fmtInt(spinCount)} / ( 現金${fmtRate1(investK)}k + 持ち玉${fmtInt(ownedBallsUsed)}玉 + 出玉${fmtRate2(bonusK)}k玉 )`;
    finalEl.appendChild(formulaLine);

    const ownedRatioLine = document.createElement("div");
    ownedRatioLine.textContent = `持ち玉比率：${Math.round(ownedRatio * 100)}%`;
    finalEl.appendChild(ownedRatioLine);

    if (trueBorder !== null) {
      const trueBorderLine = document.createElement("div");
      trueBorderLine.textContent = `真ボーダー：${fmtRate1(trueBorder)} 回/k`;
      finalEl.appendChild(trueBorderLine);
    }

    const rateLine = document.createElement("div");
    rateLine.appendChild(document.createTextNode(`今回の回転率：${fmtRate1(rotationRate)} 回/k`));
    if (rateDiffText) {
      const diffSpan = document.createElement("span");
      diffSpan.className = `rate-diff ${rateDiffClass}`;
      diffSpan.textContent = rateDiffText;
      rateLine.appendChild(diffSpan);
    }
    finalEl.appendChild(rateLine);

    const evLine = document.createElement("div");
    evLine.textContent = `今回の期待値：${todayYen >= 0 ? "+" : ""}${fmtInt(todayYen)}円`;
    finalEl.appendChild(evLine);
  }

  updateFinalRateMeter(rotationRate, diffBorder);

  hasStarted = false;
  updateStartButton();
  updateView();

  confirmedInvestYen = 0;
  confirmedOwnedBalls = 0;
  renderConfirmedInvest();
  renderConfirmedOwned();
  renderStoreControls();
  saveSession();

  setInvestYen(0);
  lastMidCheckBalls = null;
  scrollToFinalCalcCard();
}

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

function resetAllMachineTotals() {
  if (!confirm("本当に全機種のログを削除しますか？")) return;

  for (const machine of MACHINES) {
    localStorage.setItem(getTotalsKey(machine.id), JSON.stringify(createEmptyTotals()));
  }

  clearAllDailySessions();
  if (confirmedOwnedBalls > 0) addOwnedBalance(confirmedOwnedBalls);
  clearCurrentDailyState();

  totals = createEmptyTotals();
  currentGoalIndex = 0;

  updateView();
}

function resetMachineTotals(machineId) {
  const machine = MACHINES.find((m) => m.id === machineId);
  if (!machine) return;

  if (machine.id === selectedMachine.id) {
    resetSelectedMachineTotals();
    return;
  }

  if (!confirm(`「${machine.name}」の累積データをリセットしますか？`)) return;

  localStorage.setItem(getTotalsKey(machine.id), JSON.stringify(createEmptyTotals()));
  updateView();
}

function resetSelectedMachineTotals() {
  if (!confirm(`「${selectedMachine.name}」の累積データをリセットしますか？`)) return;

  totals = createEmptyTotals();

  currentGoalIndex = 0;

  saveTotalsForSelectedMachine();

  const resultEl = $("result");
  if (resultEl) {
    resultEl.innerText = "";
    setResultTierClass("");
  }

  hasStarted = false;
  updateStartButton();

  if (confirmedOwnedBalls > 0) addOwnedBalance(confirmedOwnedBalls);
  setInvestYen(0);
  setOwnedUseBalls(0);
  confirmedInvestYen = 0;
  confirmedOwnedBalls = 0;
  renderConfirmedInvest();
  renderConfirmedOwned();

  clearSession();
  resetSpinLog(true);
  setCounterInputLocked(false);

  updateView();
}

function resetTodayLog() {
  if (!confirm("当日の回転ログをリセットしますか？")) return;

  setInvestYen(0);
  setOwnedUseBalls(0);
  if (confirmedOwnedBalls > 0) addOwnedBalance(confirmedOwnedBalls);
  confirmedInvestYen = 0;
  confirmedOwnedBalls = 0;
  renderConfirmedInvest();
  renderConfirmedOwned();

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

  const finalEl = $("finalResult");
  if (finalEl) finalEl.innerText = "";
  $("finalRateMeter")?.classList.add("is-hidden");
  const finalNeedle = $("finalMeterNeedle");
  if (finalNeedle) finalNeedle.style.left = "50%";

  clearSession();
}

function calcGoalIndex(totalEvYen) {
  const v = Math.max(0, Number(totalEvYen) || 0);

  for (let i = 0; i < GOAL_STEPS.length; i++) {
    if (v < GOAL_STEPS[i]) return i;
  }
  return GOAL_STEPS.length - 1;
}

const GOAL_STEPS = [
  1_000,
  5_000,
  10_000,
  30_000,
  100_000,
  1_000_000,
];

const GOAL_LEVELS = ["Lv.1", "Lv.2", "Lv.3", "Lv.4", "Lv.5", "Lv.EX"];

function getGoalLabel(index) {
  const safeIndex = Math.max(0, Math.min(GOAL_STEPS.length - 1, Number(index) || 0));
  return `目標期待値：${fmtInt(GOAL_STEPS[safeIndex])}円（${GOAL_LEVELS[safeIndex]}）`;
}

function getGoalColorClass(index) {
  switch (index) {
    case 0: return "goal-blue";
    case 1: return "goal-yellow";
    case 2: return "goal-green";
    case 3: return "goal-red";
    default: return "goal-rainbow";
  }
}


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

function showMidCheck() {
  const playInputs = getPlayInputsFromLog();
  if (!(confirmedInvestYen > 0 || confirmedOwnedBalls > 0 || playInputs.investK > 0 || playInputs.ownedBalls > 0)) {
    alert("投資額または持ち玉使用を追加してください");
    scrollToInvestCard();
    return;
  }

  $("midSpinVal").textContent = "—";
  $("midRateVal").textContent = "—";
  setText("midMeterBorderValue", "—");
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
  setText("midMeterBorderValue", `${fmtRate1(border)}`);

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
    `現在のデータカウンター回転数を入力してください\n（開始 ${nextStartCounter} 以上）`
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

  const playInputs = getPlayInputsFromLog();
  const investK = Number(playInputs.investK) || (confirmedInvestYen / 1000);
  const ownedBallsUsed = Number(playInputs.ownedBalls) || confirmedOwnedBalls;
  const investBalls = investK * 250 + ownedBallsUsed;
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
  setText("midMeterBorderValue", fmtRate1(border));

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
  setText("finalMeterBorderValue", fmtRate1(border));

  let pct = ((rotationRate - min) / (max - min)) * 100;
  pct = Math.max(0, Math.min(100, pct));

  needle.style.left = `${pct}%`;
}

function closeMidCheck() {
  $("midCheckCard")?.classList.add("is-hidden");
  $("midOverlay")?.classList.add("is-hidden");

  const needle = $("midMeterNeedle");
  if (needle) needle.style.left = "50%";
  setText("midMeterBorderValue", "—");
}

function init() {
  initMachineSelect();
  checkDailyLogRollover();
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

  $("add500")?.addEventListener("click", () => addQuickAmount(playSource === "owned" ? 125 : 500));
  $("add1000")?.addEventListener("click", () => addQuickAmount(playSource === "owned" ? 250 : 1000));
  $("add5000")?.addEventListener("click", () => addQuickAmount(playSource === "owned" ? 1250 : 5000));
  $("sub500")?.addEventListener("click", () => addQuickAmount(playSource === "owned" ? -125 : -500));
  $("ownedUseBtn")?.addEventListener("click", confirmOwnedUse);
  $("playCashBtn")?.addEventListener("click", () => setPlaySource("cash"));
  $("playOwnedBtn")?.addEventListener("click", () => setPlaySource("owned"));
  $("skipInvest")?.addEventListener("click", skipInvest);
  $("clearInvest")?.addEventListener("click", clearCurrentPlayInput);

  $("btnMidCheck")?.addEventListener("click", showMidCheck);
  $("midCheckClose")?.addEventListener("click", closeMidCheck);
  $("midOverlay")?.addEventListener("click", closeMidCheck);
  $("midBallsConfirm")?.addEventListener("click", confirmMidCheck);

  $("calcBtn")?.addEventListener("click", confirmInvest);
  $("finalCalcBtn")?.addEventListener("click", () => {
    flashFinalCalcButton();
    calc();
  });
  $("undoInvest")?.addEventListener("click", undoLastInvest);

  $("resetBtn")?.addEventListener("click", resetSelectedMachineTotals);
  $("machineTotalCards")?.addEventListener("click", (e) => {
    const allReset = e.target.closest("[data-action='resetAllMachines']");
    if (allReset) {
      resetAllMachineTotals();
      return;
    }

    const btn = e.target.closest(".machine-reset-btn");
    if (!btn) return;
    resetMachineTotals(btn.dataset.machineId);
  });
  $("totalTabAll")?.addEventListener("click", () => setTotalViewMode("all", true));
  $("totalTabSelected")?.addEventListener("click", () => setTotalViewMode("selected", true));

  $("investYen")?.addEventListener("change", () => {
    const val = Number($("investYen").value);
    if (!Number.isFinite(val)) return;
    setInvestYen(val);
  });

  $("ownedUseBalls")?.addEventListener("change", () => {
    const val = Number($("ownedUseBalls").value);
    if (!Number.isFinite(val)) return;
    setOwnedUseBalls(val);
  });
  $("ownedBalanceSaveBtn")?.addEventListener("click", saveOwnedBalanceInput);
  $("ownedBalanceInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveOwnedBalanceInput();
    }
  });

  $("storeSelect")?.addEventListener("change", () => {
    selectStore($("storeSelect").value);
  });
  $("storePickerOpen")?.addEventListener("click", openStorePicker);
  $("storePickerClose")?.addEventListener("click", closeStorePicker);
  $("storePickerOverlay")?.addEventListener("click", closeStorePicker);
  $("storeSearchInput")?.addEventListener("input", renderStorePickerList);
  $("storePickerModal")?.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest("[data-store-delete]");
    if (deleteBtn) {
      deleteStore(deleteBtn.dataset.storeDelete);
      return;
    }

    const selectBtn = e.target.closest("[data-store-name]");
    if (!selectBtn) return;
    selectStore(selectBtn.dataset.storeName);
    closeStorePicker();
  });
  $("storeAddBtn")?.addEventListener("click", startStoreAdd);
  $("storeSaveBtn")?.addEventListener("click", saveNewStore);
  $("storeCancelBtn")?.addEventListener("click", cancelStoreAdd);
  $("storeName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveNewStore();
    }
  });

  enableInvestFastTap(".invest-buttons");

  selectedStore = normalizeStoreName(localStorage.getItem(LS_SELECTED_STORE));
  if (selectedStore) saveStoreName(selectedStore);
  const initialStoreExchange = getStoreExchange(selectedStore);
  if (initialStoreExchange !== null) {
    setSelectedExchange(initialStoreExchange, false, false);
  } else if (selectedStore) {
    saveStoreExchange(selectedStore, selectedExchange);
  }
  renderStoreControls();
  setPlaySource(playSource);

  const restored = loadSession();
  if (restored) {
    renderSpinLog();
    if (payoutConfirmIndex !== -1) $("payoutPanel")?.classList.remove("is-hidden");
    if (endBallsPending) $("endBallsPanel")?.classList.remove("is-hidden");
    setLogMode(pendingIndex !== -1 ? "afterHit" : "main");
  } else {
    resetSpinLog();
    confirmedInvestYen = 0;
    confirmedOwnedBalls = 0;
    renderConfirmedInvest();
    renderConfirmedOwned();
  }

  currentGoalIndex = 0;
  updateStartButton();
  setTotalViewMode(totalViewMode);
  updateView();
  updateHitOptionButtons();
  renderMachineInfo(false);

  const goalBar = $("goalBar");
  if (goalBar && "IntersectionObserver" in window) {
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
  } else if (goalBar) {
    goalBar.dataset.inView = "1";
    animateProgressBar(goalBar, Number(goalBar.dataset.targetValue) || 0, 650);
  }

  saveSession();

  $("machinePickerOpen")?.addEventListener("click", openMachinePicker);
  $("machinePickerClose")?.addEventListener("click", closeMachinePicker);
  $("machinePickerOverlay")?.addEventListener("click", closeMachinePicker);
  $("machineSearchInput")?.addEventListener("input", renderMachinePickerList);
  $("machinePickerModal")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".machine-picker-tab");
    if (tab) {
      document.querySelectorAll(".machine-picker-tab").forEach((el) => {
        el.classList.toggle("is-active", el === tab);
      });
      renderMachinePickerList();
      return;
    }

    const item = e.target.closest(".machine-picker-item");
    if (!item) return;
    const sel = $("machineSelect");
    if (!sel) return;
    sel.value = item.dataset.machineId;
    sel.dispatchEvent(new Event("change"));
    closeMachinePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMachinePicker();
      closeStorePicker();
    }
  });

  $("favoriteBtn")?.addEventListener("click", () => {
    const favBtn = $("favoriteBtn");
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
    favBtn?.classList.remove("is-sparkling");
    void favBtn?.offsetWidth;
    favBtn?.classList.add("is-sparkling");
    window.setTimeout(() => favBtn?.classList.remove("is-sparkling"), 560);
    renderMachinePickerList();
    updateRushEndAdjustUI();
  });

  setInterval(checkDailyLogRollover, 60 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDailyLogRollover();
  });
}

document.addEventListener("DOMContentLoaded", init);

