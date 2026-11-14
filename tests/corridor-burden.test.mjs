import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { along, featureCollection, length, lineSliceAlong, lineString, polygon } from '@turf/turf';
import { corridorBurden } from '../lib/corridorBurden.ts';

const props = (Tract, DieselPM_P, CIscoreP, TotPop19 = 100) => ({ Tract, DieselPM_P, CIscoreP, TotPop19, County: 'Los Angeles' });
const rectangle = (x0, x1, properties) => polygon([[[x0,-1],[x1,-1],[x1,1],[x0,1],[x0,-1]]], properties);
const line = lineString([[0,0],[0.02,0]]);

test('percentiles are length weighted; residents count unique tracts, not samples', () => {
  const tracts=featureCollection([rectangle(-0.01,0.01,props(1,20,50,100)),rectangle(0.01,0.03,props(2,80,90,200))]);
  const result=corridorBurden(line,tracts);
  const total=length(line,{units:'miles'});
  assert.ok(Math.abs(result.avgDieselPct-50)<3);
  assert.ok(Math.abs(result.highDieselMi-total/2)<=0.1);
  assert.ok(Math.abs(result.dacMi-total/2)<=0.1);
  assert.equal(result.maxDieselPct,80);
  assert.equal(result.residentsAlongRoute,300);
  assert.equal(result.residentsInDac,200);
  assert.strictEqual(corridorBurden(structuredClone(line),tracts),result);
});
test('negative/null/NaN values are missing while zero is a valid percentile', () => {
  for(const missing of [null,-999,NaN,undefined]) {
    const result=corridorBurden(line,featureCollection([rectangle(-1,1,props(1,missing,99,-1))]));
    assert.equal(result.avgDieselPct,null);assert.equal(result.maxDieselPct,null);
    for(const value of Object.values(result))assert.ok(value===null||Number.isFinite(value));
    assert.equal(result.highDieselMi,0);assert.equal(result.residentsAlongRoute,0);
  }
  const zero=corridorBurden(line,featureCollection([rectangle(-1,1,props(1,0,null,null))]));
  assert.equal(zero.avgDieselPct,0);assert.equal(zero.maxDieselPct,0);assert.equal(zero.dacMi,0);
});
test('short routes count only their remaining length; multipart gaps add no miles', () => {
  const tracts=featureCollection([rectangle(-1,1,props(1,90,90,100))]);
  const short=lineString([[0,0],[0.0001,0]]);
  const result=corridorBurden(short,tracts);
  assert.ok(Math.abs(result.highDieselMi-length(short,{units:'miles'}))<1e-8);
  const multi={type:'MultiLineString',coordinates:[[[0,0],[0.001,0]],[[0.5,0],[0.501,0]]]};
  const separate=corridorBurden(multi,tracts);
  assert.ok(separate.highDieselMi<0.2);assert.equal(separate.residentsAlongRoute,100);
});
test('polygon holes and routes outside coverage do not create false exposure', () => {
  const tract=polygon([[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]],[[-0.5,-0.5],[-0.5,0.5],[0.5,0.5],[0.5,-0.5],[-0.5,-0.5]]],props(1,99,99));
  assert.equal(corridorBurden(line,featureCollection([tract])).avgDieselPct,null);
  assert.equal(corridorBurden(line,featureCollection([rectangle(10,11,props(2,99,99))])).residentsAlongRoute,0);
});
test('prepared data has exactly four counties and five properties, with missing sentinels removed', () => {
  const data=JSON.parse(readFileSync(new URL('../public/ces.geojson',import.meta.url),'utf8'));
  assert.deepEqual([...new Set(data.features.map(f=>f.properties.County))].sort(),['Los Angeles','Orange','Riverside','San Bernardino']);
  assert.equal(data.features.length,3747);assert.ok(statSync(new URL('../public/ces.geojson',import.meta.url)).size<5_000_000);
  for(const f of data.features) {
    assert.deepEqual(Object.keys(f.properties).sort(),['CIscoreP','County','DieselPM_P','TotPop19','Tract']);
    for(const key of ['DieselPM_P','CIscoreP','TotPop19'])assert.ok(f.properties[key]===null||f.properties[key]>=0);
  }
});
test('a 70-mile, densely sampled SoCal line computes in under one second', () => {
  const tracts=JSON.parse(readFileSync(new URL('../public/ces.geojson',import.meta.url),'utf8'));
  // Follow a dense geodesic east from the port; 3,500 vertices stress geometry work.
  const base=lineString([[-118.2167,33.7542],[-117.0,34.1]]);
  const dense=lineString(Array.from({length:3501},(_,i)=>along(base,70*i/3500,{units:'miles'}).geometry.coordinates));
  const route=lineSliceAlong(dense,0,70,{units:'miles'});
  const start=performance.now();const result=corridorBurden(route,tracts);const elapsed=performance.now()-start;
  assert.ok(elapsed<1000,`Computation took ${elapsed.toFixed(1)} ms`);
  assert.ok(result.avgDieselPct!==null && result.avgDieselPct>=0 && result.avgDieselPct<=100);
  console.log(`70-mile burden computation: ${elapsed.toFixed(1)} ms`);
});
