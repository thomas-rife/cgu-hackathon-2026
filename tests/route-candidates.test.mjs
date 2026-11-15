import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function loadURL(name){
  if(cache.has(name))return cache.get(name);
  const source=readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
  let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code=code.replace(/from "\.\/([^\"]+)"/g,(_,dependency)=>`from "${loadURL(dependency)}"`).replace(/from "(@turf\/[^\"]+)"/g,(_,dependency)=>`from "${import.meta.resolve(dependency)}"`);
  const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;
}
const {rankCandidates,recommendedCandidates,routesAreDistinct,dominates,mergeNearDuplicates,balanceScore}=await import(loadURL('route-candidates'));
const {candidateSummary,dacMiles}=await import(loadURL('candidate-display'));
function route(y,minutes,miles,dac=10,known=true){return {geometry:{paths:[[[-118,34],[-117.9,34+y],[-117.8,34]]],spatialReference:{wkid:4326}},minutes,miles,stops:[],freeways:[],communityImpact:{avgDieselPct:known?80:null,maxDieselPct:90,highDieselMi:10,dacMi:dac,residentsAlongRoute:1000,residentsInDac:500}};}
test('ranks actual time, DAC miles, and emissions independently',()=>{
  const result=rankCandidates([{route:route(0,60,20,12),source:'fastest'},{route:route(.05,70,15,10),source:'shortest'},{route:route(-.05,80,25,2),source:'corridor'}]);
  assert.equal(result.length,3);assert.deepEqual(result[0].tags,['Fastest']);assert.ok(result[1].tags.includes('Lowest emissions'));assert.ok(result[2].tags.includes('Lowest community burden'));
});
test('removes near-duplicate geometries even when their metrics differ',()=>{
  const a=route(0,60,20),b=route(.00001,80,21);assert.equal(routesAreDistinct(a,b),false);assert.equal(rankCandidates([{route:a,source:'fastest'},{route:b,source:'shortest'}]).length,1);
  assert.equal(routesAreDistinct(a,route(.05,70,20)),true);
});
test('unknown community coverage never wins the lowest-burden recommendation',()=>{
  const result=rankCandidates([{route:route(0,60,20,0,false),source:'fastest'},{route:route(.05,70,21,10),source:'corridor'}]);assert.ok(!result[0].tags.includes('Lowest community burden'));assert.ok(result[1].tags.includes('Lowest community burden'));
});
test('tags tied best choices, retains all, and merges identical metrics by default',()=>{
  const result=rankCandidates(Array.from({length:6},(_,i)=>({route:route(i*.05,60,20,10),source:'corridor'})));assert.equal(result.length,6);assert.equal(recommendedCandidates(result).length,1);assert.ok(result.every(c=>c.tags.includes('Fastest')&&c.tags.includes('Lowest emissions')&&c.tags.includes('Lowest community burden')));
});
test('map pills use reference-relative minutes and the same DAC miles as tags',()=>{
  const baseline=route(0,60,20);const option=route(.1,67,20,6);assert.equal(dacMiles(option),6);assert.equal(candidateSummary(option,baseline),'+7 min · 6.0 mi DAC');assert.match(candidateSummary(route(.1,55,20,0,false),baseline),/−5 min · DAC —/);
});

