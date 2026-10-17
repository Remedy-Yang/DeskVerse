import {copyFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.cwd();
const tesseract=join(root,'node_modules','tesseract.js');
const core=join(root,'node_modules','tesseract.js-core');
const output=join(root,'dist','vendor','ocr');
const coreOutput=join(output,'core');
const languageOutput=join(output,'lang');
await mkdir(coreOutput,{recursive:true});
await mkdir(languageOutput,{recursive:true});

for(const file of ['tesseract.esm.min.js','worker.min.js','worker.min.js.LICENSE.txt']){
  await copyFile(join(tesseract,'dist',file),join(output,file));
}
await copyFile(join(tesseract,'dist','worker.min.js'),join(coreOutput,'worker.min.js'));
for(const suffix of ['wasm.js','wasm']){
  const file=`tesseract-core-lstm.${suffix}`;
  await copyFile(join(core,file),join(coreOutput,file));
}
await copyFile(join(tesseract,'LICENSE.md'),join(output,'LICENSE.tesseract.js'));
await copyFile(join(core,'LICENSE'),join(output,'LICENSE.tesseract.js-core'));
await copyFile(join(root,'scripts','ocr','chi_sim.traineddata'),join(languageOutput,'chi_sim.traineddata'));
await copyFile(join(root,'scripts','ocr','LICENSE.tessdata_fast'),join(output,'LICENSE.tessdata_fast'));
console.log('Vendored local Chinese OCR worker, LSTM core, and language data.');
