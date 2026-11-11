# PCG Projects

Perimeter Construction Group's app for running hotel projects during construction.
Hosted on GitHub Pages, backed by Firebase (Auth + Firestore + Storage).

**Current version: v0.3.0** (shown in the footer of every page)

## Module 1 — Rooms & QR codes

- **Room Types** – King, Double Queen, ADA King, Suite… Attach the typical-room sheets once
  (Room Layout, Electrical, Blocking, Millwork, FF&E, Other). Every room of that type shows them.
- **Rooms** – room number, floor, type, hand (as drawn / mirrored), notes, plus sheets for
  unique rooms. Bulk-add by pasting `number, type, M` lines.
- **QR labels** – each room gets a random code. Scanning opens `r.html?t=CODE`:
  - anyone can scan, no sign-in, and sees **only that room**, read-only;
  - "Issue new QR code" on a room turns its old label off.
  - Print page lays labels 2 across × 5 down, sized for Avery 5163/8163 (2"×4").
- **Floor Layouts** – full floor plan per level; drop color-coded pins (FF&E, Electrical,
  Blocking, Millwork, Plumbing, Mechanical, Access Panel, Other) with notes and a photo.
- **Users** – email/password or Google sign-in; new accounts wait for admin approval.

## Plan packages

Drawings are **not** stored in this (public) repo. Claude prepares a *plan package* (.zip with
`manifest.json` + cropped sheet images) from the drawing set; load it from **Projects → New from plan
package**, or a project's **Settings → Import plan package**. Re-importing an updated package updates
floors/types by name and rooms by number, and keeps each room's QR code, hand and notes.

## Demo mode

Until `js/config.js` has a real Firebase config, the app runs in demo mode with sample data
saved only in your browser (IndexedDB, so imported plan packages fit). "Sign out" in demo mode resets the demo data.

## Firebase setup (one time)

1. **Create the project** at <https://console.firebase.google.com> → Add project (e.g. `pcg-projects`).
   Upgrade to the **Blaze** plan (link your Google billing account) — Storage needs it.
2. **Add a web app**: Project settings → General → Your apps → `</>` Web.
   Copy the `firebaseConfig` values into `js/config.js`.
3. **Authentication** → Get started → Sign-in method → enable **Email/Password** and **Google**.
   Then Settings → Authorized domains → add `mattsshop.github.io`.
4. **Firestore Database** → Create database (production mode, region `us-east1` or nearest).
   Rules tab → paste `firestore.rules` → Publish.
5. **Storage** → Get started. Rules tab → paste `storage.rules` → Publish.
   (If it asks, allow Storage rules to read Firestore — needed to check approval.)
6. **Make yourself admin**: open the site, create your account (you'll see "Waiting for approval").
   In Firestore → `users` → your document → set `approved` = `true` and `role` = `"admin"`.
   Reload — you now see the **Users** link to approve everyone else.

## GitHub Pages

Settings → Pages → Deploy from branch → `main` / root. Site: `https://mattsshop.github.io/pcg-projects/`

## Data layout

```
users/{uid}                         name, email, approved, role
projects/{pid}                      name, code
projects/{pid}/floors/{fid}         name, order (level #), plan {url, path}
projects/{pid}/floors/{fid}/pins/*  x, y (0–1 on the plan), label, category, room, note, photo
projects/{pid}/types/{tid}          name, sheets [{tab, label, url, path}]
projects/{pid}/rooms/{rid}          number, floorId, typeId, mirrored, notes, token, sheets[]
scans/{token}                       public copy of one room for the QR scan page
```

## Versions

- **0.3.0** – Admins can delete a project (Settings → Delete project, type the name to confirm). Removes rooms, scan pages (QR labels stop working), types, floors, pins and uploaded files. Updated `firestore.rules`: only admins can delete the project record.

- **0.2.1** – Re-import replaces room notes that came from an earlier package; notes you typed are kept.

- **0.2.0** – Plan package import (zip or folder); Bathroom tab; each room shows its own spot on the
  floor plan first; room number tags on floor layouts (click to open the room); demo mode stores
  drawings in IndexedDB; zip reader bundled (js/vendor/jszip.min.js, MIT).
- **0.1.0** – First build: projects, room types, rooms, bulk add, room sheets, QR scan page,
  QR label printing, floor layouts with pins, user approval, demo mode.
