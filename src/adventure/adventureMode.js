
import { getFirebaseDb } from '../services/firebaseService.js';
import { PUBLIC_PATHS } from '../config.js';
import { CHARACTER_MAP, CHARACTER_LIST } from '../data/characters.js';
import { ref, set, onValue, off, remove } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const rand = (a,b) => a + Math.random() * (b-a);
const norm = (x,y) => {
  const d = Math.hypot(x,y) || 1;
  return { x:x/d, y:y/d };
};

const WORLD = { w: 4203, h: 2346 };
const RESPAWN_MS = 5 * 60 * 1000;

const RECIPES = {
  stone_sword: { name:'돌검', type:'weapon', cost:{ wood:2, stone:8 }, atk:10, effect:'공격력 +10' },
  iron_sword1: { name:'철검1', type:'weapon', cost:{ wood:2, iron:8 }, atk:18, effect:'공격력 +18' },
  iron_sword2: { name:'철검2', type:'weapon', cost:{ wood:4, iron:16 }, atk:30, effect:'공격력 +30' },
  iron_sword3: { name:'철검3', type:'weapon', cost:{ wood:6, iron:28 }, atk:45, effect:'공격력 +45' },
  steel_sword1: { name:'강철검1', type:'weapon', cost:{ wood:6, iron:42, stone:18 }, atk:62, effect:'공격력 +62' },
  steel_sword2: { name:'강철검2', type:'weapon', cost:{ wood:8, iron:65, stone:25 }, atk:82, effect:'공격력 +82' },
  steel_sword3: { name:'강철검3', type:'weapon', cost:{ wood:10, iron:95, stone:35 }, atk:110, effect:'공격력 +110' },
  bow1: { name:'활1', type:'weapon', weaponKind:'bow', cost:{ wood:18, stone:4 }, atk:16, range:360, projectileSpeed:480, effect:'원거리 공격 / 사거리 360' },
  bow2: { name:'활2', type:'weapon', weaponKind:'bow', cost:{ wood:32, stone:10, iron:8 }, atk:27, range:440, projectileSpeed:540, effect:'원거리 공격 / 사거리 440' },
  bow3: { name:'활3', type:'weapon', weaponKind:'bow', cost:{ wood:52, stone:18, iron:18 }, atk:40, range:520, projectileSpeed:610, effect:'원거리 공격 / 사거리 520' },
  steel_bow1: { name:'강철활1', type:'weapon', weaponKind:'bow', cost:{ wood:42, iron:40, stone:18 }, atk:54, range:590, projectileSpeed:650, effect:'강철 원거리 공격 / 사거리 590' },
  steel_bow2: { name:'강철활2', type:'weapon', weaponKind:'bow', cost:{ wood:60, iron:66, stone:28 }, atk:72, range:660, projectileSpeed:700, effect:'강철 원거리 공격 / 사거리 660' },
  steel_bow3: { name:'강철활3', type:'weapon', weaponKind:'bow', cost:{ wood:80, iron:95, stone:40 }, atk:94, range:740, projectileSpeed:760, effect:'강철 원거리 공격 / 사거리 740' },
  stone_armor1: { name:'돌갑옷1', type:'armor', cost:{ stone:14 }, hp:90, effect:'체력 +90' },
  stone_armor2: { name:'돌갑옷2', type:'armor', cost:{ stone:28, iron:4 }, hp:150, effect:'체력 +150' },
  stone_armor3: { name:'돌갑옷3', type:'armor', cost:{ stone:46, iron:8 }, hp:230, effect:'체력 +230' },
  iron_armor1: { name:'철갑옷1', type:'armor', cost:{ iron:14, stone:10 }, hp:280, effect:'체력 +280' },
  iron_armor2: { name:'철갑옷2', type:'armor', cost:{ iron:28, stone:18 }, hp:390, effect:'체력 +390' },
  iron_armor3: { name:'철갑옷3', type:'armor', cost:{ iron:48, stone:28 }, hp:540, effect:'체력 +540' },
  steel_armor1: { name:'강철갑옷1', type:'armor', cost:{ iron:70, stone:36 }, hp:690, effect:'체력 +690' },
  steel_armor2: { name:'강철갑옷2', type:'armor', cost:{ iron:105, stone:52 }, hp:860, effect:'체력 +860' },
  steel_armor3: { name:'강철갑옷3', type:'armor', cost:{ iron:150, stone:75 }, hp:1080, effect:'체력 +1080' },
  bandage: { name:'붕대', type:'item', cost:{ wood:4 }, effect:'체력 회복 아이템' },
  demolition_hammer: { name:'철거 망치', type:'tool', cost:{ wood:10, iron:35 }, effect:'자신이 만든 구조물 2번 타격 제거' },
  wall: { name:'벽', type:'building', cost:{ wood:6, stone:4 }, effect:'설치 UI로 앞쪽에 벽 설치' },
  door: { name:'문', type:'building', cost:{ wood:8, iron:2 }, effect:'설치 UI로 앞쪽에 문 설치' },
  house: { name:'백성 집', type:'building', cost:{ wood:35, stone:12 }, effect:'주민과 기사 증가' },
  car: { name:'자동차', type:'vehicle', cost:{ wood:18, iron:42 }, effect:'육지 이동속도 증가' },
  boat: { name:'보트', type:'vehicle', cost:{ wood:28, iron:24 }, effect:'물 위 이동 가능' },
  castle_set: { name:'성 세트', type:'building', cost:{ wood:70, stone:70, iron:18 }, effect:'벽과 문으로 작은 성 설치' },
};

const canPay = (bag, cost) => Object.entries(cost).every(([k,v]) => (bag[k]||0) >= v);
const pay = (bag, cost) => Object.entries(cost).forEach(([k,v]) => { bag[k] = (bag[k]||0) - v; });

const makeResources = () => {
  const arr = [];
  const types = [
    ['tree', 150, '#2f8f45'],
    ['stone', 105, '#9ca3af'],
    ['iron', 70, '#b7793f'],
  ];
  let id = 0;
  for (const [type, count, color] of types) {
    for (let i=0;i<count;i++) {
      arr.push({ id:`res_${id++}`, type, color, x:rand(70,WORLD.w-70), y:rand(70,WORLD.h-70), alive:true, respawnAt:0, radius:type==='tree'?13:11 });
    }
  }
  return arr;
};

const makeNpcs = () => {
  const list = [];
  const add = (nation, role, count, x, y) => {
    for (let i=0;i<count;i++) {
      const stats = role === 'king' ? [350,22,13,24] : role === 'guard' ? [230,18,12,20] : role === 'archer' ? [115,16,13,17] : role === 'knight' ? [150,13,13,18] : role === 'bandit' ? [110,11,15,17] : [80,5,11,15];
      list.push({ id:`npc_${nation}_${role}_${i}_${Date.now()}`, nation, role, nickname: roleNickname(nation, role, i), asset: npcAssetFor(nation, role, i), x:x+rand(-100,100), y:y+rand(-100,100), hp:stats[0], maxHp:stats[0], atk:stats[1], speed:stats[2], radius:stats[3], iron: role==='king' ? 200 : role==='guard' ? 35 : role==='knight' ? 18 : role==='archer' ? 22 : 3, lastKingTaxAt: Date.now(), taxPhase: 0, patrolCenter: Math.random() < 0.22, aggroUntil: 0, lastAttackAt: 0, bornAt:Date.now(), lifeMs: role==='king'?99999999: rand(220000,420000), target:null });
    }
  };
  add('demacia','king',1,630,1470);
  add('demacia','guard',3,630,1470);
  add('demacia','knight',5,780,1560);
  add('demacia','archer',3,720,1510);
  add('demacia','villager',7,690,1680);
  add('noxus','king',1,3690,1620);
  add('noxus','guard',4,3690,1620);
  add('noxus','knight',7,3540,1530);
  add('noxus','archer',4,3600,1580);
  add('noxus','villager',8,3420,1440);
  add('bandit','bandit',12,2220,1140);
  return list;
};

