import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── DATA ─────────────────────────────────────────────────────────────────────

const GROUPS = [
  { id:"A", teams:[{name:"Mexico",flag:"mx",host:true},{name:"South Africa",flag:"za"},{name:"South Korea",flag:"kr"},{name:"Czechia",flag:"cz"}]},
  { id:"B", teams:[{name:"Canada",flag:"ca",host:true},{name:"Bosnia & Herz.",flag:"ba"},{name:"Qatar",flag:"qa"},{name:"Switzerland",flag:"ch"}]},
  { id:"C", teams:[{name:"Brazil",flag:"br"},{name:"Morocco",flag:"ma"},{name:"Haiti",flag:"ht"},{name:"Scotland",flag:"gb-sct"}]},
  { id:"D", teams:[{name:"USA",flag:"us",host:true},{name:"Paraguay",flag:"py"},{name:"Australia",flag:"au"},{name:"Turkey",flag:"tr"}]},
  { id:"E", teams:[{name:"Spain",flag:"es"},{name:"Uruguay",flag:"uy"},{name:"Zambia",flag:"zm"},{name:"Cameroon",flag:"cm"}]},
  { id:"F", teams:[{name:"Portugal",flag:"pt"},{name:"Argentina",flag:"ar"},{name:"Saudi Arabia",flag:"sa"},{name:"Poland",flag:"pl"}]},
  { id:"G", teams:[{name:"Belgium",flag:"be"},{name:"Egypt",flag:"eg"},{name:"Iran",flag:"ir"},{name:"New Zealand",flag:"nz"}]},
  { id:"H", teams:[{name:"England",flag:"gb-eng"},{name:"Serbia",flag:"rs"},{name:"Panama",flag:"pa"},{name:"DR Congo",flag:"cd"}]},
  { id:"I", teams:[{name:"France",flag:"fr"},{name:"Senegal",flag:"sn"},{name:"Norway",flag:"no"},{name:"Iraq",flag:"iq"}]},
  { id:"J", teams:[{name:"Germany",flag:"de"},{name:"Japan",flag:"jp"},{name:"Colombia",flag:"co"},{name:"Algeria",flag:"dz"}]},
  { id:"K", teams:[{name:"Netherlands",flag:"nl"},{name:"Ecuador",flag:"ec"},{name:"Chile",flag:"cl"},{name:"Bahrain",flag:"bh"}]},
  { id:"L", teams:[{name:"Italy",flag:"it"},{name:"Croatia",flag:"hr"},{name:"Peru",flag:"pe"},{name:"Venezuela",flag:"ve"}]},
];

// ── STATE ────────────────────────────────────────────────────────────────────

let db;
let picks = {};        // { A: ["Mexico","South Korea"], B: [...], ... }
let qualifiers = {};   // { A: ["Mexico","South Korea"], ... } — from API or manual
let allEntries = [];   // fetched from Firestore
let picksLocked = false;
let currentTab = 'picks';

// ── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  // Check if config is filled
  if (CONFIG.firebase.apiKey === "YOUR_FIREBASE_API_KEY") {
    showConfigWarning();
    hideLoader();
    return;
  }

  picksLocked = new Date() >= new Date(CONFIG.picksLockDate);
  renderGroups();
  hideLoader();

  try {
    const app = initializeApp(CONFIG.firebase);
    db = getFirestore(app);
    await fetchQualifiers();
    await loadLeaderboard();
  } catch(e) {
    showToast("Firebase error: " + e.message, true);
  }
}

function showConfigWarning() {
  document.querySelector('.app').innerHTML = `
    <div style="text-align:center;padding:60px 20px;">
      <div style="font-family:var(--font-display);font-size:40px;color:var(--gold);margin-bottom:16px;">SETUP REQUIRED</div>
      <div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted);line-height:2;max-width:500px;margin:0 auto;">
        Open <strong style="color:var(--text)">index.html</strong> and fill in the <strong style="color:var(--green)">CONFIG</strong> section at the top:<br><br>
        1. Firebase API key + project details<br>
        2. API-Football key (api-football.com)<br><br>
        <span style="color:var(--text-dim)">See README.md for step-by-step instructions.</span>
      </div>
    </div>`;
}

