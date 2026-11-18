import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVitalsScreenText } from '../flow-vitals-parser.js';

test('weight OCR: labelled kilograms and decimal comma', () => {
 assert.equal(parseVitalsScreenText('Weight 98,45 kg','scales').values.weight,98.45);
});
test('weight OCR: pounds converted explicitly', () => {
 assert.ok(Math.abs(parseVitalsScreenText('WEIGHT 220 lb','scales').values.weight-99.79) < 0.02);
});
test('weight OCR: bare body fat is not a weight', () => {
 assert.equal(parseVitalsScreenText('BODY FAT 19.8 %','scales').values.weight,undefined);
});
test('BP OCR: separate SYS/DIA/PUL values', () => {
 assert.deepEqual(parseVitalsScreenText('SYS 123 DIA 78 PULSE 59','bp').values,{systolic:123,diastolic:78,pulse:59});
});
test('BP OCR: ratio format', () => {
 assert.deepEqual(parseVitalsScreenText('BP 123/76 mmHg','bp').values,{systolic:123,diastolic:76});
});
test('BP OCR: impossible SYS/DIA rejected', () => {
 assert.equal(parseVitalsScreenText('SYS 78 DIA 123','bp').values.systolic,undefined);
});
test('OCR cannot be treated as a saved vitals record', () => {
 const result=parseVitalsScreenText('SYS 121 DIA 79','bp');
 assert.ok(result.warnings.some(message=>message.includes('Confirm')));
 assert.equal(result.values.updatedAt,undefined);
});
