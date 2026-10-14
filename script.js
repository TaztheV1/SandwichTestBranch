// Anonymous Firebase accounts provide a persistent browser identity without a login screen.
    const firebaseConfig = {
      apiKey: "AIzaSyCsdsIdq3mCkvGcNaikUmyHnAD7nGjQdUE",
      authDomain: "sandwichclicker.firebaseapp.com",
      projectId: "sandwichclicker",
      storageBucket: "sandwichclicker.firebasestorage.app",
      messagingSenderId: "227365631893",
      appId: "1:227365631893:web:9920e730b45a3d95bb689c",
      measurementId: "G-MLMRT4S5WQ"
    };
const SAVE_INTERVAL_MS = 60_000;
const MAX_LEVEL = 100;
const upgradeConfig = {
  power: { base: 25, growth: 1.65, max: MAX_LEVEL },
  auto: { base: 100, growth: 1.75, max: MAX_LEVEL },
  luck: { base: 250, growth: 1.85, max: 48 }
};
let upgrades = { power: 0, auto: 0, luck: 0 };
let playing = false;
const upgradeRows = [...document.querySelectorAll(".personal .upgrade")];
const upgradeKeys = ["power", "auto", "luck"];
function costAt(base, growth, level) {
  const value = Math.ceil(base * growth ** level);
  return Number.isSafeInteger(value) ? value : Infinity;
}
const rebirthCost = () => costAt(100, 2, rebirths);
const clickPower = () => (upgrades.power + 1) * (rebirths + 1);
const luckChance = () => .01 + upgrades.luck * .005;
const upgradeCost = key => costAt(upgradeConfig[key].base, upgradeConfig[key].growth, upgrades[key]);
function restoreUpgrades(data) {
  const saved = data.upgrades || {};
  for (const key of upgradeKeys) {
    upgrades[key] = Number.isInteger(saved[key]) && saved[key] >= 0
      ? Math.min(saved[key], upgradeConfig[key].max) : 0;
  }
}
function earn(amount) {
  clicks = Math.min(Number.MAX_SAFE_INTEGER, clicks + amount);
  changed();
}
const BACKUP_KEY = "sandwichClickerBackupV1";
const counter = document.getElementById("counter");
const rebirthCounter = document.getElementById("rebirthCount");
const sandwichButton = document.getElementById("sandwichButton");
const rebirthButton = document.getElementById("rebirthButton");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const statusMessage = document.getElementById("statusMessage");
const saveStatus = document.getElementById("saveStatus");
let clicks = 0, rebirths = 0, revision = 0;
let uid = null, ready = false, saving = false, dirty = false;
let db, doc, setDoc, serverTimestamp;
const validCount = value => Number.isSafeInteger(value) && value >= 0;
function readBackup() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY)); } catch { return null; }
}
function backup() {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ uid, clicks, rebirths, upgrades, pending: dirty })); }
  catch { /* Cloud saving remains available if browser storage is blocked. */ }
}
function updateUI() {
  counter.textContent = clicks.toLocaleString();
  rebirthCounter.textContent = rebirths.toLocaleString();
  const requirement = rebirthCost();
  const available = Number.isFinite(requirement);
  progressBar.style.width = `${available ? Math.min(clicks / requirement * 100, 100) : 0}%`;
  progressText.textContent = available ? `${clicks.toLocaleString()} / ${requirement.toLocaleString()} sandwiches` : "Maximum rebirth progression reached";
  rebirthButton.style.display = available && clicks >= requirement ? "block" : "none";
  statusMessage.textContent = !available ? "Maximum rebirth progression reached."
    : clicks >= requirement ? "You are ready to rebirth!"
    : `You need ${(requirement - clicks).toLocaleString()} more sandwiches to unlock rebirth.`;
  document.getElementById("rebirthDescription").textContent = available
    ? `Spend ${requirement.toLocaleString()} sandwiches to rebirth. Your multiplier becomes ×${rebirths + 2}. Sandwiches and all personal upgrades reset.`
    : "You have reached the maximum supported rebirth cost.";
  upgradeRows.forEach((row, index) => {
    const key = upgradeKeys[index], level = upgrades[key];
    const capped = level >= upgradeConfig[key].max || !Number.isFinite(upgradeCost(key));
    row.querySelector(".upgrade-level").textContent = `Level ${level}`;
    const description = key === "power" ? `${clickPower().toLocaleString()} sandwiches per click. +${rebirths + 1} per level.`
      : key === "auto" ? `${(upgrades.auto * clickPower()).toLocaleString()} sandwiches/sec. +1 automatic click/sec per level.`
      : `${(luckChance()*100).toFixed(1)}% chance for a 10× golden manual click. +0.5% per level.`;
    row.querySelector(".upgrade-copy p").textContent = description;
    const button = row.querySelector(".buy");
    button.querySelector("span").textContent = capped ? "MAX" : upgradeCost(key).toLocaleString();
    button.disabled = !playing || capped || clicks < upgradeCost(key);
    button.setAttribute("aria-label", capped ? `${key}: maximum level` : `Buy ${row.querySelector("h3").textContent} for ${upgradeCost(key).toLocaleString()} sandwiches`);
  });
}
function changed() { revision++; dirty = true; backup(); updateUI(); }
sandwichButton.disabled = true;
rebirthButton.disabled = true;
sandwichButton.addEventListener("click", () => {
  if (!playing) return;
  const golden = Math.random() < luckChance();
  earn(clickPower() * (golden ? 10 : 1));
  if (golden) {
    sandwichButton.classList.remove("golden-click");
    void sandwichButton.offsetWidth;
    sandwichButton.classList.add("golden-click");
  }
});
rebirthButton.addEventListener("click", () => {
  if (!playing || clicks < rebirthCost()) return;
  clicks = 0;
  upgrades = { power: 0, auto: 0, luck: 0 };
  autoRemainder = 0;
  rebirths++;
  changed();
  void saveGameData();
});
upgradeRows.forEach((row, index) => {
  row.querySelector(".buy").addEventListener("click", () => {
    const key = upgradeKeys[index], price = upgradeCost(key);
    if (!playing || upgrades[key] >= upgradeConfig[key].max || !Number.isFinite(price) || clicks < price) return;
    clicks -= price;
    upgrades[key]++;
    changed();
    void saveGameData();
  });
});
// Active elapsed time only; no catch-up income after hidden tabs or closing the game.
let lastTick = performance.now(), autoRemainder = 0;
setInterval(() => {
  const now = performance.now(), elapsed = Math.min((now - lastTick) / 1000, 1);
  lastTick = now;
  if (!playing || document.visibilityState === "hidden") return;
  autoRemainder += elapsed * upgrades.auto * clickPower();
  const amount = Math.floor(autoRemainder);
  if (amount > 0) { autoRemainder -= amount; earn(amount); }
}, 250);
async function saveGameData() {
  if (!ready || !uid || saving || !dirty) return;
  saving = true;
  const savedRevision = revision;
  const snapshot = { clicks, rebirths, upgrades: { ...upgrades }, updatedAt: serverTimestamp() };
  saveStatus.textContent = "Saving…";
  try {
    await setDoc(doc(db, "users", uid), snapshot, { merge: true });
    if (revision === savedRevision) dirty = false;
    backup();
    saveStatus.textContent = dirty ? "New progress will save automatically." : "Cloud saved.";
  } catch (error) {
    saveStatus.textContent = "Cloud save failed. Local backup kept; retrying every minute.";
    console.error("Cloud save failed:", error);
  } finally { saving = false; }
}
async function initialise() {
  try {
    const [appSDK, authSDK, firestoreSDK] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js")
    ]);
    const app = appSDK.initializeApp(firebaseConfig);
    const auth = authSDK.getAuth(app);
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    await auth.authStateReady();
    const user = auth.currentUser || (await authSDK.signInAnonymously(auth)).user;
    uid = user.uid;
    db = firestoreSDK.getFirestore(app);
    ({ doc, setDoc, serverTimestamp } = firestoreSDK);
    // Do not write until the existing cloud document has been read successfully.
    const remote = await firestoreSDK.getDocFromServer(doc(db, "users", uid));
    const local = readBackup();
    if (local && local.uid === uid && local.pending && validCount(local.clicks) && validCount(local.rebirths)) {
      clicks = local.clicks; rebirths = local.rebirths; restoreUpgrades(local); dirty = true;
    } else if (remote.exists()) {
      const data = remote.data();
      if (!validCount(data.clicks) || !validCount(data.rebirths)) throw new Error("Invalid cloud save data");
      clicks = data.clicks; rebirths = data.rebirths; restoreUpgrades(data);
    } else {
      if (local && local.uid === uid && validCount(local.clicks) && validCount(local.rebirths)) {
        clicks = local.clicks; rebirths = local.rebirths; restoreUpgrades(local);
      } else {
        // Import the original local-only game's progress for a new cloud account.
        try {
          const oldClicks = Number(localStorage.getItem("sandwichCount"));
          const oldRebirths = Number(localStorage.getItem("sandwichRebirths"));
          clicks = validCount(oldClicks) ? oldClicks : 0;
          rebirths = validCount(oldRebirths) ? oldRebirths : 0;
        } catch { /* Start a new save if old browser data is unavailable. */ }
      }
      dirty = true;
    }
    ready = true;
    backup(); updateUI();
    saveStatus.textContent = "Cloud connected. Autosave every minute.";
    if (dirty) void saveGameData();
  } catch (error) {
    const local = readBackup();
    if (local && (!uid || local.uid === uid) && validCount(local.clicks) && validCount(local.rebirths)) {
      uid = local.uid; clicks = local.clicks; rebirths = local.rebirths; restoreUpgrades(local); dirty = !!local.pending;
    }
    updateUI();
    saveStatus.textContent = "Cloud unavailable. Progress is backed up locally. Reload to reconnect.";
    console.error("Firebase connection failed:", error);
  } finally {
    playing = true;
    updateUI();
    sandwichButton.disabled = false;
    rebirthButton.disabled = false;
  }
}
setInterval(() => { void saveGameData(); }, SAVE_INTERVAL_MS);
window.addEventListener("online", () => { void saveGameData(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { backup(); void saveGameData(); }
});
window.addEventListener("pagehide", backup);
updateUI();
void initialise();
