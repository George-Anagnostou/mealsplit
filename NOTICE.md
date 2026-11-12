# Third-party notices

mealsplit's receipt scanner uses these open-source components. They run on your device and are
served from this app's own origin (`/ocr/`). Nothing is fetched from a CDN.

| Component | Version | License | What it is |
| --- | --- | --- | --- |
| [tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | Apache-2.0 | JavaScript API and web worker |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 7.0.0 | Apache-2.0 | The [Tesseract](https://github.com/tesseract-ocr/tesseract) OCR engine compiled to WebAssembly. It statically includes Leptonica (BSD-2-Clause), libpng, libjpeg, libtiff, zlib and others, under their own permissive licenses. |
| [@tesseract.js-data/eng](https://github.com/naptha/tessdata) | 1.0.0 | MIT (the npm wrapper). The data inside is `tessdata_best`, Apache-2.0 | English trained model (`4.0.0_best_int`, LSTM only) |

The license texts for tesseract.js and tesseract.js-core ship with every build, at
`/ocr/licenses/tesseract.js.LICENSE.md` and `/ocr/licenses/tesseract.js-core.LICENSE`.

React and React DOM (MIT) are bundled into the app's JavaScript.

## How the files get here

`build/ocrAssets.ts` copies the worker, the three wasm cores and the language data out of
`node_modules` at build time. It checks each against a pinned SHA-256 and fails the build if one
changes. See the README for the details.
