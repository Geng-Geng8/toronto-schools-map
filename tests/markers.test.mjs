import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKER_STOPS, markerExpression, nearestFeature} from '../utils.mjs';

test('secondary markers stay 35% wider than outlined circles at each zoom stop',()=>{
  for(const stop of MARKER_STOPS) assert.ok(Math.abs(stop.square/(2*(stop.radius+2))-1.35)<.001);
  assert.deepEqual(markerExpression('radius'),['interpolate',['linear'],['zoom'],10,5,13,6,16,8]);
});
const school=(id,x,y)=>({properties:{id},geometry:{coordinates:[x,y]}});
const project=([x,y])=>({x,y});
test('overlapping school targets select the nearest point regardless of layer order',()=>{
  const a=school(1,10,10), b=school(2,20,10);
  assert.equal(nearestFeature([a,b],{x:18,y:10},project),b);
  assert.equal(nearestFeature([b,a],{x:18,y:10},project),b);
  assert.equal(nearestFeature([], {x:0,y:0},project),undefined);
});
test('coincident school targets resolve consistently, including cluster candidates',()=>{
  const a=school(1,10,10), b=school(2,10,10);
  assert.equal(nearestFeature([b,a],{x:10,y:10},project),a);
  const cluster={properties:{cluster_id:3},geometry:{coordinates:[30,30]}};
  assert.equal(nearestFeature([a,cluster],{x:30,y:30},project),cluster);
});
