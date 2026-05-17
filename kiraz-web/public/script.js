/* public/script.js */

const firebaseConfig = {
    apiKey: "AIzaSyDO4axgbMlOp_WFtPZuahNh_glJZXbSBZQ",
    authDomain: "kiraz-software.firebaseapp.com",
    projectId: "kiraz-software",
    storageBucket: "kiraz-software.firebasestorage.app",
    messagingSenderId: "1043597215258",
    appId: "1:1043597215258:web:6d91bcbb42ec2918ba33a3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUser = "Unbekannt"; 
let isUserAdmin = false; 

const materialDaten = {
    "Frosch": { weight: 1.0, gatherAmount: 12, gatherTimeMin: 1 },
    "Froschhaut": { weight: 0.1 }, 
    "Ephi Extrakt": { weight: 0.05 },
    "Ephi": { weight: 0.02 },
    "Kokain Blätter": { weight: 0.5, gatherAmount: 15, gatherTimeMin: 1 },
    "Benzin": { weight: 2.0, gatherAmount: 5, gatherTimeMin: 1 },
    "Methanol": { weight: 1.0, gatherAmount: 8, gatherTimeMin: 1 },
    "Kokain": { weight: 0.05 },
    "Natronlauge": { weight: 1.0, gatherAmount: 10, gatherTimeMin: 1 },
    "Lithiumfolie": { weight: 0.2, gatherAmount: 20, gatherTimeMin: 1 },
    "Ammoniumnitrat": { weight: 1.5, gatherAmount: 6, gatherTimeMin: 1 },
    "Meth": { weight: 0.05 },
    "Koffeinpulver": { weight: 0.5, gatherAmount: 15, gatherTimeMin: 1 },
    "Nitroethan": { weight: 1.0, gatherAmount: 10, gatherTimeMin: 1 },
    "Methylamin": { weight: 1.0, gatherAmount: 10, gatherTimeMin: 1 },
    "Ecstasy": { weight: 0.02 },
    "Baumwolle": { weight: 0.2, gatherAmount: 20, gatherTimeMin: 1 },
    "Polyethylenplatten": { weight: 2.5, gatherAmount: 3, gatherTimeMin: 1 },
    "Zündladungen": { weight: 0.01, gatherAmount: 40, gatherTimeMin: 1 },
    "Projektil": { weight: 0.02, gatherAmount: 40, gatherTimeMin: 1 },
    "Patronenhülsen": { weight: 0.02, gatherAmount: 40, gatherTimeMin: 1 },
    "Waffenrahmen": { weight: 1.5 },
    "Schlagbolzen": { weight: 0.1 },
    "Riegel": { weight: 0.3 },
    "Erz": { weight: 3.0, gatherAmount: 5, gatherTimeMin: 1 },
    "Metall": { weight: 1.5 },
    "Bargeld": { weight: 0.0 }
};

function getMaterialInfoText(matName) {
    if (!materialDaten[matName]) return "";
    let data = materialDaten[matName];
    let w = data.weight ? `${data.weight} kg` : "";
    let g = data.gatherAmount ? ` | Farmen: ${data.gatherAmount}x in ${data.gatherTimeMin} Min.` : "";
    return ` <span style="color:#888; font-size:0.85em;">(${w}${g})</span>`;
}

function updateCraftStats(dataMats, amount, statsDivId) {
    let statsDiv = document.getElementById(statsDivId);
    if (!statsDiv) return;
    let totalWeight = 0;
    let totalGatherTime = 0;
    let requiredGathering = false; 

    for (let t in dataMats) {
        let need = dataMats[t] * amount;
        if(materialDaten[t]) {
            if(materialDaten[t].weight) totalWeight += need * materialDaten[t].weight;
            
            if(materialDaten[t].gatherAmount && materialDaten[t].gatherTimeMin) {
                requiredGathering = true;
                let cycles = Math.ceil(need / materialDaten[t].gatherAmount);
                totalGatherTime += cycles * materialDaten[t].gatherTimeMin;
            }
        }
    }

    if (totalWeight > 0 || requiredGathering) {
        let timeInfo = requiredGathering ? `<br>⏱️ <b>Benötigte Sammelzeit:</b> ca. ${totalGatherTime} Min.` : "";
        statsDiv.innerHTML = `⚖️ <b>Benötigtes Gewicht:</b> ${totalWeight.toFixed(2)} kg ${timeInfo}`;
        statsDiv.style.display = "block";
    } else {
        statsDiv.style.display = "none";
    }
}

function updateOnlineStatus() {
    if(currentUser !== "Unbekannt") {
        db.collection("online").doc(currentUser).set({
            username: currentUser,
            lastActive: Date.now(),
            isAdmin: isUserAdmin
        }).catch(err => console.log("Fehler beim Online-Status Update: ", err));
    }
}
setInterval(updateOnlineStatus, 10000);

db.collection("online").onSnapshot((snapshot) => {
    const list = document.getElementById("onlineList");
    const countBtn = document.getElementById("onlineCountBtn");
    if(!list || !countBtn) return;

    let now = Date.now();
    let members = [];
    snapshot.forEach(doc => members.push(doc.data()));

    members.sort((a, b) => b.lastActive - a.lastActive);

    let listHtml = "";
    let onlineCount = 0;

    members.forEach(data => {
        let diff = now - data.lastActive;
        let isOnline = diff < 35000;
        if (isOnline) onlineCount++;

        let statusIcon = isOnline ? "🟢" : "⚪";
        let timeLabel = isOnline ? 
            '<span style="color: #77dd77; font-size: 0.8em;">Aktiv</span>' : 
            `<span style="color: #aaa; font-size: 0.8em;">Zuletzt: ${new Date(data.lastActive).toLocaleString("de-DE", {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'})}</span>`;

        listHtml += `
            <div style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.2em;">${statusIcon}</span>
                    <span style="color: #fff; font-weight: bold; opacity: ${isOnline ? '1' : '0.6'}">${data.username}${data.isAdmin ? ' <span style="color:#ffcc00;">⭐</span>' : ''}</span>
                </div>
                <div>${timeLabel}</div>
            </div>`;
    });

    list.innerHTML = members.length === 0 ? "<p style='color:#aaa; text-align:center;'>Noch keine Daten.</p>" : listHtml;
    countBtn.innerText = `👥 Mitglieder (${onlineCount})`;
});

function addLog(action, details) {
    db.collection("logs").add({
        user: currentUser,
        action: action,
        details: details,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
    }).catch(err => console.error("Fehler beim Loggen: ", err));
}

db.collection("logs").orderBy("timestamp", "desc").limit(50).onSnapshot((querySnapshot) => {
    const logList = document.getElementById("logList");
    if(!logList) return;
    
    logList.innerHTML = "";
    if(querySnapshot.empty) {
        logList.innerHTML = "<p style='color:#aaa;'>Noch keine Einträge vorhanden.</p>";
        return;
    }
    
    querySnapshot.forEach((doc) => {
        let d = doc.data();
        let timeStr = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString("de-DE") : "Gerade eben";
        logList.innerHTML += `
        <div class="log-entry">
            <span class="log-time">[${timeStr}]</span> 
            <span class="log-user">${d.user}</span> hat 
            <span class="log-action">${d.action}</span>: 
            <i>${d.details}</i>
        </div>`;
    });
});

let crafts = [];
let mapMarkers = []; 

db.collection("crafts").onSnapshot((querySnapshot) => {
    crafts = [];
    querySnapshot.forEach((doc) => {
        crafts.push({ id: doc.id, ...doc.data() });
    });
    render(); 
});

const rezepte = {
    "SNS Pistole": { mats: { "Waffenrahmen": 15, "Schlagbolzen": 25, "Riegel": 35 }, time: 1320 },
    "Normale Pistole": { mats: { "Waffenrahmen": 45, "Schlagbolzen": 30, "Riegel": 35 }, time: 2000 },
    "Pistole MK2": { mats: { "Waffenrahmen": 40, "Schlagbolzen": 70, "Riegel": 65 }, time: 2880 },
    "Pistole 50.": { mats: { "Waffenrahmen": 35, "Schlagbolzen": 60, "Riegel": 40 }, time: 2980 },
    "Mikro SMG": { mats: { "Waffenrahmen": 125, "Schlagbolzen": 100, "Riegel": 140 }, time: 3900 },
    "Abgesägte Schrottflinte": { mats: { "Waffenrahmen": 150, "Schlagbolzen": 120, "Riegel": 150, "Bargeld": 100000 }, time: 4200 }
};

const ephiRezepte = {
    "Froschhaut": { mats: { "Frosch": 1 }, time: 15 },
    "Ephi Extrakt": { mats: { "Froschhaut": 1 }, time: 20 },
    "Ephi": { mats: { "Ephi Extrakt": 1 }, time: 12 }
};

const kokainRezepte = {
    "Kokain": { mats: { "Benzin": 1, "Methanol": 2, "Kokain Blätter": 3 }, time: 4 }
};

const methRezepte = {
    "Meth": { mats: { "Natronlauge": 1, "Lithiumfolie": 2, "Ammoniumnitrat": 3 }, time: 4 }
};

const ecstasyRezepte = {
    "Ecstasy": { mats: { "Koffeinpulver": 1, "Nitroethan": 2, "Methylamin": 3 }, time: 4 }
};

const westenRezepte = {
    "Leichte Weste": { mats: { "Baumwolle": 10, "Polyethylenplatten": 10 }, time: 45 },
    "Schwere Weste": { mats: { "Baumwolle": 50, "Polyethylenplatten": 50 }, time: 225 } 
};

const munitionRezepte = {
    "Pistolen Magazin": { mats: { "Zündladungen": 2, "Projektil": 3, "Patronenhülsen": 4 }, time: 15 },
    "SMG Magazin": { mats: { "Zündladungen": 6, "Projektil": 12, "Patronenhülsen": 16 }, time: 35 }
};

function showDashboard() {
    document.getElementById('mainDashboard').style.display = "block";
    document.getElementById('craftTab').style.display = "none";
    document.getElementById('ephiTab').style.display = "none";
    document.getElementById('kokainTab').style.display = "none";
    document.getElementById('methTab').style.display = "none";
    document.getElementById('ecstasyTab').style.display = "none";
    document.getElementById('westenTab').style.display = "none";
    document.getElementById('munitionTab').style.display = "none";
    document.getElementById('geldwaescheTab').style.display = "none"; 
    document.getElementById('schwarzmarktTab').style.display = "none"; 
    document.getElementById('spindTab').style.display = "none";
    document.getElementById('checklistTab').style.display = "none";
    document.getElementById('timerTab').style.display = "none";
    document.getElementById('smeltTab').style.display = "none";
    document.getElementById('mapTab').style.display = "none";
    document.getElementById('logTab').style.display = "none";
    document.getElementById('onlineTab').style.display = "none"; 
    document.getElementById('backBtn').style.display = "none";
}

function openRoute(tabId) {
    document.getElementById('mainDashboard').style.display = "none";
    document.getElementById(tabId).style.display = "block";
    document.getElementById('backBtn').style.display = "block";
    window.scrollTo(0,0);
}

// --- SPIND / INVENTAR LOGIK ---
let currentSpindViewUser = "";
let spindUnsubscribe = null;

function openSpindTab() {
    currentSpindViewUser = currentUser;
    document.getElementById('spindTitle').innerText = "Mein Spind (" + currentUser + ")";
    
    if (isUserAdmin || isUserLeader) {
        document.getElementById('spindAdminView').style.display = "block";
        populateSpindUserSelect();
    }
    
    listenToSpind(currentSpindViewUser);
}

function listenToSpind(username) {
    if (spindUnsubscribe) spindUnsubscribe(); 
    
    const list = document.getElementById("spindList");
    list.innerHTML = "<p style='color:#aaa; text-align:center;'>Lade Daten...</p>";

    spindUnsubscribe = db.collection("lockers").doc(username).onSnapshot(doc => {
        if (!doc.exists) {
            list.innerHTML = "<p style='color:#aaa; text-align:center;'>Spind ist leer.</p>";
            return;
        }
        const data = doc.data().items || {};
        renderSpindList(data);
    });
}

function renderSpindList(items) {
    const list = document.getElementById("spindList");
    list.innerHTML = "";
    let empty = true;
    
    for (let item in items) {
        if (items[item] > 0) {
            empty = false;
            list.innerHTML += `
            <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #3e3e5e; background: rgba(255,255,255,0.02); margin-bottom: 5px; border-radius: 5px;">
                <span style="color:#fff; font-weight:bold; font-size: 1.1em;">📦 ${item}</span>
                <span style="color:#77dd77; font-weight:bold; font-size: 1.1em;">${items[item]}x</span>
            </div>`;
        }
    }
    if (empty) {
        list.innerHTML = "<p style='color:#aaa; text-align:center;'>Spind ist leer.</p>";
    }
}

function updateSpindItem(action) {
    const itemName = document.getElementById("spindItemName").value.trim();
    const amount = parseInt(document.getElementById("spindItemAmount").value);
    
    if (!itemName || isNaN(amount) || amount <= 0) {
        alert("Bitte einen Gegenstand und eine gültige Anzahl eingeben.");
        return;
    }

    const targetUser = currentSpindViewUser; 
    const docRef = db.collection("lockers").doc(targetUser);

    db.runTransaction(transaction => {
        return transaction.get(docRef).then(doc => {
            let items = {};
            if (doc.exists) {
                items = doc.data().items || {};
            }

            let currentAmount = items[itemName] || 0;
            if (action === 'add') {
                items[itemName] = currentAmount + amount;
            } else if (action === 'remove') {
                items[itemName] = Math.max(0, currentAmount - amount); 
            }

            transaction.set(docRef, { items: items }, { merge: true });
        });
    }).then(() => {
        document.getElementById("spindItemName").value = "";
        document.getElementById("spindItemAmount").value = "";
        
        let actText = action === 'add' ? 'eingelagert' : 'entnommen';
        addLog("Spind genutzt", `${amount}x ${itemName} bei ${targetUser} ${actText}.`);
    }).catch(err => console.error("Fehler beim Spind Update:", err));
}

// --- AUTO-CLEANUP LOGIK (Löscht veraltete User) ---
function autoCleanupDatabase() {
    if (!isUserLeader && !isUserAdmin) return;

    fetch('/api/faction-members')
        .then(res => res.json())
        .then(members => {
            if(!Array.isArray(members)) return;
            
            const validUsernames = members.map(m => m.name);
            const validIds = members.map(m => m.id);

            db.collection("lockers").get().then(snapshot => {
                snapshot.forEach(doc => {
                    if (!validUsernames.includes(doc.id)) {
                        db.collection("lockers").doc(doc.id).delete()
                            .then(() => {
                                console.log(`Veralteter Spind von ${doc.id} wurde gelöscht.`);
                                addLog("System Cleanup", `Spind von ${doc.id} entfernt (Mitglied hat Fraktion verlassen)`);
                            });
                    }
                });
            });

            db.collection("checklist").get().then(snapshot => {
                snapshot.forEach(doc => {
                    if (!validIds.includes(doc.id)) {
                        db.collection("checklist").doc(doc.id).delete()
                            .then(() => console.log(`Veraltete Checkliste von ${doc.id} wurde gelöscht.`));
                    }
                });
            });
            
        }).catch(err => console.error("Fehler beim Auto-Cleanup:", err));
}
    
function populateSpindUserSelect() {
    const select = document.getElementById("spindUserSelect");
    if (select.options.length > 0) return; 
    
    select.innerHTML = `<option value="${currentUser}">Mein eigener Spind</option>`;
    
    fetch('/api/faction-members')
        .then(res => res.json())
        .then(members => {
            if(Array.isArray(members)) {
                members.sort((a, b) => a.name.localeCompare(b.name)).forEach(member => {
                    if (member.name !== currentUser) {
                        select.innerHTML += `<option value="${member.name}">${member.name} (${member.rankName})</option>`;
                    }
                });
            }
        }).catch(err => console.log("Fehler beim Laden der Mitglieder für den Spind", err));
}

function loadSpindForUser() {
    const selected = document.getElementById("spindUserSelect").value;
    currentSpindViewUser = selected;
    
    if (selected === currentUser) {
        document.getElementById('spindTitle').innerText = "Mein Spind (" + currentUser + ")";
    } else {
        document.getElementById('spindTitle').innerText = "Spind von " + selected;
    }
    
    listenToSpind(selected);
}

// --- PRODUKTIONS LOGIK ---
function loadRecipe() {
    const inputs = document.getElementById("inputs"); inputs.innerHTML = "";
    let item = document.getElementById("itemSelect").value;
    let data = rezepte[item];
    if (!data) { document.getElementById("craftStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let icon = (t === "Bargeld") ? "💰" : "📦";
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${icon} ${t}</span>${info}</div><input id="${t}" type="number" placeholder="Vorhanden..." oninput="checkCraft()"></div>`;
    }
    checkCraft();
}
function checkCraft() {
    let item = document.getElementById("itemSelect").value;
    let amount = parseInt(document.getElementById("craftAmount").value) || 1;
    let data = rezepte[item];
    let result = document.getElementById("result");
    let startBtn = document.getElementById("startBtn");

    if (!data) { 
        result.innerText = "Bitte Waffe wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("craftStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "craftStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById(t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Ressourcen bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createCraft() {
    let item = document.getElementById("itemSelect").value;
    let amount = parseInt(document.getElementById("craftAmount").value) || 1;
    let data = rezepte[item];
    let durationMs = data.time * amount * 1000;
    let craftName = item + (amount > 1 ? " x"+amount : "");
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Waffen-Produktion gestartet", craftName); });
    openRoute('timerTab');
}

function loadEphiRecipe() {
    const inputs = document.getElementById("ephiInputs"); inputs.innerHTML = "";
    let item = document.getElementById("ephiSelect").value;
    let data = ephiRezepte[item];
    if (!data) { document.getElementById("ephiStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let icon = (t === "Frosch") ? "🐸" : "🧪";
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${icon} ${t}</span>${info}</div><input id="ephi_${t}" type="number" placeholder="Vorhanden..." oninput="checkEphiCraft()"></div>`;
    }
    checkEphiCraft();
}
function checkEphiCraft() {
    let item = document.getElementById("ephiSelect").value; let amount = parseInt(document.getElementById("ephiAmount").value) || 1;
    let data = ephiRezepte[item]; let result = document.getElementById("ephiResult"); let startBtn = document.getElementById("ephiStartBtn");
    
    if (!data) { 
        result.innerText = "Bitte Prozess wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("ephiStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "ephiStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById("ephi_" + t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Materialien bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createEphiCraft() {
    let item = document.getElementById("ephiSelect").value; let amount = parseInt(document.getElementById("ephiAmount").value) || 1;
    let data = ephiRezepte[item]; let durationMs = data.time * amount * 1000; let craftName = (amount > 1 ? amount + "x " : "") + item;
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Ephi-Produktion gestartet", craftName); });
    openRoute('timerTab');
}

function loadKokainRecipe() {
    const inputs = document.getElementById("kokainInputs"); inputs.innerHTML = "";
    let item = document.getElementById("kokainSelect").value;
    let data = kokainRezepte[item];
    if (!data) { document.getElementById("kokainStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let icon = (t === "Kokain Blätter") ? "🌿" : (t === "Benzin" ? "🛢️" : "🧪");
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${icon} ${t}</span>${info}</div><input id="kokain_${t}" type="number" placeholder="Vorhanden..." oninput="checkKokainCraft()"></div>`;
    }
    checkKokainCraft();
}
function checkKokainCraft() {
    let item = document.getElementById("kokainSelect").value; let amount = parseInt(document.getElementById("kokainAmount").value) || 1;
    let data = kokainRezepte[item]; let result = document.getElementById("kokainResult"); let startBtn = document.getElementById("kokainStartBtn");
    
    if (!data) { 
        result.innerText = "Bitte Prozess wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("kokainStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "kokainStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById("kokain_" + t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Materialien bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createKokainCraft() {
    let item = document.getElementById("kokainSelect").value; let amount = parseInt(document.getElementById("kokainAmount").value) || 1;
    let data = kokainRezepte[item]; let durationMs = data.time * amount * 1000; let craftName = (amount > 1 ? amount + "x " : "") + item;
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Kokain-Produktion gestartet", craftName); });
    openRoute('timerTab');
}

function loadMethRecipe() {
    const inputs = document.getElementById("methInputs"); inputs.innerHTML = "";
    let item = document.getElementById("methSelect").value;
    let data = methRezepte[item];
    if (!data) { document.getElementById("methStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>🧪 ${t}</span>${info}</div><input id="meth_${t}" type="number" placeholder="Vorhanden..." oninput="checkMethCraft()"></div>`;
    }
    checkMethCraft();
}
function checkMethCraft() {
    let item = document.getElementById("methSelect").value; let amount = parseInt(document.getElementById("methAmount").value) || 1;
    let data = methRezepte[item]; let result = document.getElementById("methResult"); let startBtn = document.getElementById("methStartBtn");
    
    if (!data) { 
        result.innerText = "Bitte Prozess wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("methStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "methStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById("meth_" + t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Materialien bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createMethCraft() {
    let item = document.getElementById("methSelect").value; let amount = parseInt(document.getElementById("methAmount").value) || 1;
    let data = methRezepte[item]; let durationMs = data.time * amount * 1000; let craftName = (amount > 1 ? amount + "x " : "") + item;
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Meth-Produktion gestartet", craftName); });
    openRoute('timerTab');
}

function loadEcstasyRecipe() {
    const inputs = document.getElementById("ecstasyInputs"); inputs.innerHTML = "";
    let item = document.getElementById("ecstasySelect").value;
    let data = ecstasyRezepte[item];
    if (!data) { document.getElementById("ecstasyStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>🧪 ${t}</span>${info}</div><input id="ecstasy_${t}" type="number" placeholder="Vorhanden..." oninput="checkEcstasyCraft()"></div>`;
    }
    checkEcstasyCraft();
}
function checkEcstasyCraft() {
    let item = document.getElementById("ecstasySelect").value; let amount = parseInt(document.getElementById("ecstasyAmount").value) || 1;
    let data = ecstasyRezepte[item]; let result = document.getElementById("ecstasyResult"); let startBtn = document.getElementById("ecstasyStartBtn");
    
    if (!data) { 
        result.innerText = "Bitte Prozess wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("ecstasyStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "ecstasyStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById("ecstasy_" + t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Materialien bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createEcstasyCraft() {
    let item = document.getElementById("ecstasySelect").value; let amount = parseInt(document.getElementById("ecstasyAmount").value) || 1;
    let data = ecstasyRezepte[item]; let durationMs = data.time * amount * 1000; let craftName = (amount > 1 ? amount + "x " : "") + item;
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Ecstasy-Produktion gestartet", craftName); });
    openRoute('timerTab');
}

function loadWestenRecipe() {
    const inputs = document.getElementById("westenInputs"); inputs.innerHTML = "";
    let item = document.getElementById("westenSelect").value;
    let data = westenRezepte[item];
    if (!data) { document.getElementById("westenStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let icon = (t === "Baumwolle") ? "🧵" : "🔲";
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${icon} ${t}</span>${info}</div><input id="westen_${t}" type="number" placeholder="Vorhanden..." oninput="checkWestenCraft()"></div>`;
    }
    checkWestenCraft();
}
function checkWestenCraft() {
    let item = document.getElementById("westenSelect").value; let amount = parseInt(document.getElementById("westenAmount").value) || 1;
    let data = westenRezepte[item]; let result = document.getElementById("westenResult"); let startBtn = document.getElementById("westenStartBtn");
    
    if (!data) { 
        result.innerText = "Bitte Weste wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("westenStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "westenStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById("westen_" + t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Materialien bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createWestenCraft() {
    let item = document.getElementById("westenSelect").value; let amount = parseInt(document.getElementById("westenAmount").value) || 1;
    let data = westenRezepte[item]; let durationMs = data.time * amount * 1000; let craftName = item + (amount > 1 ? " x"+amount : "");
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Westen-Manufaktur gestartet", craftName); });
    openRoute('timerTab');
}

function loadMunitionRecipe() {
    const inputs = document.getElementById("munitionInputs"); inputs.innerHTML = "";
    let item = document.getElementById("munitionSelect").value;
    let data = munitionRezepte[item];
    if (!data) { document.getElementById("munitionStats").style.display = "none"; return; }
    for (let t in data.mats) {
        let info = getMaterialInfoText(t);
        inputs.innerHTML += `<div class="material"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>💥 ${t}</span>${info}</div><input id="munition_${t}" type="number" placeholder="Vorhanden..." oninput="checkMunitionCraft()"></div>`;
    }
    checkMunitionCraft();
}
function checkMunitionCraft() {
    let item = document.getElementById("munitionSelect").value; let amount = parseInt(document.getElementById("munitionAmount").value) || 1;
    let data = munitionRezepte[item]; let result = document.getElementById("munitionResult"); let startBtn = document.getElementById("munitionStartBtn");
    
    if (!data) { 
        result.innerText = "Bitte Magazin wählen"; result.style.color = "white"; startBtn.style.display = "none"; 
        document.getElementById("munitionStats").style.display = "none";
        return; 
    }

    updateCraftStats(data.mats, amount, "munitionStats");

    let fehlend = [];
    for (let t in data.mats) {
        let need = data.mats[t] * amount; let have = parseInt(document.getElementById("munition_" + t)?.value) || 0;
        if (have < need) fehlend.push(`${t} (${need - have})`);
    }
    if (fehlend.length === 0) { result.innerText = "✅ Materialien bereit!"; result.style.color = "#77dd77"; startBtn.style.display = "block"; } 
    else { result.innerText = "❌ Fehlt: " + fehlend.join(", "); result.style.color = "#cccccc"; startBtn.style.display = "none"; }
}
function createMunitionCraft() {
    let item = document.getElementById("munitionSelect").value; let amount = parseInt(document.getElementById("munitionAmount").value) || 1;
    let data = munitionRezepte[item]; let durationMs = data.time * amount * 1000; let craftName = item + (amount > 1 ? " x"+amount : "");
    db.collection("crafts").add({ name: craftName, startedBy: currentUser, endTime: Date.now() + durationMs, totalDuration: durationMs, paused: false, remainingTime: 0 })
    .then(() => { addLog("Munitions-Fabrik gestartet", craftName); });
    openRoute('timerTab');
}

function checkGeldwaesche() {
    let amount = parseInt(document.getElementById("schwarzgeldAmount").value) || 0;
    let hours = parseInt(document.getElementById("geldwaescheHours").value) || 1;
    let result = document.getElementById("geldwaescheResult");
    let startBtn = document.getElementById("geldwaescheStartBtn");

    if (amount <= 0) {
        result.innerText = "Bitte Betrag eingeben.";
        result.style.color = "white";
        startBtn.style.display = "none";
        return;
    }

    let lossMap = { 1: 60, 2: 50, 3: 40, 4: 30, 5: 20, 6: 10 };
    let lossPercent = lossMap[hours];
    let keepPercent = 100 - lossPercent;
    let cleanMoney = Math.floor(amount * (keepPercent / 100));

    result.innerHTML = `Erwartetes Grüngeld: <span style="color:#77dd77; font-size:1.2em;">${cleanMoney.toLocaleString('de-DE')} €</span> (Dauer: ${hours} Std)`;
    startBtn.style.display = "block";
}

function createGeldwaesche() {
    let amount = parseInt(document.getElementById("schwarzgeldAmount").value) || 0;
    let hours = parseInt(document.getElementById("geldwaescheHours").value) || 1;
    
    let lossMap = { 1: 60, 2: 50, 3: 40, 4: 30, 5: 20, 6: 10 };
    let cleanMoney = Math.floor(amount * ((100 - lossMap[hours]) / 100));
    
    let durationMs = hours * 3600 * 1000; 
    let craftName = `Geldwäsche (${amount.toLocaleString('de-DE')} € ➔ ${cleanMoney.toLocaleString('de-DE')} €)`;

    db.collection("crafts").add({
        name: craftName,
        startedBy: currentUser,
        endTime: Date.now() + durationMs,
        totalDuration: durationMs,
        paused: false,
        remainingTime: 0 
    }).then(() => {
        addLog("Geldwäsche gestartet", `Wäscht ${amount.toLocaleString('de-DE')} € für ${hours} Stunde(n)`); 
    });

    openRoute('timerTab');
}

function togglePause(id) {
    let c = crafts.find(x => x.id === id); if(!c) return;
    
    if (c.startedBy !== currentUser && !isUserAdmin) {
        alert("Zugriff verweigert: Du kannst nur deine eigenen Prozesse pausieren.");
        return;
    }
    
    if (c.paused) {
        db.collection("crafts").doc(id).update({
            paused: false,
            endTime: Date.now() + c.remainingTime
        }).then(() => addLog("Produktion fortgesetzt", c.name)); 
    } else {
        let leftMs = c.endTime - Date.now();
        db.collection("crafts").doc(id).update({
            paused: true,
            remainingTime: leftMs
        }).then(() => addLog("Produktion pausiert", c.name)); 
    }
}

function cancelCraft(id) {
    let c = crafts.find(x => x.id === id); if(!c) return;
    
    if (c.startedBy !== currentUser && !isUserAdmin) {
        alert("Zugriff verweigert: Du kannst nur deine eigenen Prozesse abbrechen.");
        return;
    }
    
    if(confirm("Möchtest du diesen Vorgang wirklich abbrechen?")) {
        db.collection("crafts").doc(id).delete().then(() => {
            if(c) addLog("Produktion abgebrochen", c.name); 
        });
    }
}

function tick() {
    let now = Date.now();
    crafts.forEach(c => {
        if (!c.paused && now >= c.endTime) {
            let sound = document.getElementById("sound");
            if(sound) sound.play().catch(e => console.log("Sound geblockt"));
            
            if (c.startedBy === currentUser) {
                db.collection("crafts").doc(c.id).delete();
            }
        }
    });
    render(); 
}

function render() {
    let list = document.getElementById("craftList"); 
    if (!list) return;
    
    list.innerHTML = ""; 
    let now = Date.now();
    
    let userFilter = document.getElementById("filterUser").value;
    let routeFilter = document.getElementById("filterRoute").value;
    
    if(crafts.length === 0) { 
        list.innerHTML = "<p style='color:#aaa; text-align:center; padding: 20px;'>Aktuell laufen keine Produktionen.</p>"; 
        return; 
    }
    
    let displayCrafts = [...crafts].sort((a, b) => {
        let aTime = a.paused ? (now + a.remainingTime) : a.endTime;
        let bTime = b.paused ? (now + b.remainingTime) : b.endTime;
        return aTime - bTime;
    });

    if (userFilter === "me") {
        displayCrafts = displayCrafts.filter(c => c.startedBy === currentUser);
    }

    if (routeFilter !== "all") {
        displayCrafts = displayCrafts.filter(c => {
            return c.name.toLowerCase().includes(routeFilter.toLowerCase());
        });
    }

    if(displayCrafts.length === 0) {
        list.innerHTML = "<p style='color:#aaa; text-align:center; padding: 20px;'>Keine Produktionen für diese Filter gefunden.</p>";
        return;
    }

    displayCrafts.forEach(c => {
        let remainingMs = c.paused ? c.remainingTime : (c.endTime - now);
        let remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
        let percent = Math.min(100, Math.max(0, 100 - (remainingMs / c.totalDuration * 100)));
        
        let startedByText = c.startedBy ? `<div class="craft-user">👤 Gestartet von: ${c.startedBy}</div>` : "";
        let statusClass = c.paused ? "paused" : "";
        let barColor = c.paused ? "background: #ffcc00;" : "";
        
        let controlsHtml = "";
        if (c.startedBy === currentUser || isUserAdmin) {
            let pauseBtn = c.paused 
                ? `<button class="btn-icon btn-resume" onclick="togglePause('${c.id}')" title="Fortsetzen">▶ Fortsetzen</button>` 
                : `<button class="btn-icon btn-pause" onclick="togglePause('${c.id}')" title="Pausieren">⏸ Pausieren</button>`;

            controlsHtml = `
            <div class="craft-controls">
                ${pauseBtn}
                <button class="btn-icon btn-cancel" onclick="cancelCraft('${c.id}')" title="Abbrechen">✖ Abbrechen</button>
            </div>`;
        }

        list.innerHTML += `
        <div class="craftItem ${statusClass}">
            <div class="craft-header">
                <div>
                    <div class="craft-title">${c.name}</div>
                    ${startedByText}
                </div>
                <div class="craft-time">⏳ ${format(remainingSec)}</div>
            </div>
            <div class="progressBar">
                <div class="progress" style="width:${percent}%; ${barColor}"></div>
            </div>
            ${controlsHtml}
        </div>`;
    });
}

function format(s) {
    let h = Math.floor(s / 3600); let m = Math.floor((s % 3600) / 60); let sec = s % 60;
    return (h > 0 ? h + "h " : "") + m + "m " + sec + "s";
}

setInterval(tick, 1000);

let oreInput = document.getElementById("oreInput");
if(oreInput) oreInput.addEventListener("input", (e) => { document.getElementById("metalOutput").innerText = "Ertrag: " + Math.floor((parseInt(e.target.value) || 0) / 2) + " Metall"; });
let metalInput = document.getElementById("metalInput");
if(metalInput) metalInput.addEventListener("input", (e) => { document.getElementById("frameOutput").innerText = "Ertrag: " + Math.floor((parseInt(e.target.value) || 0) / 7) + " Rahmen"; });

const shopItems = [
    { name: "Messer", cat: "Nahkampfwaffen", price: "12.375 €", icon: "🔪" },
    { name: "Baseballschläger", cat: "Nahkampfwaffen", price: "13.200 €", icon: "🏏" },
    { name: "Brechstange", cat: "Nahkampfwaffen", price: "14.025 €", icon: "🔧" },
    { name: "Axt", cat: "Nahkampfwaffen", price: "16.500 €", icon: "🪓" },
    { name: "Golfschläger", cat: "Nahkampfwaffen", price: "20.625 €", icon: "🏒" },
    { name: "Kampfaxt", cat: "Nahkampfwaffen", price: "23.100 €", icon: "🪓" },
    { name: "Machete", cat: "Nahkampfwaffen", price: "33.000 €", icon: "🗡️" },
    { name: "Springmesser", cat: "Nahkampfwaffen", price: "41.250 €", icon: "🔪" },
    { name: "Zielfernrohr", cat: "Komponenten", price: "8.250 €", icon: "🔭" },
    { name: "Griff", cat: "Komponenten", price: "8.250 €", icon: "🗜️" },
    { name: "Lampe", cat: "Komponenten", price: "8.250 €", icon: "🔦" },
    { name: "Erweitertes Magazin", cat: "Komponenten", price: "8.250 €", icon: "🔋" },
    { name: "Schalldämpfer", cat: "Komponenten", price: "8.250 €", icon: "🔇" },
    { name: "Farbeimer", cat: "Komponenten", price: "41.250 €", icon: "🪣" },
    { name: "Autodietrich", cat: "Schwarzmarkt", price: "825 €", icon: "🗝️" },
    { name: "Dietrich", cat: "Schwarzmarkt", price: "825 €", icon: "🗝️" },
    { name: "Folterstuhl", cat: "Schwarzmarkt", price: "165.000 €", icon: "🪑" }
];

function renderShop() {
    const grid = document.getElementById("shopGrid");
    if (!grid) return;
    grid.innerHTML = "";

    shopItems.forEach(item => {
        grid.innerHTML += `
        <div class="shop-card">
            <div class="shop-top">
                <div class="shop-limit">📦 999x</div>
                <div class="shop-price">${item.price}</div>
            </div>
            <div class="shop-mid">${item.icon}</div>
            <div class="shop-bottom">
                <div class="shop-text">
                    <div class="shop-name">${item.name}</div>
                    <div class="shop-cat">${item.cat}</div>
                </div>
                <div class="shop-buy" onclick="alert('${item.name} gekauft! (Funktion folgt)')" title="Kaufen">
                    🛒
                </div>
            </div>
        </div>`;
    });
}
renderShop();

let currentSelectedMarkerIndex = null;

db.collection("markers").onSnapshot((querySnapshot) => {
    mapMarkers = [];
    querySnapshot.forEach((doc) => {
        mapMarkers.push({
            id: doc.id,         
            x: doc.data().x,
            y: doc.data().y,
            name: doc.data().name,
            fotoUrl: doc.data().fotoUrl || "" 
        });
    });
    
    mapMarkers.sort((a, b) => a.name.localeCompare(b.name));
    renderMapMarkers();
});

function renderMapMarkers() {
    const area = document.getElementById("markersArea");
    const legend = document.getElementById("legendList");
    if(!area || !legend) return;
    
    area.innerHTML = "";
    legend.innerHTML = "";
    
    if (mapMarkers.length === 0) {
        legend.innerHTML = "<p style='color:#aaa; font-size: 0.9em; text-align: center; margin-top: 20px;'>Noch keine Punkte gesetzt.</p>";
    }

    mapMarkers.forEach((m, index) => {
        area.innerHTML += `
        <div class="marker" style="left: ${m.x}%; top: ${m.y}%;" onclick="openMarkerModal(event, ${index})" title="${m.name}">
            <div class="marker-label">${m.name}</div>
        </div>`;
        
        legend.innerHTML += `
        <div class="legend-item" onclick="focusMarker(${index})">
            📍 ${m.name}
        </div>`;
    });
}

function addMapMarker(e) {
    if(!isUserAdmin) return;

    if(e.target.classList.contains('marker') || e.target.classList.contains('marker-label')) return;

    const mapImg = document.getElementById("gtaMapImage");
    const rect = mapImg.getBoundingClientRect();

    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;

    if (x < 0 || x > 100 || y < 0 || y > 100) return;

    let routeName = prompt("GPS NAME (z.B. Waffen Fabrik A):");
    if(!routeName || routeName.trim() === "") return;

    let routeFotoUrl = prompt("GPS FOTO-URL (Imgur, Discord-Link etc.) - Optional:");
    
    db.collection("markers").add({
        x: x,
        y: y,
        name: routeName.trim(),
        fotoUrl: routeFotoUrl ? routeFotoUrl.trim() : "" 
    }).then(() => {
        addLog("GPS Punkt erstellt", routeName.trim()); 
    }).catch((error) => console.error("Fehler beim Speichern in Firebase:", error));
}

function focusMarker(index) {
    const m = mapMarkers[index];
    const wrapper = document.getElementById("mapWrapperScroll");
    const mapImg = document.getElementById("gtaMapImage");
    
    const scrollX = (m.x / 100 * mapImg.clientWidth) - (wrapper.clientWidth / 2);
    const scrollY = (m.y / 100 * mapImg.clientHeight) - (wrapper.clientHeight / 2);
    
    wrapper.scrollTo({ left: scrollX, top: scrollY, behavior: 'smooth' });
    openMarkerModal({ stopPropagation: () => {} }, index);
}

function openMarkerModal(e, index) {
    if(e && e.stopPropagation) e.stopPropagation();
    currentSelectedMarkerIndex = index;
    const marker = mapMarkers[index];
    
    document.getElementById("modalMarkerName").innerText = marker.name;
    
    const foto = document.getElementById("miniMapZoomFoto");
    const missingText = document.getElementById("miniMapMissingText");
    
    if(marker.fotoUrl && marker.fotoUrl !== "") {
        foto.src = marker.fotoUrl;
        foto.style.display = "block";
        missingText.style.display = "none";
    } else {
        foto.src = ""; 
        foto.style.display = "none";
        missingText.style.display = "block";
    }
    
    document.getElementById("markerModal").style.display = "flex";
}

function closeMarkerModal() {
    document.getElementById("markerModal").style.display = "none";
    currentSelectedMarkerIndex = null;
}

function editCurrentMarker() {
    if(currentSelectedMarkerIndex !== null && isUserAdmin) {
        const m = mapMarkers[currentSelectedMarkerIndex];
        
        let newName = prompt("Neuer GPS Name:", m.name);
        if(newName === null || newName.trim() === "") return; 
        
        let newFotoUrl = prompt("Neue GPS FOTO-URL (leer lassen für keins):", m.fotoUrl || "");
        if(newFotoUrl === null) return;
        
        db.collection("markers").doc(m.id).update({
            name: newName.trim(),
            fotoUrl: newFotoUrl.trim()
        }).then(() => {
            addLog("GPS Punkt bearbeitet", `Von '${m.name}' zu '${newName.trim()}'`); 
            closeMarkerModal(); 
        }).catch((error) => console.error("Fehler beim Bearbeiten:", error));
    }
}

function deleteCurrentMarker() {
    if(currentSelectedMarkerIndex !== null && isUserAdmin) {
        const markerName = mapMarkers[currentSelectedMarkerIndex].name;
        if(confirm("Möchtest du diesen GPS-Punkt wirklich entfernen?")) {
            const markerId = mapMarkers[currentSelectedMarkerIndex].id;
            db.collection("markers").doc(markerId).delete()
            .then(() => { 
                addLog("GPS Punkt gelöscht", markerName); 
                closeMarkerModal(); 
            })
            .catch((error) => console.error("Fehler beim Löschen:", error));
        }
    }
}

function clearAllMarkers() {
    if(mapMarkers.length === 0) return;
    if(confirm("Sollen WIRKLICH ALLE GPS-Marker gelöscht werden?")) {
        mapMarkers.forEach(m => {
            db.collection("markers").doc(m.id).delete();
        });
        addLog("Alle GPS Punkte gelöscht", "Gesamte Karte geleert"); 
    }
}

let isUserLeader = false;
let checklistData = {};
let factionRoster = [];

async function initChecklist() {
    if(!isUserLeader) return;

    try {
        const res = await fetch('/api/faction-members');
        if(res.ok) {
            factionRoster = await res.json();
        } else {
            console.error("Konnte Mitgliederliste nicht laden. BOT_TOKEN in der .env geprüft?");
        }
    } catch (error) {
        console.error("Fehler beim Fetch:", error);
    }

    db.collection("checklist").onSnapshot((snapshot) => {
        checklistData = {};
        snapshot.forEach(doc => {
            checklistData[doc.id] = doc.data().tasks || [];
        });
        renderChecklist();
    });
}

function renderChecklist() {
    const container = document.getElementById("checklistContent");
    if(!container) return;
    container.innerHTML = "";

    if (factionRoster.length === 0) {
        container.innerHTML = "<p style='color:#ff6b6b; padding: 20px; background: rgba(0,0,0,0.5); border-radius: 10px;'>❌ <b>Fehler:</b> Es konnten keine Fraktionsmitglieder geladen werden. Bitte prüfe, ob der Bot auf dem Server ist und der <b>BOT_TOKEN</b> in Render eingetragen wurde.</p>";
        return;
    }

    factionRoster.forEach((member) => {
        let tasks = checklistData[member.id] || [];
        
        let tasksHtml = tasks.map((t, i) => `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 5px; border: 1px solid #3e3e5e;">
                <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleChecklistTask('${member.id}', ${i})" style="width: 18px; height: 18px; cursor: pointer;">
                <span style="flex-grow: 1; font-size: 1.05em; ${t.done ? "text-decoration: line-through; color: #77dd77;" : "color: #fff;"}">${t.text}</span>
                <button onclick="deleteChecklistTask('${member.id}', ${i})" style="background: transparent; border: none; color: #ff6b6b; cursor: pointer; font-size: 1.2em; transition: 0.2s;">✖</button>
            </div>
        `).join("");

        container.innerHTML += `
        <div style="margin-bottom: 20px; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 10px; border-left: 4px solid #ffffff;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3e3e5e; padding-bottom: 5px; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #ffffff;">👤 ${member.name}</h3>
                <span style="background: #dddddd; color: #000000; padding: 3px 8px; border-radius: 5px; font-size: 0.8em; font-weight: bold;">${member.rankName}</span>
            </div>
            <div id="tasks_${member.id}" style="margin-bottom: 10px;">
                ${tasksHtml.length > 0 ? tasksHtml : "<p style='color:#666; font-size:0.9em; margin: 0;'>Keine Einträge für dieses Mitglied.</p>"}
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <input type="text" id="newTask_${member.id}" placeholder="Neuen Eintrag für ${member.name} hinzufügen..." style="flex-grow: 1; padding: 10px; border-radius: 5px; border: 1px solid #3e3e5e; background: #121212; color: #fff;">
                <button onclick="addChecklistTask('${member.id}')" style="background: #77dd77; border: none; padding: 10px 20px; border-radius: 5px; color: #000; font-weight: bold; cursor: pointer;">Hinzufügen</button>
            </div>
        </div>
        `;
    });
}

function addChecklistTask(memberId) {
    const input = document.getElementById(`newTask_${memberId}`);
    const text = input.value.trim();
    if(!text) return;

    let tasks = checklistData[memberId] || [];
    tasks.push({ text: text, done: false });

    db.collection("checklist").doc(memberId).set({ tasks: tasks })
        .then(() => { input.value = ""; });
}

function toggleChecklistTask(memberId, taskIndex) {
    let tasks = checklistData[memberId] || [];
    if(tasks[taskIndex]) {
        tasks[taskIndex].done = !tasks[taskIndex].done;
        db.collection("checklist").doc(memberId).set({ tasks: tasks });
    }
}

function deleteChecklistTask(memberId, taskIndex) {
    let tasks = checklistData[memberId] || [];
    if(tasks[taskIndex]) {
        tasks.splice(taskIndex, 1);
        db.collection("checklist").doc(memberId).set({ tasks: tasks });
    }
}

fetch('/api/user')
    .then(response => response.json())
    .then(data => {
        if(data.username) {
            currentUser = data.username; 
            
            document.getElementById('userNameDisplay').innerText = data.username;
            document.getElementById('userProfile').style.display = "flex";
            
            if(data.isAdmin) {
                isUserAdmin = true; 
                document.getElementById('deleteAllBtn').style.display = "block";
                document.getElementById('deleteSingleBtn').style.display = "block";
                document.getElementById('editSingleBtn').style.display = "block"; 
                document.getElementById('logBtn').style.display = "inline-block"; 
            }

            if(data.isLeader) {
                isUserLeader = true;
                document.getElementById('checklistBtn').style.display = "inline-block";
                initChecklist(); 
            }
            
            updateOnlineStatus();

            // Wenn der User Admin oder Leader ist, starte den Aufräum-Prozess nach 3 Sekunden
            if (isUserAdmin || isUserLeader) {
                setTimeout(autoCleanupDatabase, 3000); 
            }
        }
    })
    .catch(error => console.log("Fehler beim Laden des Users:", error));