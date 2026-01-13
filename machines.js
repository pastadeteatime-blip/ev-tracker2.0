// machines.js
// 機種データ専用ファイル

window.MACHINES = [
  {
    id: "madoka3",
    name: "P魔法少女まどか☆マギカ3",
    perSpinPayBalls: 14.85,
    costPer1kBalls: 250,
    border: { 25: 17.1, 28: 18.0, 30: 18.5, 33: 19.2 },
    jackpot: "1/199",
    rushEntry: "50%",
    hitOptions: ["tan", "rushEnd", "ltEnd"],
    restart: { tan: 0, rushEnd: 64, ltEnd: 124 },
    payoutRule: {
      baseDisp: 400,
      baseNet: 360,
      stepDisp: 1500,
      stepNet: 1400,
      unit: 15,
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
    hitOptions: ["tan", "rushEnd", "charge" ],
    restart: { tan: 0, rushEnd: 100 , charge:0},
    tanPayout: { disp: 300, net: 280 },
    chargePayout: { disp: 300, net: 280 },
  },

  {
    id: "shamanking",
    name: "eシャーマンキング でっけぇなあver.",
    perSpinPayBalls: 8.08,
    costPer1kBalls: 250,
    border: { 25: 31.7, 28: 33.5, 30: 34.6, 33: 36.2 },
    jackpot: "1/349",
    rushEntry: "50%",
    hitOptions: ["tan", "rushEnd", "ltEnd"],
    restart: { tan: 0, rushEnd: 60, ltEnd: 120 },
    tanPayout: { disp: 450, net: 360 },
  },

  {
    id: "tokyoGhoul",
    name: "e東京喰種W",
    perSpinPayBalls: 14.99,
    costPer1kBalls: 250,
    border: { 25: 16.68, 28: 18.68, 30: 20.01, 33: 22.01 },
    jackpot: "1/199",
    rushEntry: "50%",
    hitOptions: ["charge", "tan", "rushEnd"],
    restart: {charge:0,  tan: 0, rushEnd: 130 },
    tanPayout: { disp: 1500, net: 1350 },
    chargePayout: { disp: 300, net: 280 },
  },

  {
    id: "eva17_hajimari",
    name: "e新世紀エヴァンゲリオン ～はじまりの記憶～",
    perSpinPayBalls: 14.84,
    costPer1kBalls: 250,
    border: { 25: 16.85, 28: 18.87, 30: 20.22, 33: 22.24 },
    jackpot: "1/350",
    rushEntry: "61%",
    hitOptions: ["charge", "tan", "rushEnd"],
    restart: { charge:0, tan: 100, rushEnd: 157 },
    chargePayout: { disp: 300, net: 280 },
    tanPayout: { disp: 300, net: 280 },
  },
];
