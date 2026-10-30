# family-tree-app

My family tree app. A private family tree that works in the browser on iPhone and Mac.

## How it is built

Plain web files, no build step, so any change is live as soon as it is saved:

- `index.html` the page
- `styles.css` the look (colours are at the top)
- `app.js` the screens
- `store.js` the family data and how it is saved
- `sw.js` lets the app open without internet

Everything is saved in the browser on the device being used. Nothing is sent anywhere.

## Try it on a computer

From this folder run `python3 -m http.server` and open http://localhost:8000

## Build order

1. Add people and links (done)
2. Chart with zoom, drag and centring on me
3. Export and import a file, plus backup reminder
4. Fix mistakes: edit, delete, change links, undo
5. Collapse and expand branches
6. Relationship to me in words
7. Search by name
8. Relationship finder for any two people
9. Separate branches and linking them later
