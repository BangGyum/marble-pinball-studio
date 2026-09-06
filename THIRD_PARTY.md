# Third-party source

The four built-in maps (`src/data/maps.ts`), map type definitions, and the initial
physics adapter are adapted from [lazygyu/roulette](https://github.com/lazygyu/roulette),
Copyright (c) 2023 LazyGyu, under the MIT license retained in `LICENSE`.

The interface, editor, local storage, recording integration and game control code
were developed for this project. Advertising, notices, tracking, character skins,
and skills from the original application are not included.

`box2d-wasm` is distributed under the Zlib license and includes MIT-licensed Box2D.
Other dependency licenses are included in their respective packages.

Runtime distribution notices are generated in `licenses.html` by `scripts/licenses.cjs`.
The page includes the original MIT license, box2d-wasm Zlib license, Box2D 2.4.1 MIT
license, box2d.js binding attribution and Zlib terms, wasm-feature-detect Apache-2.0
license and Google copyright, and Emscripten runtime licensing notices.

`licenses/Box2D.MIT.txt` is copied from Box2D v2.4.1 LICENSE.
`licenses/Emscripten.txt` is copied from Emscripten 2.0.34 LICENSE (MIT / NCSA).
`licenses/box2d-js.Zlib.txt` combines contributor attribution with Zlib terms;
its upstream license declaration is linked in the file.
The box2d-wasm and wasm-feature-detect texts are read verbatim from the installed package.
Review these notices when upgrading runtime dependencies.

`yarn build` includes the linked license page and copies `LICENSE` and this file
into `dist`. Deploy the entire `dist` directory, retaining these notices.
