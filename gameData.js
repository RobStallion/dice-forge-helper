// Canonical Dice Forge Base Game Face & Pool Definitions

const STARTING_LIGHT_DIE = [
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_sun_1', name: '1 Sun', kind: 'fixed', rewards: { sun: 1 }, theme: 'sun', isStarting: true }
];

const STARTING_DARK_DIE = [
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_gold_1', name: '1 Gold', kind: 'fixed', rewards: { gold: 1 }, theme: 'gold', isStarting: true },
  { id: 'start_moon_1', name: '1 Moon', kind: 'fixed', rewards: { moon: 1 }, theme: 'moon', isStarting: true },
  { id: 'start_glory_2', name: '2 Glory', kind: 'fixed', rewards: { glory: 2 }, theme: 'glory', isStarting: true }
];

// All purchasable Sanctuary faces and how they group into Temple pools
const SANCTUARY_POOLS = [
  {
    poolId: 'pool_2g_gold',
    cost: 2,
    poolName: '2 Gold — 3 Gold',
    isMixed: false,
    faces: [
      { id: 's_2g_3gold', name: '3 Gold', kind: 'fixed', rewards: { gold: 3 }, theme: 'gold', cost: 2 }
    ]
  },
  {
    poolId: 'pool_2g_moon',
    cost: 2,
    poolName: '2 Gold — 1 Moon',
    isMixed: false,
    faces: [
      { id: 's_2g_1moon', name: '1 Moon', kind: 'fixed', rewards: { moon: 1 }, theme: 'moon', cost: 2 }
    ]
  },
  {
    poolId: 'pool_3g_gold',
    cost: 3,
    poolName: '3 Gold — 4 Gold',
    isMixed: false,
    faces: [
      { id: 's_3g_4gold', name: '4 Gold', kind: 'fixed', rewards: { gold: 4 }, theme: 'gold', cost: 3 }
    ]
  },
  {
    poolId: 'pool_3g_sun',
    cost: 3,
    poolName: '3 Gold — 1 Sun',
    isMixed: false,
    faces: [
      { id: 's_3g_1sun', name: '1 Sun', kind: 'fixed', rewards: { sun: 1 }, theme: 'sun', cost: 3 }
    ]
  },
  {
    poolId: 'pool_4g_mixed',
    cost: 4,
    poolName: '4 Gold — Mixed Pool',
    isMixed: true,
    faces: [
      { id: 's_4g_6gold', name: '6 Gold', kind: 'fixed', rewards: { gold: 6 }, theme: 'gold', cost: 4 },
      { id: 's_4g_2gold_1moon', name: '2 Gold + 1 Moon', kind: 'fixed', rewards: { gold: 2, moon: 1 }, theme: 'combo', cost: 4 },
      { id: 's_4g_1glory_1sun', name: '1 Glory + 1 Sun', kind: 'fixed', rewards: { glory: 1, sun: 1 }, theme: 'combo', cost: 4 },
      {
        id: 's_4g_choice_1',
        name: '1 Gold / 1 Sun / 1 Moon',
        kind: 'choice',
        choices: [
          { label: '+1 Gold', rewards: { gold: 1 } },
          { label: '+1 Sun', rewards: { sun: 1 } },
          { label: '+1 Moon', rewards: { moon: 1 } }
        ],
        theme: 'choice',
        cost: 4
      }
    ]
  },
  {
    poolId: 'pool_5g_choice',
    cost: 5,
    poolName: '5 Gold — 3 Gold or 2 Glory',
    isMixed: false,
    faces: [
      {
        id: 's_5g_3gold_or_2glory',
        name: '3 Gold or 2 Glory',
        kind: 'choice',
        choices: [
          { label: '+3 Gold', rewards: { gold: 3 } },
          { label: '+2 Glory', rewards: { glory: 2 } }
        ],
        theme: 'choice',
        cost: 5
      }
    ]
  },
  {
    poolId: 'pool_6g_moon',
    cost: 6,
    poolName: '6 Gold — 2 Moon',
    isMixed: false,
    faces: [
      { id: 's_6g_2moon', name: '2 Moon', kind: 'fixed', rewards: { moon: 2 }, theme: 'moon', cost: 6 }
    ]
  },
  {
    poolId: 'pool_8g_sun',
    cost: 8,
    poolName: '8 Gold — 2 Sun',
    isMixed: false,
    faces: [
      { id: 's_8g_2sun', name: '2 Sun', kind: 'fixed', rewards: { sun: 2 }, theme: 'sun', cost: 8 }
    ]
  },
  {
    poolId: 'pool_8g_glory',
    cost: 8,
    poolName: '8 Gold — 3 Glory',
    isMixed: false,
    faces: [
      { id: 's_8g_3glory', name: '3 Glory', kind: 'fixed', rewards: { glory: 3 }, theme: 'glory', cost: 8 }
    ]
  },
  {
    poolId: 'pool_12g_mixed',
    cost: 12,
    poolName: '12 Gold — High Sanctuary',
    isMixed: true,
    faces: [
      { id: 's_12g_4glory', name: '4 Glory', kind: 'fixed', rewards: { glory: 4 }, theme: 'glory', cost: 12 },
      {
        id: 's_12g_all4',
        name: '1 Gold + 1 Sun + 1 Moon + 1 Glory',
        kind: 'fixed',
        rewards: { gold: 1, sun: 1, moon: 1, glory: 1 },
        theme: 'combo',
        cost: 12
      },
      {
        id: 's_12g_2glory_2moon',
        name: '2 Glory + 2 Moon',
        kind: 'fixed',
        rewards: { glory: 2, moon: 2 },
        theme: 'combo',
        cost: 12
      },
      {
        id: 's_12g_choice_2',
        name: '2 Gold / 2 Sun / 2 Moon',
        kind: 'choice',
        choices: [
          { label: '+2 Gold', rewards: { gold: 2 } },
          { label: '+2 Sun', rewards: { sun: 2 } },
          { label: '+2 Moon', rewards: { moon: 2 } }
        ],
        theme: 'choice',
        cost: 12
      }
    ]
  }
];

