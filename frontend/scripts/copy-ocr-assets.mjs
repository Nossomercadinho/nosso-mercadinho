import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve every OCR asset locally, including the Portuguese language model.
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Keep one calculation source; generate a frontend-local module so each Vercel
// service resolves decimal.js from its own independently installed dependencies.
const generated = path.join(root,'src/generated');
fs.mkdirSync(generated,{recursive:true});
fs.copyFileSync(path.join(root,'../backend/src/domain/custo-real.ts'),path.join(generated,'custo-real.ts'));
const target = path.join(root,'public/ocr');
fs.mkdirSync(target,{recursive:true});
const tess = path.dirname(require.resolve('tesseract.js/package.json'));
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
const language = path.dirname(require.resolve('@tesseract.js-data/por/package.json'));
fs.copyFileSync(path.join(tess,'dist/worker.min.js'),path.join(target,'worker.min.js'));
for (const file of fs.readdirSync(core).filter(f=>/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(f))) {
  fs.copyFileSync(path.join(core,file),path.join(target,file));
}
fs.copyFileSync(path.join(language,'4.0.0/por.traineddata.gz'),path.join(target,'por.traineddata.gz'));
const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));
fs.copyFileSync(path.join(pdfjs,'build/pdf.worker.min.mjs'),path.join(target,'pdf.worker.min.mjs'));
for (const folder of ['cmaps','standard_fonts','wasm']) fs.cpSync(path.join(pdfjs,folder),path.join(target,folder),{recursive:true});
console.log('OCR: worker, WebAssembly e idioma português copiados para public/ocr.');
