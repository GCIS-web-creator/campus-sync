import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNotebookDuplicates, getNotebookRemainingPages, getNotebookRemainingPercent,
  getNotebookStatusLabel, NOTEBOOK_SUBJECT_OPTIONS,
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

test('subject options cover the main Japanese high-school subject areas', () => {
  for (const subject of [
    '現代の国語', '地理総合', '日本史探究', '倫理', '数学I', '数学A',
    '物理基礎', '化学基礎', '地学基礎', '英語コミュニケーションI',
    '論理・表現I', '情報I', '体育', '音楽I', '家庭基礎',
    '総合的な探究の時間', 'その他',
  ]) {
    assert.ok(NOTEBOOK_SUBJECT_OPTIONS.includes(subject), 'missing subject: ' + subject);
  }
  assert.equal(new Set(NOTEBOOK_SUBJECT_OPTIONS).size, NOTEBOOK_SUBJECT_OPTIONS.length);
});
