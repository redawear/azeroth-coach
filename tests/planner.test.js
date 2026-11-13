'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { vm } = require('./lua');
function planner() {
  const v = vm(['Planner.lua', 'Triggers.lua']);
  v.run('p={level=12,raceBit=1,classBit=1,active={},completed={},completedKnown=true,skills={},spells={},reputation={}}; q={[1]={id=1,minLevel=10,level=12},[2]={id=2,all={1},level=14},[3]={id=3,any={2,4}},[4]={id=4}}; get=function(id) return q[id] end');
  return v;
}
test('chains order AND prerequisites, backtrack OR branches, skip completed steps and detect cycles', () => {
  const v = planner();
  assert.equal(v.value('#AzerothCoach.Planner.Chain(2,p,get)'), '2');
  v.run('q[1].all={2}; chain=AzerothCoach.Planner.Chain(3,p,get)');
  assert.equal(v.value('chain[1].id'), '4');
  assert.equal(v.value('AzerothCoach.Planner.Chain(2,p,get)'), 'nil');
  v.run('q[1].all=nil; p.completed[1]=true');
  assert.equal(v.value('#AzerothCoach.Planner.Chain(2,p,get)'), '1');
});
test('availability handles unknown completion, masks, active prerequisites and restrictions', () => {
  const v = planner();
  assert.equal(v.value('AzerothCoach.Planner.Available(q[1],p)'), 'true');
  v.run('p.completedKnown=false');
  assert.equal(v.value('AzerothCoach.Planner.Available(q[1],p)'), 'false');
  v.run('p.completedKnown=true; q[1].all={-4}');
  assert.equal(v.value('AzerothCoach.Planner.Available(q[1],p)'), 'false');
  v.run('p.active[4]={}');
  assert.equal(v.value('AzerothCoach.Planner.Available(q[1],p)'), 'true');
  for (const field of ['races=2', 'classes=2', 'maxLevel=11', 'minLevel=13', 'spell=55', 'skill={55,50}', 'minRep={55,100}']) {
    v.run(`x={id=99,${field}}`); assert.equal(v.value('AzerothCoach.Planner.Available(x,p)'), 'false', field);
  }
  assert.equal(v.value('AzerothCoach.Planner.HasBit(2^94,2^94)'), 'true');
});
test('ranking avoids the starter of an unfinished quest and prioritizes turn-ins', () => {
  const v = planner();
  v.run('p.map=10;p.x=0;p.y=0;p.active[1]={complete=false}; rows=AzerothCoach.Planner.Rank({q[1]},p,function() return {map=10,x=0,y=0} end)');
  assert.equal(v.value('#rows'), '0');
  v.run('p.active[1].complete=true; rows=AzerothCoach.Planner.Rank({q[1]},p,function() return {map=10,x=0,y=0} end)');
  assert.equal(v.value('rows[1].turnIn'), 'true');
});
test('trigger priority, pause, dedup, permanent gray suppression, death window and hide rules', () => {
  const v = planner();
  v.run('saved={seen={}};settings={tipPause=600}; tips={{kind="zone",key="z"},{kind="dungeon",key="d"}}');
  assert.equal(v.value('AzerothCoach.Triggers.Choose(tips,saved,1000,settings).key'), 'd');
  v.run('saved.seen.d=1000'); assert.equal(v.value('AzerothCoach.Triggers.Choose(tips,saved,1001,settings).key'), 'z');
  v.run('saved.pauseUntil=2000'); assert.equal(v.value('AzerothCoach.Triggers.Choose(tips,saved,1001,settings)'), 'nil');
  v.run('saved={seen={g=1}}'); assert.equal(v.value('AzerothCoach.Triggers.Choose({{kind="gray",key="g"}},saved,100000,settings)'), 'nil');
  for (const flag of ['combat', 'cinematic', 'editMode', 'trackerCollapsed']) assert.equal(v.value(`AzerothCoach.Triggers.Hidden({}, {${flag}=true}, {}, 1)`), 'true');
  for (const flag of ['instance', 'dead', 'taxi']) assert.equal(v.value(`AzerothCoach.Triggers.Hidden({${flag}=true}, {}, {}, 1)`), 'true');
  assert.equal(v.value('AzerothCoach.Triggers.Death(saved,1,0)'), 'false');
  assert.equal(v.value('AzerothCoach.Triggers.Death(saved,1,1)'), 'false');
  assert.equal(v.value('AzerothCoach.Triggers.Death(saved,1,2)'), 'true');
  assert.equal(v.value('AzerothCoach.Triggers.Death(saved,1,700)'), 'false');
});
