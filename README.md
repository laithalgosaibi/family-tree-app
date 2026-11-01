# family-tree-app

My family tree app. A private family tree that works in the browser on iPhone and Mac.

## How it is built

Plain web files, no build step, so any change is live as soon as it is saved:

- `index.html` the page
- `styles.css` the look (colours are at the top)
- `app.js` the screens
- `store.js` the family data and how it is saved
- `layout.js` works out where each box and line goes on the chart
- `chart.js` draws the chart and handles drag and zoom
- `ui.js` small shared pieces (making elements, the pop-up sheet)
- `backup.js` export and import of `.family` files, and the backup reminder
- `edit.js` fixing mistakes: edit a name, unlink relatives, delete a person
- `undo.js` the Undo message after a delete (and ⌘Z on the Mac for any change)
- `fold.js` collapse and expand branches: which people are folded away on the chart
- `kin.js` works out how two people are related, in words ("your first cousin once removed")
- `find.js` search by name: who matches what is typed, other spellings, and telling apart people with the same name
- `search.js` the search box and its results
- `sw.js` lets the app open without internet

Everything is saved in the browser on the device being used. Nothing is sent anywhere.
To move the tree between devices, or keep a safe copy, use the ··· button: Export a backup, then Import a file on the other device.
The ··· button also has Undo last change. Undo remembers the last 30 changes while the app is open.
Tap anyone to see how they are related to you, which side of the family they are on, and every step between you.
Search by name with the magnifying glass on a phone, or the box at the top left on a Mac (⌘F). Other spellings match too, so Yusuf finds Yousef. When two people share a name, both sets of parents are shown so you can tell them apart.
The small − under anyone with children folds away everyone below them. Tap +N to open it again, or Expand all at the top.

## Try it on a computer

From this folder run `python3 -m http.server` and open http://localhost:8000

## Build order

1. Add people and links (done)
2. Chart with zoom, drag and centring on me (done)
3. Export and import a file, plus backup reminder (done)
4. Fix mistakes: edit, delete, change links, undo (done)
5. Collapse and expand branches (done)
6. Relationship to me in words (done)
7. Search by name (done)
8. Relationship finder for any two people
9. Separate branches and linking them later