const roleKo = (role) => ({
  king:'왕', guard:'호위무사', knight:'기사', archer:'궁수', villager:'주민', bandit:'산적'
}[role] || role);



const NPC_ASSETS = {
  guard: 'assets/adventure/npcs/elite.mp4',
  knight: 'assets/adventure/npcs/knight.mp4',
  archer: 'assets/adventure/npcs/archer.mp4',
  villager1: 'assets/adventure/npcs/villager1.mp4',
  villager2: 'assets/adventure/npcs/villager2.mp4',
  dking: 'assets/adventure/npcs/dking.png',
  nking: 'assets/adventure/npcs/nking.png',
  bandit1: 'assets/adventure/npcs/bandit1.mp4',
  bandit2: 'assets/adventure/npcs/bandit2.mp4',
};

const roleNickname = (nation, role, index = 0) => {
  const nationName = nation === 'demacia' ? '데마시아' : nation === 'noxus' ? '녹서스' : nation === 'bandit' ? '산적단' : nation || '국가';
  const roleName = roleKo(role);
  return `${nationName} ${roleName}${role === 'king' ? '' : index + 1}`;
};

const npcAssetFor = (nation, role, index = 0) => {
  if (role === 'king') return nation === 'noxus' ? NPC_ASSETS.nking : NPC_ASSETS.dking;
  if (role === 'guard') return NPC_ASSETS.guard;
  if (role === 'knight') return NPC_ASSETS.knight;
  if (role === 'archer') return NPC_ASSETS.archer;
  if (role === 'villager') return index % 2 === 0 ? NPC_ASSETS.villager1 : NPC_ASSETS.villager2;
  if (role === 'bandit') return Math.random() < 0.5 ? NPC_ASSETS.bandit1 : NPC_ASSETS.bandit2;
  return '';
};


const makeStructure = ({ id, type, nation = 'demacia', x, y, w, h, ownerId = '', ownerOnline = true, hp = 10 }) => ({
  id, type, nation, x, y, w, h, hp, maxHp: hp, ownerId, ownerOnline,
});

const makeCastlePieces = (prefix, nation, x, y, ownerId = '') => {
  const pieces = [];
  const W = 360, H = 260, thick = 26;
  pieces.push(makeStructure({ id:`${prefix}_top`, type:'wall', nation, x, y:y-H/2, w:W, h:thick, ownerId, hp:10 }));
  pieces.push(makeStructure({ id:`${prefix}_bottom_l`, type:'wall', nation, x:x-W*.28, y:y+H/2, w:W*.44, h:thick, ownerId, hp:10 }));
  pieces.push(makeStructure({ id:`${prefix}_bottom_r`, type:'wall', nation, x:x+W*.28, y:y+H/2, w:W*.44, h:thick, ownerId, hp:10 }));
  pieces.push(makeStructure({ id:`${prefix}_gate`, type:'door', nation, x, y:y+H/2, w:70, h:thick+12, ownerId, hp:10 }));
  pieces.push(makeStructure({ id:`${prefix}_left`, type:'wall', nation, x:x-W/2, y, w:thick, h:H, ownerId, hp:10 }));
  pieces.push(makeStructure({ id:`${prefix}_right`, type:'wall', nation, x:x+W/2, y, w:thick, h:H, ownerId, hp:10 }));
  return pieces;
};