const {decisionImpact,impactValue,impactColor,isNoChange}=await import(loadURL('decision-impact'));
const {dailyTripTotals}=await import(loadURL('saved-trips'));
const {layoutRouteLabels,labelsOverlap,segmentHitsLabel}=await import(loadURL('map-route-labels'));
test('Pareto filtering keeps genuine middle grounds and exposes dominated routes in the full set',()=>{
  const all=rankCandidates([
    {route:route(0,60,20,14),source:'fastest'},
    {route:route(.05,68,21,7),source:'corridor'},
    {route:route(.1,80,22,2),source:'corridor'},
    {route:route(.15,90,25,8),source:'corridor'},
    {route:route(.2,100,18,9),source:'shortest'},
  ]);
  assert.equal(all.length,5);
  assert.deepEqual(recommendedCandidates(all).map(c=>c.name),['Route A','Route B','Route C','Route E']);
  assert.deepEqual(all[1].tags,['Balanced']);
  assert.equal(all[3].dominated,true);
  assert.equal(dominates(all[1].route,all[3].route),true);
  assert.equal(dominates(all[0].route,all[1].route),false);
});
test('missing DAC data is incomparable and cap preserves the three individual minima',()=>{
  assert.equal(dominates(route(0,60,20,0,false),route(.05,90,25,10)),false);
  assert.equal(dominates(route(0,60,20,1),route(.05,90,25,0,false)),false);
  const all=rankCandidates(Array.from({length:6},(_,i)=>({route:route(i*.05,60+i*10,20+i,i===5?0:12-i),source:'corridor'})));
  const visible=recommendedCandidates(all);
  assert.equal(visible.length,3);assert.ok(visible.includes(all[0]));assert.ok(visible.includes(all[5]));
  assert.ok(visible.some(c=>c.tags.includes('Balanced')));
  assert.ok(visible.every(c=>c.tags.length>0));
});
test('decision trade-offs and daily driving totals use chosen routes, not schedule differences',()=>{
  const base=route(0,60,60,30),chosen=route(.1,67,66,16);
  const impact=decisionImpact(base,chosen,4.55);
  assert.ok(Math.abs(impact.fuel-4.55)<1e-9);assert.equal(impact.minutes,7);assert.equal(impact.dacMi,-14);assert.ok(Math.abs(impact.co2Kg-10.18)<1e-9);
  assert.equal(decisionImpact(base,route(.1,67,66,0,false),null).dacMi,null);
  const trip={route:chosen,draft:{dieselPrice:'4.55'}};
  assert.equal(dailyTripTotals([trip,trip]).minutes,134);
  assert.equal(dailyTripTotals([trip]).dacMi,16);
  assert.equal(dailyTripTotals([]).minutes,0);
});
test('offset map pills avoid route strokes and one another in a narrow map corridor',()=>{
  const paths=Array.from({length:4},(_,i)=>[{x:310+i*8,y:130},{x:360+i*8,y:650}]);
  const labels=layoutRouteLabels(paths.map((path,i)=>({id:String(i),anchors:[{x:335+i*8,y:390,distinctness:1}]})),paths,{left:100,right:650,top:100,bottom:700});
  assert.equal(labels.length,4);
  for(const [i,label] of labels.entries()){
    assert.ok(!paths.some(path=>segmentHitsLabel(path[0],path[1],label)),'label must be clear of routes');
    for(const other of labels.slice(i+1))assert.equal(labelsOverlap(label,other),false);
    assert.ok(Math.hypot(label.x-label.anchorX,label.y-label.anchorY)>50);
  }
});
test('show-all packing fits six compact labels without covering a shared corridor',()=>{
  const paths=Array.from({length:6},(_,i)=>[{x:420,y:520+i},{x:700,y:380+i}]);
  const labels=layoutRouteLabels(paths.map((path,i)=>({id:String(i),anchors:[{x:560,y:450+i,distinctness:1}]})),paths,{left:380,right:790,top:180,bottom:750});
  assert.equal(labels.length,6);
  for(const [i,label] of labels.entries()){
    assert.ok(!paths.some(path=>segmentHitsLabel(path[0],path[1],label)),'all six labels should clear the shared corridor');
    for(const other of labels.slice(i+1))assert.equal(labelsOverlap(label,other),false);
  }
});

