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
const REBIRTH_COST = 100;
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
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ uid, clicks, rebirths, pending: dirty })); }
  catch { /* Cloud saving remains available if browser storage is blocked. */ }
}
function updateUI() {
  counter.textContent = clicks.toLocaleString();
  rebirthCounter.textContent = rebirths.toLocaleString();
  progressBar.style.width = `${Math.min(clicks / REBIRTH_COST * 100, 100)}%`;
  progressText.textContent = `${clicks.toLocaleString()} / ${REBIRTH_COST} sandwiches`;
  rebirthButton.style.display = clicks >= REBIRTH_COST ? "block" : "none";
  statusMessage.textContent = clicks >= REBIRTH_COST ? "You are ready to rebirth!"
    : `You need ${REBIRTH_COST - clicks} more sandwiches to unlock rebirth.`;
}
function changed() { revision++; dirty = true; backup(); updateUI(); }
sandwichButton.disabled = true;
rebirthButton.disabled = true;
sandwichButton.addEventListener("click", () => {
  if (!validCount(clicks + rebirths + 1)) return;
  clicks += rebirths + 1;
  changed();
});
rebirthButton.addEventListener("click", () => {
  if (clicks < REBIRTH_COST || !validCount(rebirths + 1)) return;
  clicks -= REBIRTH_COST;
  rebirths++;
  changed();
  void saveGameData();
});
async function saveGameData() {
  if (!ready || !uid || saving || !dirty) return;
  saving = true;
  const savedRevision = revision;
  const snapshot = { clicks, rebirths, updatedAt: serverTimestamp() };
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
      clicks = local.clicks; rebirths = local.rebirths; dirty = true;
    } else if (remote.exists()) {
      const data = remote.data();
      if (!validCount(data.clicks) || !validCount(data.rebirths)) throw new Error("Invalid cloud save data");
      clicks = data.clicks; rebirths = data.rebirths;
    } else {
      if (local && local.uid === uid && validCount(local.clicks) && validCount(local.rebirths)) {
        clicks = local.clicks; rebirths = local.rebirths;
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
      uid = local.uid; clicks = local.clicks; rebirths = local.rebirths; dirty = !!local.pending;
    }
    updateUI();
    saveStatus.textContent = "Cloud unavailable. Progress is backed up locally. Reload to reconnect.";
    console.error("Firebase connection failed:", error);
  } finally {
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
