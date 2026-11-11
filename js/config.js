// PCG Projects — configuration
// Bump APP_VERSION on every change so you can tell which build is live.
export const APP_VERSION = '0.3.1';

// Paste the config from Firebase console → Project settings → Your apps → Web app.
// While apiKey still says "PASTE_...", the app runs in DEMO MODE
// (sample data, saved only in this browser).
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE.firebaseapp.com',
  projectId: 'PASTE',
  storageBucket: 'PASTE.appspot.com',
  messagingSenderId: '',
  appId: ''
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