const {comparisonReference}=await import(loadURL('comparison-reference'));
test('explicit departure and arrival constraints compare against actual fastest',()=>{
  const original=route(0,60,60,30);
  const all=rankCandidates([{route:route(.05,70,55,24),source:'fastest'},{route:route(.1,90,50,18),source:'shortest'}]);
  for(const conditions of [{departureMinutes:480},{arrivalMinutes:1020},{departureMinutes:480,weather:'clear',disruptions:[]}]){
    const reference=comparisonReference(original,[...all].reverse(),conditions);
    assert.equal(reference.label,'Fastest');assert.equal(reference.route,all[0].route);assert.equal(reference.originalOverlay,null);assert.equal(reference.canKeepOriginal,false);
    assert.equal(candidateSummary(all[0].route,reference.route),'No change · 24.0 mi DAC');
  }
  assert.equal(comparisonReference(null,[],{}).route,null);
});
test('road events and rain compare to original plan; full closure forbids keeping it',()=>{
  const original=route(0,60,60,30);
  for(const conditions of [{disruptions:[{kind:'lane',freeway:'I-10'}]},{disruptions:[{kind:'crash',freeway:'I-10'}]},{weather:'rain'}]){
    const reference=comparisonReference(original,[],conditions);
    assert.equal(reference.label,'Original plan');assert.equal(reference.route,original);assert.equal(reference.originalOverlay,original);assert.equal(reference.canKeepOriginal,true);
  }
  assert.equal(comparisonReference(original,[],{disruptions:[{kind:'closure',freeway:'I-710'}]}).canKeepOriginal,false);
});
test('noise thresholds are neutral and leave absolute totals and significant deltas intact',()=>{
  for(const [unit,threshold] of [['$',.5],['mi',.5],['kg',1],['min',1],['pct',.5]]){
    for(const sign of [-1,1]){
      const small=sign*(threshold-.001);
      assert.equal(isNoChange(small,unit),true);assert.equal(impactValue(small,unit),'No change');assert.equal(impactColor(small,unit),'text-slate-600');
      assert.equal(isNoChange(sign*threshold,unit),false);assert.notEqual(impactValue(sign*threshold,unit),'No change');assert.equal(impactColor(sign*threshold,unit),sign<0?'text-emerald-700':'text-red-700');
    }
  }
  assert.equal(impactValue(.2,'mi',false),'0.2 mi');assert.equal(impactValue(.01,'$',false),'$0.01');assert.equal(impactValue(null,'$'),'—');assert.equal(impactValue(NaN,'mi'),'—');
});
test('a higher DAC percentage cannot contradict a miles-based burden tag or Pareto filtering',()=>{
  const a=route(0,60,60,28.2),d=route(.05,89,50,24);
  const all=rankCandidates([{route:a,source:'fastest'},{route:d,source:'shortest'}]);
  assert.ok(all[1].tags.includes('Lowest community burden'));assert.equal(all[1].dominated,false);
  assert.match(candidateSummary(d,a),/24.0 mi DAC/);
  const dominated=rankCandidates([{route:a,source:'fastest'},{route:route(.1,89,62.7,30.1),source:'corridor'}]);
  assert.equal(dominated[1].dominated,true);assert.equal(recommendedCandidates(dominated).length,1);
});

