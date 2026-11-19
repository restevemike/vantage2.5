import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("weight and BP OCR have independent screenshot inputs and confirmation controls",async()=>{
 const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
 const ids=["flowWeightOcrInput","flowWeightOcrPreview","flowWeightOcrRun","flowWeightOcrReview","flowWeightOcrConfirm",
            "flowBpOcrInput","flowBpOcrPreview","flowBpOcrRun","flowBpOcrReview","flowBpOcrConfirm","flowOcrAppliedSummary"];
 for(const id of ids)assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/id="flowOcrKind"/);
 assert.doesNotMatch(html,/id="flowOcrInput"/);
});
test("confirmed fields get a green visual marker, but are not silently saved",async()=>{
 const source=await readFile(new URL("../flow-vitals-ocr.js",import.meta.url),"utf8");
 const css=await readFile(new URL("../styles.css",import.meta.url),"utf8");
 assert.match(source,/flow-ocr-confirmed-input/);
 assert.match(source,/flow-ocr-confirmed-tag/);
 assert.match(source,/dispatchEvent\(new Event\("input"/);
 assert.match(source,/Not saved until you tap Save vitals/);
 assert.doesNotMatch(source,/db\.put\(["']vitals/);
 assert.match(css,/\.flow-ocr-confirmed-input/);
});
test("device image recognition tries both original and contrasted sources",async()=>{
 const engine=await readFile(new URL("../ocr-engine.js",import.meta.url),"utf8");
 assert.match(engine,/deviceMode = false/);
 assert.match(engine,/recognize\(blob\)/);
 assert.match(engine,/recognize\(prepared\)/);
});