// Special Garden faces acquired via Heroic Feat cards on the Islands board
const GARDEN_FACES = [
  {
    id: 'g_x3',
    name: '×3 Multiplier',
    cardName: 'Helmet of Invisibility',
    kind: 'multiplier',
    multiplier: 3,
    description: 'Triples the reward of your other die when rolling both dice together.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_mirror',
    name: 'Mirror of the Abyss',
    cardName: 'Mirror of the Abyss',
    kind: 'mirror',
    description: 'Copies the effect of any one die face currently showing on an opponent’s die.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_ship',
    name: 'Celestial Ship',
    cardName: 'Celestial Ship',
    kind: 'choice',
    choices: [
      { label: '+2 Gold', rewards: { gold: 2 } },
      { label: 'Forge with -2 Gold discount (use Sanctuary)', rewards: { gold: 0 }, note: 'Forge discount' }
    ],
    description: 'Gain 2 Gold OR immediately buy & forge a Sanctuary face with a 2-Gold discount.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_shield_gold',
    name: 'Shield (3 Gold / 5 Glory)',
    cardName: "The Guardian's Shield",
    kind: 'shield',
    matchResource: 'gold',
    baseRewards: { gold: 3 },
    matchRewards: { glory: 5 },
    choices: [
      { label: '+3 Gold (No match)', rewards: { gold: 3 } },
      { label: '+5 Glory (Other die has Gold)', rewards: { glory: 5 } }
    ],
    description: 'Gain 5 Glory if your other rolled die grants Gold; otherwise gain 3 Gold.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_shield_sun',
    name: 'Shield (2 Sun / 5 Glory)',
    cardName: "The Guardian's Shield",
    kind: 'shield',
    matchResource: 'sun',
    baseRewards: { sun: 2 },
    matchRewards: { glory: 5 },
    choices: [
      { label: '+2 Sun (No match)', rewards: { sun: 2 } },
      { label: '+5 Glory (Other die has Sun)', rewards: { glory: 5 } }
    ],
    description: 'Gain 5 Glory if your other rolled die grants Sun; otherwise gain 2 Sun.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_shield_moon',
    name: 'Shield (2 Moon / 5 Glory)',
    cardName: "The Guardian's Shield",
    kind: 'shield',
    matchResource: 'moon',
    baseRewards: { moon: 2 },
    matchRewards: { glory: 5 },
    choices: [
      { label: '+2 Moon (No match)', rewards: { moon: 2 } },
      { label: '+5 Glory (Other die has Moon)', rewards: { glory: 5 } }
    ],
    description: 'Gain 5 Glory if your other rolled die grants Moon; otherwise gain 2 Moon.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_shield_glory',
    name: 'Shield (3 Glory / 5 Glory)',
    cardName: "The Guardian's Shield",
    kind: 'shield',
    matchResource: 'glory',
    baseRewards: { glory: 3 },
    matchRewards: { glory: 5 },
    choices: [
      { label: '+3 Glory (No match)', rewards: { glory: 3 } },
      { label: '+5 Glory (Other die has Glory)', rewards: { glory: 5 } }
    ],
    description: 'Gain 5 Glory if your other rolled die grants Glory; otherwise gain 3 Glory.',
    theme: 'special',
    cost: 0
  },
  {
    id: 'g_boar',
    name: 'Tenacious Boar',
    cardName: 'Tenacious Boar',
    kind: 'choice',
    isBoar: true,
    choices: [
      { label: '+1 Gold (Boar bearer)', rewards: { gold: 1 } },
      { label: '+1 Sun (Boar bearer)', rewards: { sun: 1 } },
      { label: '+1 Moon (Boar bearer)', rewards: { moon: 1 } }
    ],
    description: 'Cannot be forged over! Bearer gains 1 Gold/Sun/Moon; Boar owner also gains 1 Sun, 1 Moon, or 3 Glory.',
    theme: 'boar',
    cost: 0
  }
];

