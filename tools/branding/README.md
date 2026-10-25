# Package branding

CTTIR Material Atlas v3.1, supplied 25 October 2026. The editable R geometry,
colour roles, and bundled Inter fonts reproduce the package identities.
The font licence is in `fonts/OFL.txt`. No rendering dependencies are installed
when this package is installed or loaded.

From the repository root, render a separate review export:

```sh
Rscript tools/branding/render.R /path/to/review
```

To regenerate and replace the registered repository assets:

```sh
Rscript tools/branding/render.R --apply
```

`assets.csv` maps rendered filenames to repository destinations. `packages.csv`
selects the identities. Rendering uses base R, grid, grDevices, utils, tools,
and Cairo; Linux uses the bundled fontconfig. On other systems, install the
bundled Inter fonts first. Font and graphics versions can affect output bytes.
Use the named primary badge at readable sizes and the unnamed symbols for
favicons. Primary, light, grayscale, PDF and symbol variants are retained.

Source archive SHA-256:
`ec5d5d3b6443611792f45e9c0e32db19c50a9446dde63edb71c7458d18003f8d`

## Plugin archives

The render command updates the unpacked plugin icons. The tracked unsigned
plugin and source archives are packaging outputs, not individual render targets.
Refresh them from the repository root after regenerating icons:

```sh
(cd src/argus-one && zip -r ../../argus-one-0.1.0.xpi README.md argus.js bootstrap.js icon.png icon@2x.png locale manifest.json)
(cd src && zip -r ../argus-one-source.zip argus-one)
```

Existing published release downloads are not replaced by this source update.
