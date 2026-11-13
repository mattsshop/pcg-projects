// Firebase backend (Auth + Firestore + Storage), loaded from the official CDN.
import { firebaseConfig } from './config.js?v=0.6.2';

const V = '10.12.2';
const base = `https://www.gstatic.com/firebasejs/${V}`;

export async function createBackend({ withAuth = true } = {}) {
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);

  let au = null, auth = null, st = null, storage = null;
  if (withAuth) {
    au = await import(`${base}/firebase-auth.js`);
    auth = au.getAuth(app);
    st = await import(`${base}/firebase-storage.js`);
    storage = st.getStorage(app);
  }

  const ref = (p) => fs.doc(db, p);
  const col = (p) => fs.collection(db, p);

  return {
    demo: false,

    // ---- data ----
    async get(path) {
      const s = await fs.getDoc(ref(path));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    },
    async list(path) {
      const s = await fs.getDocs(col(path));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async set(path, data, merge = true) {
      await fs.setDoc(ref(path), data, { merge });
    },
    async add(path, data) {
      const r = await fs.addDoc(col(path), data);
      return r.id;
    },
    async remove(path) {
      await fs.deleteDoc(ref(path));
    },
    newId(path) {
      return fs.doc(col(path)).id;
    },

    // ---- files ----
    async upload(path, file) {
      const r = st.ref(storage, path);
      await st.uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
      const url = await st.getDownloadURL(r);
      return { url, path };
    },
    async deleteFile(path) {
      if (!path) return;
      try { await st.deleteObject(st.ref(storage, path)); } catch (e) { /* already gone */ }
    },

    // ---- auth ----
    onAuth(cb) {
      return au.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null));
    },
    async signIn(email, pw) { await au.signInWithEmailAndPassword(auth, email, pw); },
    async signUp(email, pw, name) {
      const c = await au.createUserWithEmailAndPassword(auth, email, pw);
      if (name) await au.updateProfile(c.user, { displayName: name });
    },
    async signInGoogle() { await au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
    async resetPassword(email) { await au.sendPasswordResetEmail(auth, email); },
    async signOut() { await au.signOut(auth); }
  };
}