// ── RENDER GROUPS (picks tab) ─────────────────────────────────────────────────

function renderGroups() {
  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = '';

  GROUPS.forEach(g => {
    const picked = picks[g.id] || [];
    const card = document.createElement('div');
    card.className = 'group-card' + (picked.length === 2 ? ' complete' : '');
    card.id = 'group-card-' + g.id;

    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-name">GROUP ${g.id}</span>
        <span class="group-pick-count ${picked.length===2?'done':''}" id="pick-count-${g.id}">${picked.length}/2</span>
      </div>
      ${g.teams.map(t => {
        const isPicked = picked.includes(t.name);
        const isLocked = picksLocked;
        const qual = qualifiers[g.id] || [];
        const isQual = qual.includes(t.name);
        const correct = isPicked && isQual;
        const wrong = isPicked && qual.length > 0 && !isQual;
        let cls = 'team-row';
        if (isPicked) cls += ' selected';
        if (isLocked) cls += ' locked';
        if (correct) cls += ' correct';
        if (wrong) cls += ' wrong';
        return `
          <div class="${cls}" onclick="${isLocked?'':'togglePick(\"'+g.id+'\",\"'+t.name+'\")'}" data-group="${g.id}" data-team="${t.name}">
            <img class="team-flag" src="https://flagcdn.com/w40/${t.flag}.png" alt="${t.name}" onerror="this.style.display='none'">
            <span class="team-name-text">${t.name}${t.host?'<span class="host-chip">H</span>':''}</span>
            ${isQual ? '<span class="qualifier-tag">Q</span>' : ''}
            <div class="team-check"></div>
          </div>`;
      }).join('')}
    `;
    grid.appendChild(card);
  });

  updateSubmitBar();
}

// ── TOGGLE PICK ───────────────────────────────────────────────────────────────

window.togglePick = function(groupId, teamName) {
  if (picksLocked) return;
  if (!picks[groupId]) picks[groupId] = [];
  const idx = picks[groupId].indexOf(teamName);
  if (idx > -1) {
    picks[groupId].splice(idx, 1);
  } else {
    if (picks[groupId].length >= 2) {
      showToast("Only 2 picks per group", true);
      return;
    }
    picks[groupId].push(teamName);
  }
  renderGroups();
};

function updateSubmitBar() {
  const complete = GROUPS.filter(g => (picks[g.id]||[]).length === 2).length;
  document.getElementById('completeCount').textContent = complete;
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('submitMsg');

  if (picksLocked) {
    btn.disabled = true;
    btn.textContent = 'Picks Locked';
    msg.textContent = 'Submissions closed June 11';
    msg.className = 'submit-msg error';
  } else if (complete === 12) {
    btn.disabled = false;
    msg.textContent = 'All groups complete!';
    msg.className = 'submit-msg';
  } else {
    btn.disabled = true;
    msg.textContent = `${12 - complete} group${12-complete!==1?'s':''} remaining`;
    msg.className = 'submit-msg';
  }
}

// ── SUBMIT PICKS ──────────────────────────────────────────────────────────────

window.submitPicks = async function() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { showToast("Enter your name first", true); return; }
  if (GROUPS.some(g => (picks[g.id]||[]).length !== 2)) {
    showToast("Complete all 12 groups first", true); return;
  }
  if (picksLocked) { showToast("Picks are locked", true); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  try {
    const key = name.toLowerCase().replace(/\s+/g, '_');
    await setDoc(doc(db, "picks", key), {
      name,
      picks,
      submittedAt: new Date().toISOString(),
      score: computeScore(picks)
    });
    showToast("Picks saved! Good luck 🏆");
    await loadLeaderboard();
  } catch(e) {
    showToast("Save failed: " + e.message, true);
  }

  btn.disabled = false;
  btn.textContent = 'Submit Picks';
};

// ── LOAD MY PICKS ─────────────────────────────────────────────────────────────

window.loadMyPicks = async function() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { showToast("Enter your name first", true); return; }
  const key = name.toLowerCase().replace(/\s+/g, '_');
  try {
    const snap = await getDoc(doc(db, "picks", key));
    if (snap.exists()) {
      picks = snap.data().picks || {};
      renderGroups();
      showToast("Picks loaded!");
    } else {
      showToast("No picks found for " + name, true);
    }
  } catch(e) {
    showToast("Load failed: " + e.message, true);
  }
};

// ── FETCH QUALIFIERS FROM API-FOOTBALL ───────────────────────────────────────

async function fetchQualifiers() {
  if (CONFIG.footballApiKey === "YOUR_API_FOOTBALL_KEY") return;
  // Only fetch if group stage has started
  if (new Date() < new Date(CONFIG.picksLockDate)) return;

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/standings?league=${CONFIG.leagueId}&season=${CONFIG.season}`,
      { headers: { "x-apisports-key": CONFIG.footballApiKey } }
    );
    const data = await res.json();
    const standings = data?.response?.[0]?.league?.standings || [];

    // Map group standings to qualifier teams (top 2 per group)
    standings.forEach((group, idx) => {
      const letter = String.fromCharCode(65 + idx);
      qualifiers[letter] = group.slice(0, 2).map(s => {
        // Match API team name to our team names
        return matchTeamName(s.team.name);
      }).filter(Boolean);
    });

    renderGroups();
    renderResults();
    await rescoreAll();
  } catch(e) {
    console.warn("API fetch failed:", e);
  }
}

