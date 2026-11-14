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

test('ranking keeps the nearest quest first when the other scores match', () => {
  const v = planner();
  v.run('p.map=10;p.x=0;p.y=0;q[4].level=12;points={[1]={map=10,x=.1,y=0},[4]={map=10,x=.8,y=0}};point=function(q) return points[q.id] end;rows=AzerothCoach.Planner.Rank({q[4],q[1]},p,point)');
  assert.equal(v.value('rows[1].quest.id'), '1');
  assert.equal(v.value('rows[1].point == points[1]'), 'true');
  v.run('p.x=1;rows=AzerothCoach.Planner.Rank({q[1],q[4]},p,point)');
  assert.equal(v.value('rows[1].quest.id'), '4');
});
test('dungeon windows use medians, skip missing levels and keep completed chain quests in the counts', () => {
  const v = planner();
  v.run(`
    p.level=20;p.completed={[1]=true,[2]=true}
    q={
      [1]={id=1,minLevel=18,level=20,nextQuest=2},[2]={id=2,minLevel=18,level=20},
      [3]={id=3,minLevel=1,level=60},[4]={id=4,minLevel=18,level=20},
      [5]={id=5,minLevel=60,level=80,races=2},[6]={id=6,minLevel=0,level=0}
    }
    plan=AzerothCoach.Planner.Dungeon({q[1],q[2],q[3],q[4],q[5],q[6]},p,get)
  `);
  assert.equal(Number(v.value('plan.minLevel')), 18);
  assert.equal(Number(v.value('plan.maxLevel')), 23);
  assert.equal(v.value('plan.inRange'), 'true');
  assert.equal(v.value('plan.completed'), '2');
  assert.equal(v.value('plan.total'), '5');
  v.run('q[3].minLevel=19;q[3].level=21;plan=AzerothCoach.Planner.Dungeon({q[1],q[3]},p,get)');
  assert.equal(Number(v.value('plan.minLevel')), 18);
  assert.equal(Number(v.value('plan.maxLevel')), 24);
  assert.equal(v.value('AzerothCoach.Planner.Dungeon({q[6]},p,get).inRange'), 'false');
  assert.equal(v.value('AzerothCoach.Planner.Dungeon({},p,get).inRange'), 'false');
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

test('dungeon level window uses whole levels when the median falls between two levels', () => {
  const v = planner();
  v.run(`local quests = {
    {id = 1, minLevel = 17, level = 20}, {id = 2, minLevel = 18, level = 21},
    {id = 3, minLevel = 18, level = 22}, {id = 4, minLevel = 19, level = 23}
  }
  local player = {level = 20, active = {}, completed = {}, completedKnown = true, skills = {}, spells = {}, reputation = {}}
  plan = AzerothCoach.Planner.Dungeon(quests, player, function(id) return quests[id] end)`);
  assert.equal(v.value('plan.minLevel'), '18');
  assert.equal(v.value('plan.maxLevel'), '25');
});
