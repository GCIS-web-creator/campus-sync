import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDocumentOutputSize,
  makeDefaultDocumentCorners,
  orderDocumentCorners,
} from '../lib/document-scanner.ts';

test('orders a perspective quadrilateral into consistent page corners',()=>{
  const points=[{x:480,y:520},{x:120,y:500},{x:450,y:80},{x:160,y:65}];
  assert.deepEqual(orderDocumentCorners(points),[{x:160,y:65},{x:450,y:80},{x:480,y:520},{x:120,y:500}]);
});
test('rejects incomplete or non-finite corner sets',()=>{
  assert.equal(orderDocumentCorners([{x:0,y:0},{x:10,y:10},{x:2,y:8}]),null);
  assert.equal(orderDocumentCorners([{x:0,y:0},{x:Number.NaN,y:2},{x:5,y:5},{x:2,y:5}]),null);
});
test('estimates output proportions and respects the maximum dimension',()=>{
  const size=getDocumentOutputSize([{x:100,y:80},{x:500,y:100},{x:520,y:700},{x:80,y:680}]);
  assert.ok(size);
  assert.ok(size.width>size.height*0.6);
  assert.ok(size.height>size.width);
  assert.ok(Math.max(size.width,size.height)<=2200);
  assert.deepEqual(getDocumentOutputSize([{x:0,y:0},{x:4000,y:0},{x:4000,y:6000},{x:0,y:6000}],1200),{width:800,height:1200});
});
test('provides a safe manual guide when automatic detection fails',()=>{
  assert.deepEqual(makeDefaultDocumentCorners(1000,1600),[{x:60,y:96},{x:940,y:96},{x:940,y:1504},{x:60,y:1504}]);
});