function matchTeamName(apiName) {
  // Fuzzy match API names to our team names
  const map = {
    "Mexico": "Mexico", "South Africa": "South Africa", "Korea Republic": "South Korea",
    "Czech Republic": "Czechia", "Czechia": "Czechia", "Canada": "Canada",
    "Bosnia and Herzegovina": "Bosnia & Herz.", "Qatar": "Qatar", "Switzerland": "Switzerland",
    "Brazil": "Brazil", "Morocco": "Morocco", "Haiti": "Haiti", "Scotland": "Scotland",
    "United States": "USA", "USA": "USA", "Paraguay": "Paraguay", "Australia": "Australia",
    "Turkey": "Turkey", "Spain": "Spain", "Uruguay": "Uruguay", "Zambia": "Zambia",
    "Cameroon": "Cameroon", "Portugal": "Portugal", "Argentina": "Argentina",
    "Saudi Arabia": "Saudi Arabia", "Poland": "Poland", "Belgium": "Belgium",
    "Egypt": "Egypt", "Iran": "Iran", "New Zealand": "New Zealand", "England": "England",
    "Serbia": "Serbia", "Panama": "Panama", "Congo DR": "DR Congo", "DR Congo": "DR Congo",
    "France": "France", "Senegal": "Senegal", "Norway": "Norway", "Iraq": "Iraq",
    "Germany": "Germany", "Japan": "Japan", "Colombia": "Colombia", "Algeria": "Algeria",
    "Netherlands": "Netherlands", "Ecuador": "Ecuador", "Chile": "Chile", "Bahrain": "Bahrain",
    "Italy": "Italy", "Croatia": "Croatia", "Peru": "Peru", "Venezuela": "Venezuela",
  };
  return map[apiName] || null;
}

// ── SCORING ───────────────────────────────────────────────────────────────────

function computeScore(playerPicks) {
  let score = 0;
  GROUPS.forEach(g => {
    const qual = qualifiers[g.id] || [];
    const myPicks = playerPicks[g.id] || [];
    myPicks.forEach(t => { if (qual.includes(t)) score++; });
  });
  return score;
}

