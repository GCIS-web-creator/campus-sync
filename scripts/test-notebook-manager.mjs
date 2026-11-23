import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNotebookDuplicates, getNotebookRemainingPages, getNotebookRemainingPercent,
  getNotebookStatusLabel,
} from '../lib/notebook-manager.ts';

const notebooks = [
  { id:'1', name:'物理課題①', subjects:['物理'], purpose:'課題', status:'in_use', total_pages:60, used_pages:20 },
  { id:'2', name:'生物授業', subjects:['生物'], purpose:'授業', status:'unused', total_pages:40, used_pages:0 },
  { id:'3', name:'物理課題終了', subjects:['物理'], purpose:'課題', status:'finished', total_pages:60, used_pages:60 },
  { id:'4', name:'物理課題②', subjects:['物理'], purpose:'課題', status:'unused', total_pages:60, used_pages:0 },
];

test('remaining page counts and percentages are bounded', () => {
  assert.equal(getNotebookRemainingPages(60,20),40);
  assert.equal(getNotebookRemainingPages(60,80),0);
  assert.equal(getNotebookRemainingPages(60,-3),60);
  assert.equal(getNotebookRemainingPercent(60,15),75);
  assert.equal(getNotebookRemainingPercent(0,0),0);
});
test('duplicate suggestions match subject and purpose, excluding finished and edited notebooks', () => {
  assert.deepEqual(findNotebookDuplicates(notebooks,['物理'],'課題').map(item=>item.id),['1','4']);
  assert.deepEqual(findNotebookDuplicates(notebooks,['物理'],'課題','1').map(item=>item.id),['4']);
  assert.deepEqual(findNotebookDuplicates(notebooks,['生物'],'課題'),[]);
});
test('status labels are localized', () => {
  assert.equal(getNotebookStatusLabel('unused'),'未使用');
  assert.equal(getNotebookStatusLabel('in_use'),'使用中');
  assert.equal(getNotebookStatusLabel('stored'),'保管中');
  assert.equal(getNotebookStatusLabel('finished'),'使用終了');
});
