// PCG Projects — configuration
// Bump APP_VERSION on every change so you can tell which build is live.
export const APP_VERSION = '0.6.1';

// Paste the config from Firebase console → Project settings → Your apps → Web app.
// (Web app config values are public by design — the security rules protect the data.)
// Set apiKey back to 'PASTE_API_KEY' to run in DEMO MODE.
export const firebaseConfig = {
  apiKey: 'AIzaSyBSqgnFIF3bPR6P5B3yfWpbOox4Rl1vnHA',
  authDomain: 'pcg-projects.firebaseapp.com',
  projectId: 'pcg-projects',
  storageBucket: 'pcg-projects.firebasestorage.app',
  messagingSenderId: '739298357320',
  appId: '1:739298357320:web:40af18682ced241ea3e87d'
};

export const DEMO = String(firebaseConfig.apiKey).startsWith('PASTE');

// Sheet tabs shown on a room's scan page, in display order.
export const TABS = [
  { key: 'layout', label: 'Room Layout' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'blocking', label: 'Blocking' },
  { key: 'millwork', label: 'Millwork' },
  { key: 'bath', label: 'Bathroom' },
  { key: 'ffe', label: 'FF&E' },
  { key: 'other', label: 'Other' }
];

// Categories for pins placed on floor layouts.
export const PIN_CATEGORIES = ['FF&E', 'Electrical', 'Blocking', 'Millwork', 'Plumbing', 'Mechanical', 'Access Panel', 'Other'];
