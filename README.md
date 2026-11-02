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
- `finder.js` the relationship finder: pick any two people and see how they are related
- `branch.js` separate branches: who is not joined to you yet, and likely links worked out from the names
- `link.js` the Link to the tree screen, which joins a separate branch to the tree
- `sw.js` lets the app open without internet

Everything is saved in the browser on the device being used. Nothing is sent anywhere.
To move the tree between devices, or keep a safe copy, use the ··· button: Export a backup, then Import a file on the other device.
The ··· button also has Undo last change. Undo remembers the last 30 changes while the app is open.
When the app opens with nothing saved, it asks you to add yourself first. You can skip that and start with anyone instead. Then the chart shows the whole tree without centring on anyone, and the "your cousin" wording is hidden until you tap someone and choose This is me. Your own card has This isn't me, and anyone else's card has This is me, to change it later.
Tap anyone to see how they are related to you, which side of the family they are on, and every step between you.
Search by name with the magnifying glass on a phone, or the box at the top left on a Mac (⌘F). Other spellings match too, so Yusuf finds Yousef. When two people share a name, both sets of parents are shown so you can tell them apart.
The relationship finder shows how any two people are related, both ways round, with the shared ancestors and every step between them. On a Mac it is the button at the top right (click a box to set To, ⌥-click to set From). On a phone it is in the ··· menu.
A family you know but can't place yet can be started from the ··· menu: Start a separate branch. It sits beside your tree in a dashed frame. Tap anyone in it to see a possible link from the names (Salma's father's name is Hasan and she is an Azar, so Hasan Ali Azar may be her father), or Link another way. One link joins the whole branch.
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
8. Relationship finder for any two people (done)
9. Separate branches and linking them later (done)

Version 1 is complete. Next, from the plan: phone and Mac sync, then read-only family sharing, then relatives adding people.