async function rescoreAll() {
  if (!db) return;
  const snap = await getDocs(collection(db, "picks"));
  const batch = [];
  snap.forEach(d => {
    const data = d.data();
    const newScore = computeScore(data.picks || {});
    if (newScore !== data.score) {
      batch.push(setDoc(doc(db, "picks", d.id), { ...data, score: newScore }));
    }
  });
  await Promise.all(batch);
  await loadLeaderboard();
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────

async function loadLeaderboard() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, "picks"));
    allEntries = [];
    snap.forEach(d => allEntries.push(d.data()));
    allEntries.sort((a, b) => (b.score || 0) - (a.score || 0));
    renderLeaderboard();
  } catch(e) {
    console.warn("Leaderboard load failed:", e);
  }
}

function renderLeaderboard() {
  const myName = document.getElementById('playerName').value.trim().toLowerCase();
  const groupsDone = Object.keys(qualifiers).length;

  document.getElementById('statPlayers').textContent = allEntries.length;
  document.getElementById('statGroups').textContent = groupsDone + ' / 12';
  document.getElementById('statPts').textContent = groupsDone * 2;

  const container = document.getElementById('leaderboardTable');
  if (allEntries.length === 0) {
    container.innerHTML = '<div class="lb-empty">No picks submitted yet. Be the first!</div>';
    return;
  }

  const groupLetters = GROUPS.map(g => g.id);

  let html = `
    <div class="lb-header">
      <div>#</div>
      <div>Player</div>
      ${groupLetters.map(l => `<div>${l}</div>`).join('')}
      <div>PTS</div>
    </div>`;

  allEntries.forEach((entry, i) => {
    const isMe = entry.name.toLowerCase() === myName;
    const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    html += `
      <div class="lb-row ${isMe ? 'me' : ''}">
        <div class="lb-rank ${rankClass}">${i+1}</div>
        <div class="lb-name">${entry.name}${isMe?' <span style="color:var(--green);font-size:10px;font-family:var(--font-mono);">(you)</span>':''}</div>
        ${groupLetters.map(l => {
          const qual = qualifiers[l] || [];
          const myPicks = (entry.picks || {})[l] || [];
          let pts = 0;
          myPicks.forEach(t => { if (qual.includes(t)) pts++; });
          return `<div class="lb-score ${pts > 0 ? 'hit' : ''}">${qual.length > 0 ? pts : '·'}</div>`;
        }).join('')}
        <div class="lb-total">${entry.score || 0}</div>
      </div>`;
  });

  container.innerHTML = html;
}

// ── RESULTS TAB ───────────────────────────────────────────────────────────────

function renderResults() {
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';

  GROUPS.forEach(g => {
    const qual = qualifiers[g.id] || [];
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-name">GROUP ${g.id}</span>
        <span class="group-pick-count ${qual.length===2?'done':''}">${qual.length===2?'Final':'In Progress'}</span>
      </div>
      ${g.teams.map(t => {
        const isQual = qual.includes(t.name);
        return `
          <div class="team-row ${isQual ? 'correct locked' : 'locked'}">
            <img class="team-flag" src="https://flagcdn.com/w40/${t.flag}.png" alt="${t.name}" onerror="this.style.display='none'">
            <span class="team-name-text">${t.name}${t.host?'<span class="host-chip">H</span>':''}</span>
            ${isQual ? '<span class="qualifier-tag">QUALIFIED</span>' : ''}
            <div class="team-check"></div>
          </div>`;
      }).join('')}
    `;
    grid.appendChild(card);
  });
}

// ── TABS ──────────────────────────────────────────────────────────────────────

window.showTab = function(tab) {
  ['picks','leaderboard','results'].forEach(t => {
    document.getElementById('view-'+t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-'+t).classList.toggle('active', t === tab);
  });
  currentTab = tab;
  if (tab === 'leaderboard') renderLeaderboard();
  if (tab === 'results') renderResults();
};

// ── TOAST ─────────────────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 3000);
}

function hideLoader() {
  const ol = document.getElementById('loadingOverlay');
  ol.classList.add('hidden');
  setTimeout(() => ol.style.display = 'none', 500);
}

// ── START ─────────────────────────────────────────────────────────────────────

init();

