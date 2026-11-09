# Ryan Keith | Software Engineer

Portfolio site for Ryan Keith, Software Engineer in Kansas City building full-stack, geospatial and AI-powered systems.

Built with React 19, TypeScript and Vite. No UI or animation libraries: the motion (masked text reveals, wipes,
shape layers, counters, marquee, parallax) is plain CSS plus a few small hooks in `src/motion.tsx`.
All motion is disabled for visitors who set "reduce motion".

## Run locally

```bash
npm install
npm run dev      # http://127.0.0.1:5174
npm run build    # type-check + production build to dist/
npm run preview  # serve the build
```

## Editing content

All copy lives in [`src/data.ts`](src/data.ts): profile, contact details, role tracks, projects,
the GeoMind flagship deep-dive and the Q&A.

## Images

Each project has three real photos in `public/images/projects/` (`<id>.webp` cover plus `<id>-2.webp` and `<id>-3.webp`),
shown as a main image with clickable thumbnails. All come from Wikimedia Commons under public-domain, CC0 or
Creative Commons licenses; they were cropped and resized. The full source, author and license for every photo is in
`src/data.ts` (`credit` fields) and is listed on the site under **Photo credits** in the footer.

To use a screenshot of the real app instead, replace the file and update its `alt`, `caption` and `credit` in `src/data.ts`.

## Deploying

`vite.config.ts` uses `base: './'`, so the `dist/` build works from any path, including GitHub Pages at
`https://ryan12keith-eng.github.io/portfolio/`.