const PLAYER_COLORS = [
  { id: 'green', name: 'Green Hero', hex: '#2ecc71' },
  { id: 'blue', name: 'Blue Hero', hex: '#3498db' },
  { id: 'red', name: 'Red Hero', hex: '#e74c3c' },
  { id: 'yellow', name: 'Yellow Hero', hex: '#f1c40f' }
];

function buildSanctuarySupply(playerCount = 4) {
  const isTwoPlayer = Number(playerCount) === 2;
  const supply = [];

  for (const pool of SANCTUARY_POOLS) {
    if (pool.isMixed) {
      // In 3-4P, 1 of each of the 4 mixed faces.
      // In 2P, officially 2 random faces are removed from each pool, so we mark 2 random active (and allow toggling/restocking if desired).
      const indices = [0, 1, 2, 3];
      let activeSet = new Set(indices);
      if (isTwoPlayer) {
        const shuffled = [...indices].sort(() => Math.random() - 0.5);
        activeSet = new Set(shuffled.slice(0, 2));
      }
      pool.faces.forEach((face, idx) => {
        supply.push({
          ...face,
          poolId: pool.poolId,
          poolName: pool.poolName,
          remaining: activeSet.has(idx) ? 1 : 0,
          maxStock: 1
        });
      });
    } else {
      const stock = isTwoPlayer ? 2 : 4;
      const face = pool.faces[0];
      supply.push({
        ...face,
        poolId: pool.poolId,
        poolName: pool.poolName,
        remaining: stock,
        maxStock: stock
      });
    }
  }
  return supply;
}

function createStartingPlayer(index, name, colorObj, playerId) {
  // Starting gold by turn order: 1st = 3, 2nd = 2, 3rd = 1, 4th = 0
  const startingGold = Math.max(0, 3 - index);
  return {
    id: playerId,
    name: name || `Player ${index + 1}`,
    seatIndex: index,
    color: colorObj || PLAYER_COLORS[index % PLAYER_COLORS.length],
    resources: {
      gold: startingGold,
      sun: 0,
      moon: 0,
      glory: 0,
      cardGlory: 0, // Glory points from physical Heroic Feat cards
      hammerProgress: 0, // Optional Blacksmith's Hammer tracker (0-30)
      hasHammer: false,
      chests: 0 // Number of Blacksmith's Chests (+4 Gold, +3 Sun, +3 Moon cap each)
    },
    lightDie: STARTING_LIGHT_DIE.map((f, i) => ({ ...f, slot: i })),
    darkDie: STARTING_DARK_DIE.map((f, i) => ({ ...f, slot: i })),
    lastRoll: {
      lightSlot: 0,
      darkSlot: 0,
      mode: 'none', // 'both' | 'light' | 'dark'
      timestamp: null,
      summary: 'Ready to roll',
      pendingChoices: [] // Array of unresolved choice prompts for this player
    },
    removedFacesCount: 0
  };
}

module.exports = {
  STARTING_LIGHT_DIE,
  STARTING_DARK_DIE,
  SANCTUARY_POOLS,
  GARDEN_FACES,
  PLAYER_COLORS,
  buildSanctuarySupply,
  createStartingPlayer
};