const {DEFAULT_SIMULATION,simulationRequest}=await import(loadURL('simulation'));
const {CANDIDATE_COLORS,candidateColor}=await import(loadURL('candidate-display'));
const {parseSavedTrips,sortedDayTrips}=await import(loadURL('saved-trips'));
test('zero initial disruptions and reset omit time and candidates; untimed closures stay free-flow',()=>{
  assert.deepEqual(DEFAULT_SIMULATION.disruptions,[]);assert.deepEqual(simulationRequest(DEFAULT_SIMULATION),{});
  assert.deepEqual(simulationRequest({disruptions:[{id:'closure',type:'closure',freeway:'I-710'}]}),{disruptions:[{kind:'closure',freeway:'I-710'}]});
  assert.deepEqual(simulationRequest({disruptions:[{id:'time',type:'departure',minutes:480}]}),{departureMinutes:480});
  const original=route(0,60,60,30),reference=comparisonReference(original,[],{});
  assert.equal(reference.route,original);assert.equal(reference.label,'Original plan');assert.equal(reference.originalOverlay,null);assert.equal(reference.canKeepOriginal,true);
});
test('metric near-duplicates merge after Pareto filtering and remain in Show all',()=>{
  const all=rankCandidates([{route:route(0,60,60,30),source:'fastest'},{route:route(.05,61.5,59,29.2),source:'corridor'},{route:route(.1,80,55,10),source:'shortest'}]);
  assert.equal(all.length,3);assert.ok(all.every(c=>!c.dominated));assert.deepEqual(recommendedCandidates(all).map(c=>c.name),['Route A','Route C']);
  const make=(minutes,dac)=>({id:String(minutes),name:'Route A',route:route(.1,minutes,60,dac),tags:[],source:'corridor'});
  assert.equal(mergeNearDuplicates([make(62,29),make(60,30)]).length,1);
  assert.equal(mergeNearDuplicates([make(62.01,29),make(60,30)]).length,2);
  assert.equal(mergeNearDuplicates([make(61,28.99),make(60,30)]).length,2);
});
test('only the minimum normalized time plus DAC score earns Balanced',()=>{
  const all=rankCandidates([
    {route:route(0,60,60,30),source:'fastest'},
    {route:route(.05,68,62,25),source:'corridor'},
    {route:route(.1,80,58,8),source:'corridor'},
    {route:route(.15,100,55,5),source:'shortest'},
  ]);
  assert.equal(all.filter(c=>c.tags.includes('Balanced')).length,1);assert.ok(all[2].tags.includes('Balanced'));assert.ok(!all[1].tags.includes('Balanced'));
  assert.ok(balanceScore(all[2],all)<balanceScore(all[1],all));assert.equal(balanceScore(all[0],[all[0]]),0);
  const minima=rankCandidates([{route:route(0,60,50,30),source:'fastest'},{route:route(.05,80,60,10),source:'corridor'}]);assert.equal(minima.filter(c=>c.tags.includes('Balanced')).length,0);
});
test('Balanced requires sitting between the fastest and lowest-DAC routes on both time and DAC miles',()=>{
  // One route wins both: the slower, higher-DAC route is not Balanced and is hidden by default.
  const all=rankCandidates([{route:route(0,164,72,37.5),source:'fastest'},{route:route(.05,175,70,48.8),source:'corridor'},{route:route(.1,190,60,50),source:'shortest'}]);
  assert.deepEqual(all[0].tags,['Fastest','Lowest community burden']);assert.deepEqual(all[1].tags,[]);assert.equal(all[1].dominated,false);
  assert.ok(all.every(c=>!c.tags.includes('Balanced')));
  assert.deepEqual(recommendedCandidates(all).map(c=>c.name),['Route A','Route C']);
  // Between on time but not on DAC miles: still not Balanced.
  const outside=rankCandidates([{route:route(0,60,60,30),source:'fastest'},{route:route(.05,70,50,35),source:'corridor'},{route:route(.1,90,65,10),source:'corridor'}]);
  assert.ok(outside.every(c=>!c.tags.includes('Balanced')));
  // Unknown DAC on the fastest route means no range to sit between.
  const unknown=rankCandidates([{route:route(0,60,60,0,false),source:'fastest'},{route:route(.05,70,61,20),source:'corridor'},{route:route(.1,90,62,10),source:'corridor'}]);
  assert.ok(unknown.every(c=>!c.tags.includes('Balanced')));
});
test('route options use only the blue violet teal slate palette, with unique default colors',()=>{
  assert.deepEqual(CANDIDATE_COLORS,['#2563eb','#7c3aed','#0d9488','#334155']);
  const all=rankCandidates(Array.from({length:6},(_,i)=>({route:route(i*.05,60+i*10,30+i,20-i*3),source:'corridor'})));
  const preferred=recommendedCandidates(all);assert.equal(new Set(preferred.map(c=>candidateColor(c))).size,preferred.length);
  assert.ok(all.every(c=>CANDIDATE_COLORS.includes(candidateColor(c))));
});
test('untimed saved plans remain untimed and sort after scheduled trips',()=>{
  const make=(id,time)=>({id,planDate:'2026-11-14',createdAt:'2026-11-14T00:00:00Z',updatedAt:'2026-11-14T00:00:00Z',option:'baseline',route:{...route(0,60,60),stops:[{},{}]},draft:{destination:{},stops:[],settings:DEFAULT_SIMULATION,dieselPrice:'8.10'},departureMinutes:time,arrivalMinutes:time===null?null:time+60,indicators:[]});
  const data=parseSavedTrips(JSON.stringify({version:1,trips:[make('untimed',null),make('timed',480)]}));
  assert.equal(data[0].departureMinutes,null);assert.deepEqual(sortedDayTrips(data,'2026-11-14').map(t=>t.id),['timed','untimed']);
});
