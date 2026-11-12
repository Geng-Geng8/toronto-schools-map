import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_FILTERS,filterSchools,countSchools,toGeoJSON,safeWebsite,directionsUrl} from '../utils.mjs';
const schools=JSON.parse(readFileSync(new URL('../data/schools.json',import.meta.url),'utf8'));
test('original 758 school records and board totals are preserved',()=>{
  const c=countSchools(schools);
  assert.deepEqual(c,{total:758,TDSB:559,TCDSB:199,Elementary:626,Secondary:132});
});
test('all four combinations are correct',()=>{
  assert.equal(filterSchools(schools,{TDSB:true,TCDSB:false,Elementary:true,Secondary:false}).length,460);
  assert.equal(filterSchools(schools,{TDSB:true,TCDSB:false,Elementary:false,Secondary:true}).length,99);
  assert.equal(filterSchools(schools,{TDSB:false,TCDSB:true,Elementary:true,Secondary:false}).length,166);
  assert.equal(filterSchools(schools,{TDSB:false,TCDSB:true,Elementary:false,Secondary:true}).length,33);
});
test('filters AND across dimensions and support no selections',()=>{
  assert.equal(filterSchools(schools,{TDSB:false,TCDSB:false,Elementary:true,Secondary:true}).length,0);
  assert.equal(filterSchools(schools,DEFAULT_FILTERS).length,758);
});
test('search matches names and addresses case-insensitively',()=>{
  const x=filterSchools(schools,DEFAULT_FILTERS,'  ROYAL   YORK ');
  assert.ok(x.length>0);
  assert.ok(x.every(s=>`${s.name} ${s.address}`.toLowerCase().includes('royal york')));
  assert.equal(filterSchools(schools,DEFAULT_FILTERS,'zzzz-no-school-zzzz').length,0);
});
test('unique numeric IDs and valid Toronto-area coordinates',()=>{
  assert.equal(new Set(schools.map(s=>s.id)).size,758);
  const geo=toGeoJSON(schools);
  assert.equal(geo.features.length,758);
  assert.ok(schools.every(s=>s.lat>43.5&&s.lat<44&&s.lng>-80&&s.lng<-79));
});
test('malformed websites are rejected, schemeless hostnames normalized',()=>{
  assert.equal(safeWebsite('javascript:alert(1)'),null);
  assert.equal(safeWebsite('school.example.ca/'),'https://school.example.ca/');
  assert.equal(safeWebsite('https://example.ca/'),'https://example.ca/');
});
test('directions deep links are safely encoded',()=>{
  const u=directionsUrl({name:'A & B',address:'123 Main St, Toronto'});
  assert.ok(u.startsWith('https://www.google.com/maps/dir/?api=1&destination='));
  assert.ok(u.includes('A%20%26%20B'));
});
