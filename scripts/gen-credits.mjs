// Generates public/credits.html from the photo credits in src/data.ts.
// Runs before every build (see "prebuild" in package.json).
import { build } from 'esbuild'
import { writeFileSync } from 'node:fs'

const out = await build({ entryPoints: ['src/data.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' })
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const { projects, photosFor, profile } = mod

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rows = projects
  .flatMap((p) =>
    photosFor(p).map(
      (ph) => `      <li>
        <img src="${esc(ph.src)}" alt="" width="120" height="75" loading="lazy" />
        <div><b>${esc(p.name)}</b> · ${esc(ph.caption)}<br />
        <a href="${esc(ph.credit.source)}">Source</a> by ${esc(ph.credit.author)}, ${
          ph.credit.licenseUrl ? `<a href="${esc(ph.credit.licenseUrl)}">${esc(ph.credit.license)}</a>` : esc(ph.credit.license)
        }</div>
      </li>`,
    ),
  )
  .join('\n')

writeFileSync(
  'public/credits.html',
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>Image credits | ${esc(profile.name)}</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <style>
    body { margin: 0; font: 15px/1.6 Inter, 'Segoe UI', system-ui, sans-serif; color: #0b0d17; background: #fff; }
    main { max-width: 860px; margin: 0 auto; padding: 48px 16px; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    p { color: #565d75; margin: 0 0 24px; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    li { display: flex; gap: 14px; align-items: center; }
    img { border-radius: 8px; object-fit: cover; flex: none; }
    a { color: #2f5bff; }
  </style>
</head>
<body>
  <main>
    <p><a href="./">← Back to portfolio</a></p>
    <h1>Image credits</h1>
    <p>All photos are from Wikimedia Commons. They were cropped and resized for this site.</p>
    <ul>
${rows}
    </ul>
  </main>
</body>
</html>
`,
)
console.log('wrote public/credits.html')