export const mountAdventureMode = ({ root = document, player, user, onExit, onToast }) => {
  const canvas = root.getElementById('adventure-canvas');
  const panel = root.getElementById('adventure-panel');
  const invPanel = root.getElementById('adventure-inventory');
  const nationEl = root.getElementById('adventure-country-state');
  const joy = root.getElementById('adventure-joystick');
  const knob = root.getElementById('adventure-joystick-knob');
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  const db = getFirebaseDb();
  const playerId = player?.id || `guest_${Date.now()}`;
  const onlineRef = db && user ? ref(db, `${PUBLIC_PATHS.adventure || 'adventureWorld'}/players/${playerId}`) : null;
  const playersRef = db ? ref(db, `${PUBLIC_PATHS.adventure || 'adventureWorld'}/players`) : null;

  const activeChar = player?.activeCharacter || CHARACTER_MAP[player?.activeCharacterId] || CHARACTER_LIST[0];
  const activeImg = new Image();
  activeImg.src = activeChar?.image || '';
  const img = new Image();
  img.src = 'assets/adventure/amap.png';
  const mediaCache = new Map();
  const getMedia = (src) => {
    if (!src) return null;
    if (mediaCache.has(src)) return mediaCache.get(src);
    const isVideo = /\.mp4($|\?)/i.test(src);
    const media = isVideo ? document.createElement('video') : new Image();
    if (isVideo) {
      media.src = src;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.autoplay = true;
      media.play?.().catch(() => {});
    } else {
      media.src = src;
    }
    mediaCache.set(src, media);
    return media;
  };

  img.onload = () => {
    if (img.naturalWidth && img.naturalHeight) {
      WORLD.w = img.naturalWidth * 3;
      WORLD.h = img.naturalHeight * 3;
      resize();
    }
  };

  let running = true;
  let raf = 0;
  let last = performance.now();
  const keys = {};
  const joyInput = { x:0, y:0 };
  let joyActive = false;
  let runUntil = 0;
  let runCooldownUntil = 0;

  const me = {
    id: playerId,
    nickname: player?.nickname || '플레이어',
    characterName: activeChar?.name || '캐릭터',
    image: activeChar?.image || '',
    x: 630, y: 1470,
    hp: 260, maxHp: 260,
    baseAtk: 12, atk: 12, baseSpeed: 120, speed: 120,
    radius: 24,
    nation: 'demacia',
    countryName: '데마시아',
    customCountry: false,
    banditKills: 0,
    nextBanditRewardAt: 10,
    bag: { wood: 25, stone: 12, iron: 3, berry: 2, bandage: 1 },
    inventory: [],
    droppedItems: [],
    weapon: { name:'맨손', atk:0 },
    armor: { name:'천옷', hp:0 },
    vehicle: null,
    hammer: false,
    isKing: false,
    lastArrowAt: 0,
    dirX: 1,
    dirY: 0,
  };
  let others = {};
  const resources = makeResources();
  const npcs = makeNpcs();
  const groundItems = [
    { id:'g_berry_1', type:'berry', name:'열매', x:1020, y:1590, count:3, radius:10 },
    { id:'g_meat_1', type:'meat', name:'고기', x:2220, y:1170, count:2, radius:10 },
    { id:'g_bandage_1', type:'bandage', name:'붕대', x:780, y:1410, count:1, radius:10 },
  ];
  const buildings = [
    ...makeCastlePieces('castle_demacia', 'demacia', 630, 1470),
    ...makeCastlePieces('castle_noxus', 'noxus', 3690, 1620),
  ];
  // 물 범위 확대 + 중앙 통로 1개. 원본 맵 전체를 3배 스케일로 사용합니다.
  let pendingBuild = null;
  let placementVisible = false;
  const arrows = [];

  const waterRects = [
    { x: 1160, y: 0, w: 230, h: 900 },
    { x: 1120, y: 960, w: 235, h: 1330 },
    { x: 1840, y: 0, w: 180, h: 690 },
    { x: 1670, y: 620, w: 1040, h: 170 },
    { x: 1380, y: 1070, w: 1110, h: 145 },
  ];
  const passageRects = [
    { x: 1060, y: 870, w: 390, h: 105 }, // 데마시아 ↔ 녹서스 이동 통로
  ];
  const boats = [{x:1410,y:1222,r:46},{x:2700,y:1920,r:46}];

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect() || {width:innerWidth,height:innerHeight};
    canvas.width = Math.max(320, Math.floor(rect.width * devicePixelRatio));
    canvas.height = Math.max(320, Math.floor(rect.height * devicePixelRatio));
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  };
  resize();
  addEventListener('resize', resize, { passive:true });

  const inRect = (x, y, r) => x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h;
  const isPassage = (x,y) => passageRects.some(r => inRect(x,y,r));
  const isWater = (x,y) => !isPassage(x,y) && waterRects.some(r => inRect(x,y,r));
  const nearBoat = () => boats.some(b => Math.hypot(me.x-b.x, me.y-b.y) < 70);
  const canMoveTo = (x,y) => (!isWater(x,y) || nearBoat() || me.vehicle?.type === 'boat') && !buildings.some(b => (b.type==='wall' || b.type==='door') && x>b.x-b.w/2-me.radius && x<b.x+b.w/2+me.radius && y>b.y-b.h/2-me.radius && y<b.y+b.h/2+me.radius);

  const publish = () => {
    if (!onlineRef) return;
    set(onlineRef, {
      id:playerId,
      nickname:me.nickname,
      characterName:me.characterName,
      image:me.image,
      x:Math.round(me.x),
      y:Math.round(me.y),
      hp:Math.round(me.hp),
      maxHp:me.maxHp,
      nation:me.nation,
      countryName:me.countryName,
      radius:me.radius,
      at:Date.now()
    }).catch(()=>{});
  };
  let publishTimer = setInterval(publish, 130);
  let unsub = null;
  if (playersRef) {
    const handler = onValue(playersRef, (snap) => {
      others = snap.exists() ? snap.val() : {};
      delete others[playerId];
    });
    unsub = () => off(playersRef, 'value', handler);
  }

  const toast = (msg) => onToast ? onToast(msg, 'info') : null;
  const addItem = (type, name, count=1) => {
    const old = me.inventory.find(i => i.type===type && i.name===name);
    if (old) old.count += count;
    else me.inventory.push({ type, name, count });
  };
  const removeItem = (type, count=1) => {
    const it = me.inventory.find(i => i.type===type);
    if (!it || it.count < count) return false;
    it.count -= count;
    if (it.count <= 0) me.inventory = me.inventory.filter(x => x !== it);
    return true;
  };
  const dropGround = (type, name, count=1) => {
    groundItems.push({ id:`drop_${Date.now()}_${Math.random()}`, type, name, count, x:me.x+rand(-20,20), y:me.y+rand(-20,20), radius:10 });
  };
  const getIronRankings = () => {
    const rows = [
      { name: `${me.countryName || '데마시아'} ${me.nickname}`, nation: me.nation, role: '플레이어', iron: me.bag.iron || 0, player: true },
      ...npcs.map((n) => ({ name: n.nickname || roleNickname(n.nation, n.role, 0), nation: n.nation, role: roleKo(n.role), iron: n.iron || 0, npc: n })),
    ].sort((a,b) => (b.iron || 0) - (a.iron || 0));
    return rows.slice(0, 8);
  };

  const promoteKingForNation = (nation) => {
    const candidates = npcs
      .filter((n) => n.nation === nation && ['villager','knight','guard','archer','king'].includes(n.role))
      .sort((a,b) => (b.iron || 0) - (a.iron || 0));
    if (!candidates.length) return;
    const nextKing = candidates[0];
    npcs.forEach((n) => {
      if (n.nation === nation && n !== nextKing && n.role === 'king') {
        n.role = n.prevRole && n.prevRole !== 'king' ? n.prevRole : 'guard';
        n.nickname = roleNickname(n.nation, n.role, 0);
        n.asset = npcAssetFor(n.nation, n.role, 0);
      }
    });
    nextKing.prevRole = nextKing.prevRole && nextKing.prevRole !== 'king' ? nextKing.prevRole : nextKing.role;
    nextKing.role = 'king';
    nextKing.nickname = roleNickname(nation, 'king', 0);
    nextKing.asset = npcAssetFor(nation, 'king', 0);
    nextKing.iron = Math.max(200, nextKing.iron || 0);
  };

  const updateKingship = () => {
    me.isKing = false;
    ['demacia', 'noxus'].forEach(promoteKingForNation);
  };

  const showAdventurePopup = (html) => {
    let popup = root.getElementById('adventure-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'adventure-popup';
      popup.className = 'adventure-popup';
      root.querySelector('.adventure-shell')?.appendChild(popup);
    }
    popup.innerHTML = html;
    popup.classList.add('show');
  };

  const closeAdventurePopup = () => {
    const popup = root.getElementById('adventure-popup');
    if (popup) popup.classList.remove('show');
  };

  const openItemDetail = (type) => {
    const labels = { wood:'나무', stone:'돌', iron:'철', berry:'열매', meat:'고기', bandage:'붕대', weapon:'무기', armor:'갑옷' };
    showAdventurePopup(`
      <div class="adventure-popup-card">
        <h3>${labels[type] || type}</h3>
        <p>이 아이템으로 가능한 행동을 선택하세요.</p>
        <div class="grid-2">
          <button class="btn secondary" data-popup-drop="${type}">땅에 놓기</button>
          <button class="btn primary" data-popup-craft="true">제작하기</button>
        </div>
        <button class="btn secondary" data-popup-close="true">닫기</button>
      </div>
    `);
  };

  const openCraftMenu = () => {
    const buttons = Object.entries(RECIPES).map(([id, r]) => {
      const cost = Object.entries(r.cost).map(([k,v]) => `${k}:${v}`).join(' ');
      return `<button class="btn secondary craft-recipe-btn" data-adventure-craft="${id}">
        <b>${r.name}</b><small>${cost}<br>${r.effect}</small>
      </button>`;
    }).join('');
    showAdventurePopup(`
      <div class="adventure-popup-card craft-popup">
        <h3>제작하기</h3>
        <p>무기/갑옷/도구/건축/차량을 제작합니다.</p>
        <div class="craft-recipe-grid">${buttons}</div>
        <button class="btn secondary" data-popup-close="true">닫기</button>
      </div>
    `);
  };

  const showPlacementUi = (id) => {
    pendingBuild = id;
    placementVisible = true;
    const r = RECIPES[id];
    showAdventurePopup(`
      <div class="adventure-popup-card">
        <h3>${r.name} 설치</h3>
        <p>캐릭터가 바라보는 앞쪽에 설치됩니다. 위치를 보고 확정하세요.</p>
        <div class="grid-2">
          <button class="btn primary" data-placement-confirm="true">설치 확정</button>
          <button class="btn secondary" data-placement-cancel="true">취소</button>
        </div>
      </div>
    `);
  };

  const updateNation = () => {
    updateKingship();
    if (!nationEl) return;
    const demacia = npcs.filter(n => n.nation==='demacia').length + 1;
    const noxus = npcs.filter(n => n.nation==='noxus').length;
    const bandits = npcs.filter(n => n.nation==='bandit').length;
    const housesD = buildings.filter(b => b.type==='house' && b.nation==='demacia').length;
    const housesN = buildings.filter(b => b.type==='house' && b.nation==='noxus').length;
    nationEl.textContent = `내 국가 ${me.countryName || '데마시아'} | 데마시아 ${demacia}명 · 집 ${housesD} | 녹서스 ${noxus}명 · 집 ${housesN} | 산적 ${bandits}`;
  };

  const updatePanel = () => {
    if (panel) panel.innerHTML = `
      <b>${me.nickname}</b> · ${me.characterName}<br>
      HP ${Math.round(me.hp)}/${me.maxHp} · 공격 ${me.atk}<br>
      <span class="iron-highlight">철 ${me.bag.iron||0}</span> · 나무 ${me.bag.wood||0} · 돌 ${me.bag.stone||0}<br>
      열매 ${me.bag.berry||0} · 고기 ${me.bag.meat||0} · 붕대 ${me.bag.bandage||0}<br>
      무기 ${me.weapon.name} · 갑옷 ${me.armor.name} · 탑승 ${me.vehicle?.name || '없음'}<br>
      ${me.hammer ? '철거 망치 보유<br>' : ''}
      <small>조이패드 이동 · 달리기 3초 / 쿨 5초</small><br>
      <button class="adventure-small-btn" data-adventure-action="create-country">국가 만들기</button>
      <button class="adventure-small-btn" data-adventure-action="disband-country">국가 해체</button>
    `;

    if (invPanel) {
      const items = [
        ['wood','나무',me.bag.wood||0],
        ['stone','돌',me.bag.stone||0],
        ['iron','철',me.bag.iron||0],
        ['berry','열매',me.bag.berry||0],
        ['meat','고기',me.bag.meat||0],
        ['bandage','붕대',me.bag.bandage||0],
        ['weapon',me.weapon.name,me.weapon.name==='맨손'?0:1],
        ['armor',me.armor.name,me.armor.name==='천옷'?0:1],
      ].filter(([, , count]) => count > 0);
      const itemHtml = items.length ? items.map(([type, name, count]) => `
        <div class="adventure-inv-row">
          <span>${name} x${count}</span>
          <button data-inv-detail="${type}">자세히</button>
        </div>
      `).join('') : '<div class="adventure-inv-empty">아이템 없음</div>';

      const rankHtml = getIronRankings().map((r, i) => `
        <div class="iron-rank-row ${r.player ? 'me' : ''}">
          <span>${i + 1}. ${r.name}</span><b>${r.iron}</b>
        </div>
      `).join('');

      invPanel.innerHTML = `
        <b>인벤토리</b>
        <div class="adventure-inv-list">${itemHtml}</div>
        <button class="btn primary adventure-craft-open" data-popup-craft="true">제작하기</button>
        <button class="btn secondary adventure-craft-open" data-adventure-action="demolish">철거</button>
        <div class="iron-rank-box">
          <b>철 보유 순위</b>
          ${rankHtml}
        </div>
      `;
    }
    updateNation();
    const runBtn = root.querySelector('[data-adventure-action="run"]');
    if (runBtn) {
      const now = performance.now();
      const cd = Math.max(0, Math.ceil((runCooldownUntil - now)/1000));
      const active = now < runUntil;
      runBtn.innerHTML = active ? '달리는 중' : cd ? `달리기 ${cd}초` : '달리기';
      runBtn.classList.toggle('ready', !cd && !active);
    }
  };

  const gather = (kind) => {
    const usable = resources.find(r => r.alive && Math.hypot(me.x-r.x, me.y-r.y) < 70 && (kind==='chop' ? r.type==='tree' : r.type!=='tree'));
    if (!usable) return toast(kind==='chop' ? '가까운 나무가 없습니다.' : '가까운 암석/철광석이 없습니다.');
    usable.alive = false;
    usable.respawnAt = Date.now() + RESPAWN_MS;
    if (usable.type==='tree') me.bag.wood = (me.bag.wood||0) + 4;
    if (usable.type==='stone') me.bag.stone = (me.bag.stone||0) + 3;
    if (usable.type==='iron') me.bag.iron = (me.bag.iron||0) + 2;
    toast(`${usable.type==='tree'?'나무':usable.type==='stone'?'돌':'철'} 획득`);
    updatePanel();
  };
  const frontPosition = (distance = 78) => ({
    x: clamp(me.x + (me.dirX || 1) * distance, 30, WORLD.w - 30),
    y: clamp(me.y + (me.dirY || 0) * distance, 30, WORLD.h - 30),
  });

  const isPointInsideStructure = (x, y, b) => (
    x > b.x - b.w/2 - 8 && x < b.x + b.w/2 + 8
    && y > b.y - b.h/2 - 8 && y < b.y + b.h/2 + 8
  );

  const removeResourcesNearStructure = (b) => {
    resources.forEach((r) => {
      if (r.alive && (b.type === 'wall' || b.type === 'door') && isPointInsideStructure(r.x, r.y, b)) {
        r.alive = false;
        r.respawnAt = Date.now() + RESPAWN_MS;
      }
    });
  };

  const placeStructure = (id) => {
    const r = RECIPES[id];
    if (!r) return false;
    if (!canPay(me.bag, r.cost)) { toast('재료가 부족합니다.'); return false; }
    pay(me.bag, r.cost);

    if (id === 'wall' || id === 'door') {
      const p = frontPosition(id==='wall' ? 96 : 86);
      const b = makeStructure({
        id:`b_${Date.now()}`,
        type:id==='wall'?'wall':'door',
        nation:'demacia',
        x:p.x,
        y:p.y,
        w:id==='wall'?96:76,
        h:id==='wall'?28:24,
        ownerId:playerId,
        ownerOnline:true,
        hp:10,
      });
      buildings.push(b);
      removeResourcesNearStructure(b);
    } else if (id === 'castle_set') {
      const p = frontPosition(190);
      const pieces = makeCastlePieces(`castle_player_${Date.now()}`, 'demacia', p.x, p.y, playerId).map((b) => ({ ...b, ownerOnline:true }));
      buildings.push(...pieces);
      pieces.forEach(removeResourcesNearStructure);
    } else if (id === 'house') {
      const p = frontPosition(108);
      const b = makeStructure({ id:`house_${Date.now()}`, type:'house', nation:'demacia', x:p.x, y:p.y, w:90, h:70, ownerId:playerId, ownerOnline:true, hp:14 });
      buildings.push(b);
      npcs.push({ id:`npc_demacia_villager_${Date.now()}`, nation:'demacia', role:'villager', x:p.x+40, y:p.y, hp:80, maxHp:80, atk:5, speed:11, radius:15, iron:2, bornAt:Date.now(), lifeMs:320000 });
      npcs.push({ id:`npc_demacia_knight_${Date.now()}`, nation:'demacia', role:'knight', x:p.x-40, y:p.y, hp:150, maxHp:150, atk:13, speed:13, radius:18, iron:18, patrolCenter: Math.random()<0.2, bornAt:Date.now(), lifeMs:360000 });
    }
    pendingBuild = null;
    placementVisible = false;
    closeAdventurePopup();
    toast(`${r.name} 설치 완료`);
    updatePanel();
    return true;
  };

  const craftById = (id) => {
    const r = RECIPES[id];
    if (!r) return false;
    if (id === 'wall' || id === 'door') {
      showPlacementUi(id);
      return true;
    }
    if (!canPay(me.bag, r.cost)) { toast('재료가 부족합니다.'); return false; }
    pay(me.bag, r.cost);
    if (r.type==='weapon') {
      me.weapon = { name:r.name, atk:r.atk||0, kind:r.weaponKind || 'melee', range:r.range || 0, projectileSpeed:r.projectileSpeed || 0 };
      me.atk = me.baseAtk + me.weapon.atk;
    } else if (r.type==='armor') {
      me.armor = { name:r.name, hp:r.hp||0 };
      me.maxHp = 260 + me.armor.hp;
      me.hp = me.maxHp;
    } else if (r.type==='tool' && id === 'demolition_hammer') {
      me.hammer = true;
    } else if (r.type==='vehicle') {
      me.vehicle = { name:r.name, type:id };
    } else if (id==='bandage') {
      me.bag.bandage = (me.bag.bandage||0)+1;
    } else if (id==='castle_set' || id==='house') {
      // 건축물은 재료를 이미 차감했으므로 잠시 되돌리고 설치 함수에서 처리합니다.
      Object.entries(r.cost).forEach(([k,v]) => { me.bag[k] = (me.bag[k]||0) + v; });
      placeStructure(id);
      return true;
    }
    toast(`${r.name} 제작 완료`);
    closeAdventurePopup();
    updatePanel();
    return true;
  };

  const craft = () => openCraftMenu();

  const canDamageBuilding = (b) => !b.ownerId || b.ownerId === playerId || b.ownerOnline;
  const damageBuilding = (b, amount = 1) => {
    if (!canDamageBuilding(b)) return false;
    b.hp = (b.hp ?? 10) - amount;
    toast(`${b.type === 'door' ? '문' : b.type === 'wall' ? '벽' : '구조물'} 내구도 ${Math.max(0, b.hp)}/${b.maxHp || 10}`);
    if (b.hp <= 0) {
      const idx = buildings.indexOf(b);
      if (idx >= 0) buildings.splice(idx, 1);
      toast('구조물이 부서졌습니다.');
    }
    return true;
  };

  const shootArrow = (target) => {
    const now = performance.now();
    if (now - me.lastArrowAt < 650) return toast('활 재장전 중입니다.');
    const range = me.weapon.range || 420;
    const d = dist(me, target);
    if (d > range) return toast(`사거리 밖입니다. 사거리 ${range}`);
    const n = norm(target.x - me.x, target.y - me.y);
    arrows.push({
      id:`arrow_${Date.now()}`,
      owner:'player',
      x:me.x,
      y:me.y,
      vx:n.x * (me.weapon.projectileSpeed || 520),
      vy:n.y * (me.weapon.projectileSpeed || 520),
      life:range / (me.weapon.projectileSpeed || 520),
      damage:Math.max(1, Math.round(me.atk * 0.9)),
      nation:'demacia',
    });
    me.lastArrowAt = now;
  };

  const aggroNoxusNearby = (target) => {
    if (!target || target.nation !== 'noxus' || !['knight','guard','archer'].includes(target.role)) return;
    npcs.filter((n) => n.nation === 'noxus' && ['knight','guard','archer'].includes(n.role) && dist(n, target) < 520)
      .forEach((n) => { n.aggroUntil = Date.now() + 18000; });
    toast('근처 녹서스 병사들이 달려듭니다.');
  };

  const attack = () => {
    const target = npcs.find(n => n.nation !== 'demacia' && dist(me,n)<(me.weapon.kind === 'bow' ? (me.weapon.range || 420) : me.radius+n.radius+42));
    if (target) {
      aggroNoxusNearby(target);
      if (me.weapon.kind === 'bow') {
        shootArrow(target);
        updatePanel();
        return;
      }
      target.hp -= me.atk;
      if (target.hp <= 0) {
        rewardIronToKiller(me, target);
        if (target.role==='knight' || target.role==='guard' || target.role==='archer') me.bag.iron = (me.bag.iron||0)+3;
        if (target.role==='bandit') me.bag.meat = (me.bag.meat||0)+1;
        target.dead = true;
        toast(`${roleKo(target.role)} 처치`);
      }
      updatePanel();
      return;
    }

    const bx = me.x + (me.dirX || 1) * 45;
    const by = me.y + (me.dirY || 0) * 45;
    const building = buildings.find((b) =>
      b.nation !== 'demacia'
      && (b.type === 'wall' || b.type === 'door' || b.type === 'house')
      && bx > b.x - b.w/2 - 34 && bx < b.x + b.w/2 + 34
      && by > b.y - b.h/2 - 34 && by < b.y + b.h/2 + 34
    );
    if (building && damageBuilding(building, 1)) {
      updatePanel();
      return;
    }
    toast('공격할 대상이 없습니다.');
  };
  const buildQuick = (type) => {
    const id = type==='build-wall'?'wall':type==='build-door'?'door':'house';
    if (id === 'wall' || id === 'door') showPlacementUi(id);
    else craftById(id);
  };
  const demolish = () => {
    if (!me.hammer) return toast('철거 망치가 필요합니다.');
    const bx = me.x + (me.dirX || 1) * 58;
    const by = me.y + (me.dirY || 0) * 58;
    const b = buildings.find((s) => s.ownerId === playerId && (s.type === 'wall' || s.type === 'door' || s.type === 'house') && isPointInsideStructure(bx, by, s));
    if (!b) return toast('앞쪽에 내 구조물이 없습니다.');
    b.hammerHits = (b.hammerHits || 0) + 1;
    toast(`철거 진행 ${b.hammerHits}/2`);
    if (b.hammerHits >= 2) {
      buildings.splice(buildings.indexOf(b), 1);
      toast('구조물을 철거했습니다.');
    }
  };
  const run = () => {
    const now = performance.now();
    if (now < runCooldownUntil) return toast(`달리기 쿨타임 ${Math.ceil((runCooldownUntil-now)/1000)}초`);
    runUntil = now + 3000;
    runCooldownUntil = now + 5000;
    toast('3초 동안 이동속도 증가');
    updatePanel();
  };
  const pickupGround = () => {
    for (let i=groundItems.length-1;i>=0;i--) {
      const g = groundItems[i];
      if (Math.hypot(me.x-g.x,me.y-g.y) < 50) {
        if (['wood','stone','iron','berry','meat','bandage'].includes(g.type)) me.bag[g.type]=(me.bag[g.type]||0)+g.count;
        else addItem(g.type,g.name,g.count);
        toast(`${g.name} 획득`);
        groundItems.splice(i,1);
        updatePanel();
        return;
      }
    }
    toast('주울 아이템이 없습니다.');
  };
  const invAction = (a) => {
    if (a==='drop-wood' && (me.bag.wood||0)>0) { me.bag.wood--; dropGround('wood','나무'); }
    else if (a==='drop-stone' && (me.bag.stone||0)>0) { me.bag.stone--; dropGround('stone','돌'); }
    else if (a==='drop-iron' && (me.bag.iron||0)>0) { me.bag.iron--; dropGround('iron','철'); }
    else if (a==='drop-berry' && (me.bag.berry||0)>0) { me.bag.berry--; dropGround('berry','열매'); }
    else if (a==='drop-meat' && (me.bag.meat||0)>0) { me.bag.meat--; dropGround('meat','고기'); }
    else if (a==='drop-bandage' && (me.bag.bandage||0)>0) { me.bag.bandage--; dropGround('bandage','붕대'); }
    else if ((a==='drop-weapon' || a==='drop-weapon') && me.weapon.name!=='맨손') { dropGround('weapon',me.weapon.name); me.weapon={name:'맨손',atk:0}; me.atk=me.baseAtk; }
    else if (a==='drop-armor' && me.armor.name!=='천옷') { dropGround('armor',me.armor.name); me.armor={name:'천옷',hp:0}; me.maxHp=260; me.hp=Math.min(me.hp,me.maxHp); }
    else if (a==='eat') {
      if ((me.bag.bandage||0)>0) { me.bag.bandage--; me.hp=clamp(me.hp+80,0,me.maxHp); }
      else if ((me.bag.meat||0)>0) { me.bag.meat--; me.hp=clamp(me.hp+55,0,me.maxHp); }
      else if ((me.bag.berry||0)>0) { me.bag.berry--; me.hp=clamp(me.hp+25,0,me.maxHp); }
      else toast('사용할 음식/붕대가 없습니다.');
    } else toast('버릴 수 있는 아이템이 없습니다.');
    updatePanel();
  };

  const createCountry = () => {
    if (me.customCountry) return toast('이미 국가가 있습니다.');
    if ((me.bag.iron || 0) < 100) return toast('국가 생성에는 철 100개가 필요합니다.');
    const name = prompt('새 국가 이름을 입력하세요.');
    if (!name?.trim()) return;
    me.bag.iron -= 100;
    me.customCountry = true;
    me.countryName = name.trim().slice(0, 12);
    me.nation = `player_${playerId}`;
    toast(`${me.countryName} 국가를 만들었습니다.`);
    updatePanel();
  };

  const disbandCountry = () => {
    if (!me.customCountry) return toast('해체할 국가가 없습니다.');
    if (!confirm(`${me.countryName} 국가를 해체할까요?`)) return;
    me.customCountry = false;
    me.countryName = '데마시아';
    me.nation = 'demacia';
    toast('국가를 해체하고 데마시아로 돌아왔습니다.');
    updatePanel();
  };

  const assignBanditRewardQuest = () => {
    const pool = npcs.filter((n) => n.nation === me.nation || n.nation === 'demacia').filter((n) => n.role === 'villager');
    const giver = pool[Math.floor(Math.random() * pool.length)];
    if (!giver) return;
    giver.questReward = true;
    giver.questOwner = playerId;
    giver.nickname = `${giver.nickname || '주민'} !`;
    toast('주민 한 명이 보상 의뢰를 가지고 있습니다. 느낌표 주민에게 다가가세요.');
  };

  const action = (a) => {
    if (a==='chop' || a==='mine') gather(a);
    if (a==='attack') attack();
    if (a==='craft') craft();
    if (a==='demolish') demolish();
    if (a==='create-country') createCountry();
    if (a==='disband-country') disbandCountry();
    if (a==='run') run();
    if (a==='pickup') pickupGround();
    if (a==='build-wall' || a==='build-door' || a==='build-house') buildQuick(a);
    if (a==='craft-car') craftById('car');
    if (a==='craft-boat') craftById('boat');
    if (a==='build-castle') craftById('castle_set');
  };
  root.querySelectorAll('[data-adventure-action]').forEach(btn => btn.addEventListener('click', () => action(btn.dataset.adventureAction)));
  root.addEventListener('click', (e) => {
    const detail = e.target.closest('[data-inv-detail]');
    if (detail) {
      openItemDetail(detail.dataset.invDetail);
      return;
    }
    const popupClose = e.target.closest('[data-popup-close]');
    if (popupClose) {
      closeAdventurePopup();
      return;
    }
    const popupDrop = e.target.closest('[data-popup-drop]');
    if (popupDrop) {
      invAction(`drop-${popupDrop.dataset.popupDrop}`);
      closeAdventurePopup();
      return;
    }
    const popupCraft = e.target.closest('[data-popup-craft]');
    if (popupCraft) {
      openCraftMenu();
      return;
    }
    const recipeBtn = e.target.closest('[data-adventure-craft]');
    if (recipeBtn) {
      craftById(recipeBtn.dataset.adventureCraft);
      return;
    }
    const confirm = e.target.closest('[data-placement-confirm]');
    if (confirm && pendingBuild) {
      placeStructure(pendingBuild);
      return;
    }
    const cancel = e.target.closest('[data-placement-cancel]');
    if (cancel) {
      pendingBuild = null;
      placementVisible = false;
      closeAdventurePopup();
      return;
    }
  });

  let joyPointerId = null;
  let joyCenterX = 0;
  let joyCenterY = 0;

  const resetJoy = () => {
    joyActive = false;
    joyPointerId = null;
    joyInput.x = 0;
    joyInput.y = 0;
    if (knob) knob.style.transform = 'translate(0,0)';
    if (joy) {
      joy.style.position = '';
      joy.style.left = '';
      joy.style.top = '';
      joy.style.bottom = '';
      joy.style.right = '';
    }
  };

  const setJoyFromPoint = (clientX, clientY) => {
    if (!joy || !knob) return;
    const rect = joy.getBoundingClientRect();
    const max = Math.max(42, rect.width * 0.42);
    const dx = clientX - joyCenterX;
    const dy = clientY - joyCenterY;
    const rawLen = Math.hypot(dx, dy);
    const deadzone = 5;
    if (rawLen <= deadzone) {
      joyInput.x = 0;
      joyInput.y = 0;
      knob.style.transform = 'translate(0,0)';
      return;
    }
    const n = norm(dx, dy);
    const len = Math.min(max, rawLen);
    const power = Math.min(1, Math.max(0.58, len / max));
    joyInput.x = n.x * power;
    joyInput.y = n.y * power;
    knob.style.transform = `translate(${n.x * len}px, ${n.y * len}px)`;
  };

  const startJoy = (e) => {
    if (!joy) return;
    e.preventDefault();
    e.stopPropagation();
    joyActive = true;
    joyPointerId = e.pointerId ?? null;
    joyCenterX = e.clientX;
    joyCenterY = e.clientY;
    const size = joy.getBoundingClientRect().width || 108;
    joy.style.position = 'fixed';
    joy.style.left = `${Math.max(6, e.clientX - size / 2)}px`;
    joy.style.top = `${Math.max(6, e.clientY - size / 2)}px`;
    joy.style.bottom = 'auto';
    joy.style.right = 'auto';
    try { joy.setPointerCapture?.(e.pointerId); } catch (error) {}
    setJoyFromPoint(e.clientX, e.clientY);
  };

  const moveJoy = (e) => {
    if (!joyActive) return;
    if (joyPointerId !== null && e.pointerId !== joyPointerId) return;
    e.preventDefault();
    setJoyFromPoint(e.clientX, e.clientY);
  };

  const endJoy = (e) => {
    if (!joyActive) return;
    if (e && joyPointerId !== null && e.pointerId !== joyPointerId) return;
    resetJoy();
  };

  joy?.addEventListener('pointerdown', startJoy, { passive:false });
  window.addEventListener('pointermove', moveJoy, { passive:false });
  window.addEventListener('pointerup', endJoy, { passive:true });
  window.addEventListener('pointercancel', endJoy, { passive:true });
  window.addEventListener('blur', resetJoy, { passive:true });

  const keyDown = e => {
    keys[e.code]=true;
    if (e.code==='Escape') onExit?.();
    if (e.code==='KeyE') gather('chop');
    if (e.code==='KeyR') gather('mine');
    if (e.code==='Space') attack();
    if (e.code==='KeyC') craft();
    if (e.code==='KeyF') pickupGround();
    if (e.code==='ShiftLeft' || e.code==='ShiftRight') run();
  };
  const keyUp = e => { keys[e.code]=false; };
  addEventListener('keydown', keyDown); addEventListener('keyup', keyUp);

  const rewardIronToKiller = (killer, victim) => {
    if (!victim) return;
    if (killer === me) {
      if (victim.role !== 'villager' || victim.nation === 'bandit') me.bag.iron = (me.bag.iron || 0) + 5;
      if (victim.nation === 'bandit') {
        me.banditKills = (me.banditKills || 0) + 1;
        if (me.banditKills >= (me.nextBanditRewardAt || 10)) {
          me.nextBanditRewardAt = (me.nextBanditRewardAt || 10) + 10;
          assignBanditRewardQuest();
        }
      }
    } else if (killer && victim.role !== 'villager') {
      killer.iron = (killer.iron || 0) + 5;
    }
  };

  const kingEconomyStep = (n) => {
    if (n.role !== 'king') return;
    const now = Date.now();
    if (!n.lastKingTaxAt) n.lastKingTaxAt = now;
    if (now - n.lastKingTaxAt >= 60 * 60 * 1000) {
      if ((n.taxPhase || 0) % 2 === 0) n.iron = (n.iron || 0) + 50;
      else n.iron = Math.max(0, (n.iron || 0) - (Math.random() < 0.5 ? 45 : 50));
      n.taxPhase = (n.taxPhase || 0) + 1;
      n.lastKingTaxAt = now;
    }
  };

  const updateArrows = (dt) => {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
      const target = npcs.find((n) => !n.dead && n.nation !== a.nation && dist(a, n) < (n.radius || 16) + 7);
      if (target) {
        target.hp -= a.damage;
        if (target.hp <= 0) {
          rewardIronToKiller(a.owner === 'player' ? me : null, target);
          target.dead = true;
        }
        arrows.splice(i, 1);
      } else if (a.life <= 0) {
        arrows.splice(i, 1);
      }
    }
  };

  const npcStep = (dt) => {
    resources.forEach(r => { if (!r.alive && Date.now() >= r.respawnAt && !buildings.some((b) => (b.type==='wall'||b.type==='door') && isPointInsideStructure(r.x, r.y, b))) r.alive = true; });
    updateArrows(dt);

    for (let i=npcs.length-1;i>=0;i--) {
      const n = npcs[i];
      kingEconomyStep(n);
      if (n.dead || Date.now()-n.bornAt > n.lifeMs) { npcs.splice(i,1); continue; }

      let tx = n.x, ty = n.y;
      if (n.nation === 'bandit') {
        if (dist(n,me)<520) { tx=me.x; ty=me.y; }
        else {
          if (!n.roamX || Math.random() < 0.01) { n.roamX = rand(60, WORLD.w - 60); n.roamY = rand(60, WORLD.h - 60); }
          tx = n.roamX; ty = n.roamY;
        }
      } else if (n.role==='guard') {
        const king = npcs.find(k=>k.nation===n.nation && k.role==='king');
        if (king) { tx=king.x+rand(-90,90); ty=king.y+rand(-90,90); }
      } else if (n.role === 'knight' || n.role === 'archer') {
        const castle = buildings.find((b) => b.nation === n.nation && (b.id || '').includes('castle'));
        const patrolBaseX = n.patrolCenter ? WORLD.w/2 : (castle?.x || n.x);
        const patrolBaseY = n.patrolCenter ? WORLD.h/2 : (castle?.y || n.y);
        if (n.aggroUntil && Date.now() < n.aggroUntil) { tx = me.x; ty = me.y; }
        else { tx = patrolBaseX + rand(-260,260); ty = patrolBaseY + rand(-220,220); }
      } else if (n.nation==='noxus') {
        if (dist(n,me)<430) { tx=me.x; ty=me.y; }
        else { tx=n.x+rand(-80,80); ty=n.y+rand(-80,80); }
      } else {
        tx=n.x+rand(-40,40); ty=n.y+rand(-40,40);
      }

      const dx=tx-n.x, dy=ty-n.y, l=Math.hypot(dx,dy)||1;
      n.x=clamp(n.x+dx/l*n.speed*dt,20,WORLD.w-20);
      n.y=clamp(n.y+dy/l*n.speed*dt,20,WORLD.h-20);

      if ((n.nation==='noxus'||n.nation==='bandit') && dist(n,me)<me.radius+n.radius+6) {
        me.hp = Math.max(0, me.hp - n.atk*dt);
      }
      if (n.role === 'archer' && n.nation !== 'demacia' && dist(n, me) < 460 && Date.now() - (n.lastAttackAt || 0) > 1600) {
        me.hp = Math.max(0, me.hp - n.atk);
        n.lastAttackAt = Date.now();
      }

      // 간단한 유닛 간 전투: 주민 제외 병사끼리 만나면 공격하고, 처치 시 철 5 획득.
      const enemy = npcs.find((m) => m !== n && !m.dead && (n.nation === 'bandit' ? m.nation !== 'bandit' : m.nation !== n.nation) && m.role !== 'villager' && n.role !== 'villager' && dist(n,m) < (n.role === 'archer' ? 360 : n.radius + m.radius + 20));
      if (enemy && Date.now() - (n.lastAttackAt || 0) > (n.role === 'archer' ? 1800 : 1100)) {
        enemy.hp -= n.atk;
        n.lastAttackAt = Date.now();
        if (enemy.hp <= 0) {
          rewardIronToKiller(n, enemy);
          enemy.dead = true;
        }
      }

      if (n.nation==='noxus' || n.nation==='bandit') {
        const closeStructure = buildings.find((b) => b.nation === 'demacia' && (b.type==='wall' || b.type==='door') && canDamageBuilding(b) && Math.abs(n.x-b.x) < b.w/2+n.radius+12 && Math.abs(n.y-b.y) < b.h/2+n.radius+12);
        if (closeStructure && Math.random() < 0.02) damageBuilding(closeStructure, 1);
      }
    }
    if (Math.random()<0.0008) buildings.push({ id:`nox_house_${Date.now()}`, type:'house', nation:'noxus', x:rand(3150,3900), y:rand(1320,1860), w:90, h:70, hp:14, maxHp:14 });
  };

  const draw = () => {
    const vw = canvas.width / devicePixelRatio;
    const vh = canvas.height / devicePixelRatio;
    const camX = clamp(me.x - vw/2, 0, Math.max(1, WORLD.w-vw));
    const camY = clamp(me.y - vh/2, 0, Math.max(1, WORLD.h-vh));
    ctx.clearRect(0,0,vw,vh);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -camX, -camY, WORLD.w, WORLD.h);
    else { ctx.fillStyle='#357a3b'; ctx.fillRect(0,0,vw,vh); }

    const sx = x => x-camX, sy = y => y-camY;
    waterRects.forEach(w => { ctx.fillStyle='rgba(0,190,200,.25)'; ctx.fillRect(sx(w.x),sy(w.y),w.w,w.h); });
    passageRects.forEach(p => { ctx.fillStyle='rgba(150,120,75,.34)'; ctx.fillRect(sx(p.x),sy(p.y),p.w,p.h); });
    boats.forEach(b => { ctx.fillStyle='#8b5a2b'; ctx.beginPath(); ctx.ellipse(sx(b.x),sy(b.y),48,24,0,0,Math.PI*2); ctx.fill(); });
    groundItems.filter(g=>sx(g.x)>-40&&sx(g.x)<vw+40&&sy(g.y)>-40&&sy(g.y)<vh+40).forEach(g=>{
      ctx.fillStyle=g.type==='iron'?'#b7793f':g.type==='stone'?'#9ca3af':g.type==='wood'?'#8b5a2b':g.type==='berry'?'#ef4444':'#f8fafc';
      ctx.beginPath(); ctx.arc(sx(g.x),sy(g.y),g.radius,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='700 10px sans-serif'; ctx.textAlign='center'; ctx.fillText(g.name, sx(g.x), sy(g.y)-14);
    });
    arrows.forEach((a) => {
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      ctx.lineTo(sx(a.x - a.vx * 0.045), sy(a.y - a.vy * 0.045));
      ctx.stroke();
    });

    if (placementVisible && pendingBuild) {
      const id = pendingBuild;
      const p = frontPosition(id === 'wall' ? 96 : 86);
      const w = id === 'wall' ? 96 : 76;
      const h = id === 'wall' ? 28 : 24;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = id === 'wall' ? '#a3a3a3' : '#854d0e';
      ctx.fillRect(sx(p.x - w/2), sy(p.y - h/2), w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(sx(p.x - w/2), sy(p.y - h/2), w, h);
      ctx.restore();
    }

    resources.filter(r=>r.alive && sx(r.x)>-40&&sx(r.x)<vw+40&&sy(r.y)>-40&&sy(r.y)<vh+40).forEach(r=>{
      ctx.fillStyle=r.color; ctx.beginPath(); ctx.arc(sx(r.x),sy(r.y),r.radius,0,Math.PI*2); ctx.fill();
    });
    buildings.forEach(b=>{
      ctx.fillStyle=b.type==='castle'?(b.nation==='demacia'?'#cbd5e1':'#64748b'):b.type==='house'?'#a16207':b.type==='door'?'#854d0e':'#737373';
      ctx.fillRect(sx(b.x-b.w/2),sy(b.y-b.h/2),b.w,b.h);
      ctx.strokeStyle='#111'; ctx.strokeRect(sx(b.x-b.w/2),sy(b.y-b.h/2),b.w,b.h);
      if (b.type==='wall' || b.type==='door') {
        ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(sx(b.x-b.w/2), sy(b.y-b.h/2)-8, b.w, 4);
        ctx.fillStyle=b.nation==='demacia'?'#22c55e':'#ef4444'; ctx.fillRect(sx(b.x-b.w/2), sy(b.y-b.h/2)-8, b.w*Math.max(0,(b.hp||10)/(b.maxHp||10)), 4);
      }
    });
    const nationColor = (nation) => nation === 'noxus' ? '#ef4444' : nation === 'bandit' ? '#f59e0b' : nation === me.nation ? '#38bdf8' : '#3b82f6';
    const drawActor=(a,color,label,imgSrc='')=>{
      const r = a.radius || 18;
      ctx.save();
      ctx.beginPath(); ctx.arc(sx(a.x),sy(a.y),r,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); ctx.clip();
      const mediaSrc = imgSrc || a.asset || '';
      const media = a === me ? activeImg : getMedia(mediaSrc);
      const isVideo = media && media.tagName === 'VIDEO';
      if (media && ((isVideo && media.readyState >= 2) || (!isVideo && media.complete && media.naturalWidth))) {
        ctx.drawImage(media, sx(a.x)-r, sy(a.y)-r, r*2, r*2);
      }
      ctx.restore();
      const barW = Math.max(38, r*2.6);
      const nameY = sy(a.y)-r-24, hpY = sy(a.y)-r-16;
      ctx.font='800 11px sans-serif'; ctx.textAlign='center'; ctx.strokeStyle='rgba(0,0,0,.72)'; ctx.lineWidth=3;
      ctx.fillStyle = nationColor(a.nation);
      ctx.strokeText(label, sx(a.x), nameY); ctx.fillText(label, sx(a.x), nameY);
      if (a.questReward) {
        ctx.fillStyle = '#ffd36e';
        ctx.font = '900 18px sans-serif';
        ctx.strokeText('!', sx(a.x), sy(a.y)-r-42);
        ctx.fillText('!', sx(a.x), sy(a.y)-r-42);
      }
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(sx(a.x)-barW/2,hpY,barW,5);
      ctx.fillStyle=nationColor(a.nation);
      ctx.fillRect(sx(a.x)-barW/2,hpY,barW*Math.max(0,(a.hp||1)/(a.maxHp||1)),5);
    };
    npcs.filter(n=>sx(n.x)>-60&&sx(n.x)<vw+60&&sy(n.y)>-60&&sy(n.y)<vh+60).forEach(n=>drawActor(n,n.nation==='demacia'?'#3b82f6':n.nation==='noxus'?'#ef4444':'#f59e0b', n.nickname || roleNickname(n.nation, n.role, 0), n.asset));
    Object.values(others).filter(o=>Date.now()-(o.at||0)<8000 && sx(o.x)>-80&&sx(o.x)<vw+80&&sy(o.y)>-80&&sy(o.y)<vh+80).forEach(o=>drawActor(o,o.nation==='noxus'?'#ef4444':'#22c55e',`${o.countryName || '플레이어'} ${o.nickname||'P'}`,o.image));
    if (me.vehicle?.type === 'car') { ctx.fillStyle='#111827'; ctx.fillRect(sx(me.x)-34, sy(me.y)+18, 68, 26); ctx.fillStyle='#60a5fa'; ctx.fillRect(sx(me.x)-22, sy(me.y)+12, 44, 16); }
    if (me.vehicle?.type === 'boat') { ctx.fillStyle='#8b5a2b'; ctx.beginPath(); ctx.ellipse(sx(me.x), sy(me.y)+24, 52, 22, 0, 0, Math.PI*2); ctx.fill(); }
    drawActor(me,'#38bdf8',me.nickname,me.image);
  };

  const tick = (t) => {
    if (!running) return;
    const dt = Math.min(0.05,(t-last)/1000); last=t;
    const mx=((keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0)) + joyInput.x;
    const my=((keys.ArrowDown||keys.KeyS?1:0)-(keys.ArrowUp||keys.KeyW?1:0)) + joyInput.y;
    const moveMag = Math.hypot(mx,my);
    const l = moveMag || 1;
    if (moveMag > 0.08) { const d = norm(mx,my); me.dirX = d.x; me.dirY = d.y; }
    const runMul = performance.now() < runUntil ? 1.65 : 1;
    const vehicleMul = me.vehicle?.type === 'car' && !isWater(me.x, me.y) ? 2.0 : me.vehicle?.type === 'boat' ? 1.35 : 1;
    const nx=moveMag > 0.08 ? me.x+mx/l*me.speed*runMul*vehicleMul*dt : me.x;
    const ny=moveMag > 0.08 ? me.y+my/l*me.speed*runMul*vehicleMul*dt : me.y;
    if (moveMag > 0.08 && canMoveTo(nx,ny)) { me.x=clamp(nx,15,WORLD.w-15); me.y=clamp(ny,15,WORLD.h-15); }
    const questGiver = npcs.find((n) => n.questReward && n.questOwner === playerId && dist(me,n) < me.radius + n.radius + 16);
    if (questGiver) {
      questGiver.questReward = false;
      questGiver.nickname = (questGiver.nickname || '').replace(' !','');
      me.bag.iron = (me.bag.iron || 0) + 10;
      toast('주민에게서 산적 토벌 보상 철 10개를 받았습니다.');
    }
    if (me.hp <= 0) { me.hp = me.maxHp; me.x = WORLD.w/2 + rand(-240,240); me.y = WORLD.h/2 + rand(-180,180); toast('쓰러져 맵 중앙 근처에서 부활했습니다.'); }
    npcStep(dt);
    draw();
    updatePanel();
    raf=requestAnimationFrame(tick);
  };
  updatePanel();
  publish();
  raf=requestAnimationFrame(tick);

  return () => {
    running=false;
    cancelAnimationFrame(raf);
    clearInterval(publishTimer);
    if (onlineRef) remove(onlineRef).catch(()=>{});
    if (unsub) unsub();
    mediaCache.forEach((m) => { if (m?.tagName === 'VIDEO') { try { m.pause(); } catch (error) {} } });
    removeEventListener('keydown', keyDown); removeEventListener('keyup', keyUp);
    window.removeEventListener('pointermove', moveJoy);
    window.removeEventListener('pointerup', endJoy);
    window.removeEventListener('pointercancel', endJoy);
    window.removeEventListener('blur', resetJoy);
    removeEventListener('resize', resize);
  };
};
