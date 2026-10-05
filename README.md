# Desmo Scientific

A scientific calculator website. No build step and no dependencies.

```
desmo-calculator/
  index.html      page structure
  css/style.css   all styling; colours and fonts are tokens at the top (:root)
  js/script.js    calculator logic
  fonts/          Barlow and Barlow Condensed (woff2), loaded locally
  favicon.svg     browser tab icon
```

## Run it

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

then visit http://localhost:8000

## Put it online

Upload the whole folder to any static host (Netlify, GitHub Pages, Vercel, Cloudflare Pages).
`index.html` must stay at the top level, next to the `css`, `js` and `fonts` folders.

## Change the look

Edit the variables in the `:root` block at the top of `css/style.css`
(`--accent` for the red, `--shell` for the body, `--font-main` for the type),
and the heading text in `index.html`.
