# Evrima Object Dump

Searchable documentation of the classes, structs, fields, and methods in a UE4SS
object dump of The Isle: Evrima server. The site is static and generated from
`UE4SS_ObjectDump.txt`.

## Updating

Replace `UE4SS_ObjectDump.txt` (stored with Git LFS) and set the server version
in `VERSION`. Pushing to `main` rebuilds and deploys the site.

## Building

Requires [Deno](https://deno.com).

    deno task build
    deno task preview

The build parses the dump, bundles the app with Vite, and renders every page to
static HTML in `dist/`.

## Deployment

Pushes to `main` deploy to Vercel (`vercel.json`) and to GitHub Pages as a
backup (`.github/workflows/pages.yml`).

- `SITE_URL`: absolute site URL used for canonical links, sitemaps, and
  `robots.txt`. Vercel sets it automatically. The GitHub Pages backup reads it
  from the `SITE_URL` repository variable, which should be the Vercel URL so the
  backup's canonical links point at the primary site.
- `INDEXNOW_KEY`: optional. When set, the build serves the key file, and
  production builds on Vercel submit the sitemap URLs to IndexNow.

## License

[GPL-3.0-only](COPYING)
