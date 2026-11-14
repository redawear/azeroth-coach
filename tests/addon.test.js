'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vm } = require('./lua');
const { lua, jobsFromStrip } = require('../companion/protocol');
const { parseContext } = require('../companion/prompts');
function addon(missing = false, before = '') {
  const v = vm(); v.run(fs.readFileSync(path.join(__dirname, 'game.lua'), 'utf8'));
  if (missing) v.run('LibQuestieDB = nil');
  if (before) v.run(before);
  const files = fs.readFileSync(path.join(__dirname, '../addon/AzerothCoach/AzerothCoach.toc'), 'utf8').split(/\r?\n/).filter(x => x.endsWith('.lua'));
  files.forEach(v.load); v.run('STUB.Event("PLAYER_LOGIN")'); return v;
}
function dungeonAddon() {
  return addon(false, `
    UnitLevel=function() return 20 end
    C_Map.GetBestMapForUnit=function() return 1436 end
    C_Map.GetMapInfo=function(id)
      local maps={
        [1415]={name="Eastern Kingdoms",mapType=2},[1414]={name="Kalimdor",mapType=2},
        [1436]={name="Westfall",mapType=3,parentMapID=1415},
        [1442]={name="Stonetalon Mountains",mapType=3,parentMapID=1414},
        [1416]={name="Alterac Mountains",mapType=3,parentMapID=1415}
      }
      return maps[id]
    end
    fixtureQuests={
      [301]={name="A First Errand",zoneOrSort=1581,requiredLevel=18,questLevel=20},
      [302]={name="A Second Errand",zoneOrSort=10029,requiredLevel=18,questLevel=20},
      [303]={name="A Third Errand",zoneOrSort=1581,requiredLevel=18,questLevel=20},
      [304]={name="An Outlier Errand",zoneOrSort=1581,requiredLevel=1,questLevel=60},
      [305]={name="A Tram Errand",zoneOrSort=2257,requiredLevel=18,questLevel=20},
      [306]={name="A Battle Errand",zoneOrSort=3277,requiredLevel=18,questLevel=20},
      [307]={name="A Raid Errand",zoneOrSort=2717,requiredLevel=18,questLevel=20},
      [308]={name="A City Errand",zoneOrSort=16544,requiredLevel=18,questLevel=20}
    }
    LibQuestieDB.Quest.GetAllIds=function() return {301,302,303,304,305,306,307,308} end
    LibQuestieDB.Quest.Get=function(id,key) return fixtureQuests[id] and fixtureQuests[id][key] end
    fixtureZones={private={
      areaIdToUiMapId={[40]=1436,[36]=1416,[406]=1442,[10029]=291},uiMapIdToAreaId={[1436]=40,[1442]=406},
      dungeons={
        [1581]={"The Deadmines",{10029},406,{{40,42,72},{406,50,50}}},
        [2257]={"Deeprun Tram",nil,40,{{40,50,50}}},
        [3277]={"Warsong Gulch",nil,40,{{40,50,50}}},
        [2717]={"Molten Core",nil,40,{{40,50,50}}},
        [16544]={"City of Dalaran",nil,36,{{36,8,59}}}
      }
    }}
    LibQuestieDB.Support.Get=function() return fixtureZones end
  `);
}
test('dungeon offers use the entrance continent and the quest median window', () => {
  const v = dungeonAddon();
  assert.equal(v.value('AzerothCoach.CoachSection.tip.dungeon'), '1581');
  assert.equal(v.value('AzerothCoach.CoachSection.tip.question'), 'true');
  assert.equal(v.value('#AzerothCoach.Data.InZone(1581)'), '4');
  v.run(`
    p=AzerothCoach.player;saved={settings={},dungeons={},seen={}}
    offers=function()
      local result={}
      for _,tip in ipairs(AzerothCoach.Tips.Build("PLAYER_LOGIN",p,nil,saved)) do
        if tip.kind=="dungeon" then result[#result+1]=tip end
      end
      return result
    end
    p.level=22;p.map=1442;kalimdor=offers()
  `);
  assert.equal(v.value('#kalimdor'), '0');
  v.run('p.map=1436;p.level=17'); assert.equal(v.value('#offers()'), '0');
  v.run('p.level=24'); assert.equal(v.value('#offers()'), '0');
  v.run('p.level=20'); assert.equal(v.value('#offers()'), '1');
  v.run('p.map=999'); assert.equal(v.value('#offers()'), '0');
  v.run('p.map=1436;fixtureZones.private.areaIdToUiMapId[40]=nil'); assert.equal(v.value('#offers()'), '0');
  v.run('fixtureZones.private.areaIdToUiMapId[40]=999'); assert.equal(v.value('#offers()'), '0');
});
test('transit areas, battlegrounds, raids and unverified Forever instances keep their indexes but give no offers', () => {
  const v = dungeonAddon();
  for (const area of [2257, 3277, 2717, 16544]) {
    assert.equal(v.value(`AzerothCoach.Data.IsDungeon(${area})`), 'false');
    assert.equal(v.value(`#AzerothCoach.Data.InZone(${area})`), '1');
    v.run('AzerothCoach.Data.dungeons[1581]=nil');
    assert.equal(v.value('#AzerothCoach.Tips.Build("PLAYER_LOGIN",AzerothCoach.player,nil,{settings={},dungeons={}})'), '0');
  }
});
test('dungeon questions show completed quests and stop when at least half are complete', () => {
  const v = dungeonAddon();
  v.run('p=AzerothCoach.player;p.completed[301]=true;tips=AzerothCoach.Tips.Build("PLAYER_LOGIN",p,nil,{settings={},dungeons={}})');
  assert.match(v.value('tips[1].body'), /You finished 1 of 4 quests/);
  assert.ok(Buffer.byteLength(v.value('tips[1].body')) <= 110);
  v.run('p.completed[302]=true');
  assert.equal(v.value('#AzerothCoach.Tips.Build("PLAYER_LOGIN",p,nil,{settings={},dungeons={}})'), '0');
  v.run('p.completed[303]=true');
  assert.equal(v.value('#AzerothCoach.Tips.Build("PLAYER_LOGIN",p,nil,{settings={},dungeons={}})'), '0');
});
test('four dungeon answers fit the block and save Yes, No, Later or Done it', () => {
  const v = dungeonAddon();
  const labels = ['Yes', 'No', 'Later', 'Done it'];
  assert.equal(v.value('#AzerothCoach.CoachSection.answers'), '4');
  labels.forEach((label, i) => {
    assert.equal(v.value(`AzerothCoach.CoachSection.answers[${i + 1}].text`), label);
    assert.equal(v.value(`AzerothCoach.CoachSection.answers[${i + 1}].width`), '56');
    assert.equal(v.value(`AzerothCoach.CoachSection.answers[${i + 1}].point[4]`), String(i * 60));
    v.run(`AzerothCoach.CoachSection.tip={dungeon=1581,question=true};AzerothCoach.CoachSection.answers[${i + 1}].scripts.OnClick()`);
    assert.equal(v.value('AzerothCoach.db.dungeons["1581"]'), i === 2 ? v.value('time()+3600') : (i === 0 ? 'yes' : 'no'));
    assert.equal(v.value('AzerothCoach.CoachSection.tip'), 'nil');
  });
  assert.equal(v.value('#AzerothCoach.Tips.Build("PLAYER_LOGIN",AzerothCoach.player,nil,AzerothCoach.db)'), '0');
});
test('unanswered dungeon questions can repeat after 24 hours on a new dungeon check', () => {
  const v = dungeonAddon();
  v.run('tip=AzerothCoach.CoachSection.tip;AzerothCoach.CoachSection.Dismiss();AzerothCoach.db.settings.tipPause=0');
  assert.equal(v.value('AzerothCoach.db.dungeons["1581"]'), 'nil');
  assert.equal(v.value('AzerothCoach.Triggers.Choose({tip},AzerothCoach.db,time()+86399,AzerothCoach.db.settings)'), 'nil');
  assert.equal(v.value('AzerothCoach.Triggers.Choose({tip},AzerothCoach.db,time()+86400,AzerothCoach.db.settings).question'), 'true');
});
test('queued dungeon offers stop after a continent, level, completion or preference change', () => {
  for (const change of ['p.map=1442', 'p.level=24', 'p.completed[301]=true;p.completed[302]=true', 'AzerothCoach.db.dungeons["1581"]="no"']) {
    const v = dungeonAddon();
    v.run(`
      p=AzerothCoach.player;tip=AzerothCoach.CoachSection.tip
      AzerothCoach.CoachSection.Dismiss();AzerothCoach.db.seen={};AzerothCoach.db.settings.tipPause=0
      ${change}
      AzerothCoach.candidates={[tip.key]=tip};AzerothCoach.TryOffer()
    `);
    assert.equal(v.value('AzerothCoach.CoachSection.tip'), 'nil', change);
    assert.equal(v.value('AzerothCoach.candidates[tip.key]'), 'nil', change);
    v.run('AzerothCoach.Offer(tip)');
    assert.equal(v.value('AzerothCoach.CoachSection.tip'), 'nil', change);
  }
  const v = dungeonAddon();
  v.run(`
    AzerothCoach.waiting=AzerothCoach.CoachSection.tip;AzerothCoach.CoachSection.Dismiss()
    C_Map.GetBestMapForUnit=function() return 1442 end
    AzerothCoach.tipEvents={};AzerothCoach.candidates={};STUB.Advance(1)
  `);
  assert.equal(v.value('AzerothCoach.waiting'), 'nil');
  assert.equal(v.value('AzerothCoach.CoachSection.tip'), 'nil');
});
test('AI facts keep dungeon completion summaries through the companion parser and give quest rows first use of space', () => {
  const v = dungeonAddon();
  v.run('p=AzerothCoach.player;p.completed[301]=true;pack=AzerothCoach.Data.Facts(p,nil,"")');
  let pack = JSON.parse(v.value('AzerothCoach.State.JSON(pack)'));
  assert.deepEqual(pack.z[1581], { name: 'The Deadmines', completed: 1, total: 4 });
  const ctx = v.value('AzerothCoach.State.Context(p,nil,"")');
  assert.deepEqual(parseContext(ctx).facts.z[1581], pack.z[1581]);
  assert.equal(v.value('AzerothCoach.Data.Expand("{z:1581}")'), 'The Deadmines');
  v.run('p.level=24');
  assert.equal(v.value('AzerothCoach.Data.Facts(p,nil,"").z["1581"]'), 'nil');
  v.run(`
    p.level=20
    for id=401,430 do AzerothCoach.Data.quests[id]={id=id,name=string.rep("Q",100),minLevel=18,level=20};p.active[id]={} end
    pack=AzerothCoach.Data.Facts(p,nil,"")
  `);
  pack = JSON.parse(v.value('AzerothCoach.State.JSON(pack)'));
  assert.ok(Buffer.byteLength(JSON.stringify(pack)) <= 1800);
  assert.ok(Object.keys(pack.q).length > 0);
  assert.equal(pack.z[1581], undefined);
});
test('full addon loads, indexes provider, uses a quiet tracker section and no tracker module', () => {
  const v = addon();
  assert.equal(v.value('AzerothCoach.Data.ready'), 'true');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.shown'), 'true');
  assert.equal(v.value('AzerothCoach.CoachSection.header.Text.text'), 'Coach');
  assert.equal(v.value('AzerothCoach.CoachSection.tip.kind'), 'dungeon');
  assert.equal(v.value('#AzerothCoach.CoachSection.frame.textures'), '0');
  v.run('STUB.Event("PLAYER_REGEN_DISABLED")');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.shown'), 'false');
  v.run('STUB.Event("PLAYER_REGEN_ENABLED"); STUB.Advance(2)');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.shown'), 'false');
  v.run('STUB.Advance(2)');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.shown'), 'true');
  v.run('AzerothCoach.CoachSection.Menu(); menuLabels={}; for _,row in ipairs(AzerothCoach.UI.menu.rows) do menuLabels[#menuLabels+1]=row.text end');
  assert.deepEqual(JSON.parse(v.value('AzerothCoach.State.JSON(menuLabels)')),
    ['Ask the coach', 'Dismiss', 'Pause 15 minutes', 'Pause 1 hour', 'Dock to quest tracker', 'Settings']);
  v.run('AzerothCoach.CoachSection.Dismiss()');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.shown'), 'false');
});
test('missing provider leaves chat and diagnostics usable', () => {
  const v = addon(true);
  assert.equal(v.value('AzerothCoach.Data.ready'), 'false');
  v.run('AzerothCoach.ChatWindow.Open(); AzerothCoach.Doctor()');
  assert.equal(v.value('AzerothCoach.ChatWindow.context.text'), 'No quest data');
});
test('real pixel codec transports Unicode and protocol fields', () => {
  const v = addon();
  v.run('AzerothCoach.Link.queue = {}; AzerothCoach.Link.pending = {}; AzerothCoach.Link.Send("chat", "\\n--- facts ---\\n{}", "héllo 世界", function() end); AzerothCoach.Link.Tick()');
  v.run('cells = AzerothCoachCodec.Encode(42, AzerothCoach.Link.queue[1].payload)');
  const cells = JSON.parse(v.value('AzerothCoach.State.JSON(cells)'));
  let bits = 0, acc = 0; const bytes = [];
  for (const cell of cells) { acc = acc * 8 + cell; bits += 3; while (bits >= 8) { bits -= 8; bytes.push(Math.floor(acc / 2 ** bits) & 255); acc %= 2 ** bits; } }
  assert.deepEqual(bytes.slice(0, 2), [0xc7, 0x1a]);
  const length = bytes[4] * 256 + bytes[5]; let s1 = 0, s2 = 0;
  for (const byte of bytes.slice(2, 6 + length)) { s1 = (s1 + byte) % 255; s2 = (s2 + s1) % 255; }
  assert.deepEqual(bytes.slice(6 + length, 8 + length), [s1, s2]);
  const jobs = jobsFromStrip(Buffer.from(bytes.slice(6, 6 + length)).toString('utf8'));
  assert.equal(jobs[0].text, 'héllo 世界');
  assert.equal(v.value('AzerothCoachStrip.shown'), 'true');
  assert.equal(v.value('AzerothCoach.db.outbox.hex ~= nil'), 'true');
});
test('link rejects stale sessions, keeps an old reply, accepts a final reply once, and hides the acknowledged strip', () => {
  const v = addon();
  v.run('AzerothCoach.Link.queue = {}; AzerothCoach.Link.pending = {}; calls = 0; id = AzerothCoach.Link.Send("chat", "", "test", function() calls = calls + 1 end); AzerothCoach.Link.Tick()');
  const id = Number(v.value('id')); const session = v.value('AzerothCoach.db.session');
  const data = { session: 'wrong', now: Number(v.value('time()')), replies: [{ chat: 'chat', id, status: 'done', text: 'answer' }] };
  v.run(`AzerothCoach.Link.Receive(${lua(data)})`); assert.equal(v.value('calls'), '0');
  data.session = session; data.now -= 121;
  v.run(`AzerothCoach.Link.Receive(${lua(data)})`); assert.equal(v.value('calls'), '1');
  data.now += 121;
  v.run(`AzerothCoach.Link.Receive(${lua(data)}); AzerothCoach.Link.Receive(${lua(data)}); AzerothCoach.Link.Tick()`);
  assert.equal(v.value('calls'), '1'); assert.equal(v.value('AzerothCoachStrip.shown'), 'false');
});
test('AI deadline keeps the template and ignores a late tip', () => {
  const v = addon();
  v.run('AzerothCoach.Link.lastSeen = GetTime(); AzerothCoach.CoachSection.Dismiss(); AzerothCoach.Offer({key="test",kind="level",title="Test",body="Template",createdAt=time(),questIds={}}); offered=AzerothCoach.db.nextId; STUB.Advance(13)');
  assert.equal(v.value('AzerothCoach.CoachSection.tip.body'), 'Template');
  v.run('AzerothCoach.Link.Receive({session=AzerothCoach.db.session,now=time(),replies={{id=offered,chat="coach",status="done",text="Late AI"}}})');
  assert.equal(v.value('AzerothCoach.CoachSection.tip.body'), 'Template');
});
test('source copy, map geometry, limits and whole JSON facts', () => {
  const v = addon(); v.run('AzerothCoach.ChatWindow.Copy("https://example.test/"); d,b=AzerothCoach.Geo.Heading({map=10,x=0,y=0},{map=10,x=0.3,y=0.4})');
  assert.equal(v.value('d'), '500.0');
  assert.ok(Math.abs(Number(v.value('b')) - Math.atan2(-300, -400)) < 1e-10);
  assert.equal(v.value('AzerothCoach.Geo.Continent(10)'), '1');
  v.run('px,py=AzerothCoach.Geo.Project(10,.3,.4,1)');
  assert.equal(v.value('px'), '0.3'); assert.equal(v.value('py'), '0.4');
  assert.equal(v.value('AzerothCoach.ChatWindow.copy.input.text'), 'https://example.test/');
  v.run('long=string.rep("é",401); bad,why=AzerothCoach.Link.Send("chat","",long); ctx=AzerothCoach.State.Context(AzerothCoach.player,AzerothCoach.CoachSection.tip,"")');
  assert.equal(v.value('bad'), 'nil');
  const ctx = v.value('ctx'); assert.doesNotThrow(() => JSON.parse(ctx.split('\n--- facts ---\n')[1]));
});

test('chat and coach context include guarded position and subzone before large inventory lines', () => {
  const v = addon(false, 'GetSubZoneText=function() return "Meadow Camp" end');
  v.run('p=AzerothCoach.State.Read();p.x=.723;p.y=.421;p.bags={[1]=string.rep("B",900)};p.equipment={[1]=string.rep("E",900)}');
  for (const tip of ['nil', '{key="zone:20",questIds={101}}']) {
    const { context } = parseContext(v.value(`AzerothCoach.State.Context(p,${tip},"")`));
    assert.match(context, /Zone: Test Meadow; quests: 0\nPosition: 72\.3, 42\.1; subzone: Meadow Camp\nXP:/);
    assert.ok(Buffer.byteLength(context) <= 900);
    assert.doesNotMatch(context, /Bags|Equipment/);
  }
  assert.equal(v.value('AzerothCoach.State.api.GetSubZoneText'), 'found');
  assert.equal(v.value('AzerothCoach.State.api["MapPosition.GetXY"]'), 'found');
  v.run('GetSubZoneText=function() error("unavailable") end;C_Map.GetPlayerMapPosition=function() return {GetXY=function() error("unavailable") end} end;p=AzerothCoach.State.Read()');
  assert.match(parseContext(v.value('AzerothCoach.State.Context(p)')).context, /Position: unknown; subzone: none/);
  assert.equal(v.value('AzerothCoach.State.api.GetSubZoneText'), 'failed');
  v.run('GetSubZoneText=nil;C_Map.GetPlayerMapPosition=nil;p=AzerothCoach.State.Read()');
  assert.match(parseContext(v.value('AzerothCoach.State.Context(p)')).context, /Position: unknown; subzone: none/);
  assert.equal(v.value('AzerothCoach.State.api.GetSubZoneText'), 'missing');
  v.run('GetSubZoneText=function() return "" end;p=AzerothCoach.State.Read()');
  assert.match(parseContext(v.value('AzerothCoach.State.Context(p)')).context, /subzone: none/);
});

function locationAddon() {
  return addon(false, `
    targetSpawns={ [201]={[20]={{20,30}}}, [202]={[20]={{80,80},{60,50}}}, [203]={[20]={{50,60}}} }
    LibQuestieDB.Npc.Get=function(id,key)
        if key=="name" then return "Test NPC "..id end
        if key=="spawns" then return targetSpawns[id] end
    end
    LibQuestieDB.Object={Get=function(id,key)
        if key=="name" then return "Test object "..id end
        if key=="spawns" then return targetSpawns[id] end
    end}
    LibQuestieDB.Item={Get=function(id,key)
        if key=="npcDrops" then return {202} end
        if key=="objectDrops" then return {203} end
    end}
  `);
}

for (const [direction, x, y] of [
  ['north', 50, 40], ['north-east', 60, 40], ['east', 60, 50], ['south-east', 60, 60],
  ['south', 50, 60], ['south-west', 40, 60], ['west', 40, 50], ['north-west', 40, 40]
]) test(`quest facts give the ${direction} direction from the map and an integer distance`, () => {
  const v = locationAddon();
  v.run(`p=AzerothCoach.player;p.x=.5;p.y=.5;p.active={[101]={}};AzerothCoach.Data.quests[101].objectives={{{202}}};targetSpawns[202]={[20]={{${x},${y}}}}`);
  const pack = parseContext(v.value('AzerothCoach.State.Context(p)')).facts;
  assert.deepEqual(pack.q[101].target, { id: 202, kind: 'n' });
  assert.equal(pack.q[101].dir, direction);
  assert.equal(pack.q[101].d, x === 50 || y === 50 ? 100 : 141);
  assert.equal(pack.n[202].name, 'Test NPC 202');
});

test('targets use the nearest objective spawn, item source, starter fallback or finisher', () => {
  const v = locationAddon();
  v.run('p=AzerothCoach.player;p.x=.5;p.y=.5;p.active={[101]={}};q=AzerothCoach.Data.quests[101];q.objectives={{{202}},{{203}}};q.finish={{203}}');
  const row = () => parseContext(v.value('AzerothCoach.State.Context(p)')).facts.q[101];
  assert.deepEqual(row().target, { id: 202, kind: 'n' });
  assert.equal(row().d, 100);
  v.run('C_Map.GetMapWorldSize=function() return 2000,1000 end; AzerothCoach.Geo.scales={}');
  assert.deepEqual(row().target, { id: 203, kind: 'o' });
  assert.equal(row().d, 100);
  v.run('q.objectives={nil,nil,{{301}}}');
  assert.deepEqual(row().target, { id: 203, kind: 'o' });
  v.run('q.objectives={nil,nil,nil,nil,{{{202},202}}}');
  assert.deepEqual(row().target, { id: 202, kind: 'n' });
  v.run('q.objectives={{{999}}}');
  assert.deepEqual(row().target, { id: 201, kind: 'n' });
  v.run('p.active[101].complete=true');
  assert.deepEqual(row().target, { id: 203, kind: 'n' });
  v.run('q.finish={nil,{203}}');
  assert.deepEqual(row().target, { id: 203, kind: 'o' });
  v.run('q.finish=nil');
  assert.equal(row().target, undefined);
});

test('target facts omit distance and direction on another map or without a player position', () => {
  const v = locationAddon();
  v.run('p=AzerothCoach.player;p.x=.5;p.y=.5;p.active={[101]={}};q=AzerothCoach.Data.quests[101];q.objectives={{{202}}};targetSpawns[202]={[1581]={{60,50}}}');
  const row = () => parseContext(v.value('AzerothCoach.State.Context(p)')).facts.q[101];
  assert.deepEqual(row().target, { id: 202, kind: 'n' });
  assert.equal(row().d, undefined); assert.equal(row().dir, undefined);
  v.run('targetSpawns[202]={[20]={{60,50}}};p.x=nil');
  assert.equal(row().d, undefined); assert.equal(row().dir, undefined);
  v.run('p.x=.6;p.y=.5');
  assert.equal(row().d, 0); assert.equal(row().dir, undefined);
  v.run('C_Map.GetMapWorldSize=nil;C_Map.GetWorldPosFromMapPos=nil');
  assert.equal(row().d, undefined); assert.equal(row().dir, undefined);
});

test('facts stay within 1800 bytes and drop farther targets before nearer targets', () => {
  const v = locationAddon();
  v.run(`
    p=AzerothCoach.player;p.x=.5;p.y=.5;p.active={};AzerothCoach.Data.dungeons={}
    for id=401,412 do
        AzerothCoach.Data.quests[id]={id=id,name=string.rep("é",20)..id,level=12,objectives={{{id}}}}
        p.active[id]={};targetSpawns[id]={[20]={{50+(413-id)*2,50}}}
    end
  `);
  const pack = parseContext(v.value('AzerothCoach.State.Context(p)')).facts;
  assert.ok(Buffer.byteLength(v.value('AzerothCoach.State.JSON(AzerothCoach.Data.Facts(p))')) <= 1800);
  assert.ok(Object.keys(pack.q).length > 0);
  const retained = Object.entries(pack.q).filter(([, q]) => q.target).map(([id]) => Number(id));
  assert.ok(retained.length > 0 && retained.length < 12, JSON.stringify(pack));
  assert.ok(retained.includes(412));
  assert.ok(retained.every(id => id > 412 - retained.length));
  assert.equal(pack.q[401]?.target, undefined);
});
test('all nine trigger templates use facts and stay inside the visible length limits', () => {
  const v = addon();
  v.run(`
    saved={settings={dungeons=true},dungeons={},seen={}}
    p={level=12,area=20,zone="Test Meadow",map=10,x=.2,y=.3,questCount=19,questMax=20,trivialRange=5,active={},completedKnown=true,completed={},skills={},spells={},reputation={},raceBit=1,classBit=1}
    found={}
    local function collect(event,arg)
        for _,tip in ipairs(AzerothCoach.Tips.Build(event,p,nil,saved,arg)) do
            found[tip.kind]=true
            assert(#AzerothCoach.Data.Expand(tip.title)<=32)
            assert(#AzerothCoach.Data.Expand(tip.body)<=110)
        end
    end
    collect("PLAYER_LEVEL_UP")
    collect("ZONE_CHANGED_NEW_AREA")
    p.active[101]={level=1}; collect("QUEST_LOG_UPDATE")
    p.active={}; p.completed[101]=true
    AzerothCoach.Data.Quest(101).nextQuest=102; collect("QUEST_TURNED_IN",101)
    p.area=1519;collect("ZONE_CHANGED_NEW_AREA")
    AzerothCoach.deathReady=true;collect("PLAYER_DEAD")
    count=0;for _ in pairs(found) do count=count+1 end
  `);
  assert.equal(v.value('count'), '9');
});
test('link survives reload recovery, capture failure, signals off and slot exhaustion', () => {
  const v = addon();
  v.run('AzerothCoach.Link.queue={}; AzerothCoach.Link.pending={}; id=AzerothCoach.Link.Send("chat","","recover",function() end); STUB.loaded={}; AzerothCoach.Link.Initialize()');
  assert.equal(v.value('AzerothCoach.Link.pending[id].payload ~= nil'), 'true');
  v.run('AzerothCoach.Link.queue={AzerothCoach.Link.pending[id]}; AzerothCoach.Link.pending[id].callback=function(reply) result=reply end; AzerothCoach.Link.Tick(); STUB.now=STUB.now+41; AzerothCoach.Link.Tick(); AzerothCoach.Link.Tick(); STUB.now=STUB.now+41; AzerothCoach.Link.Tick(); AzerothCoach.Link.Tick(); STUB.now=STUB.now+41; AzerothCoach.Link.Tick()');
  assert.equal(v.value('result.code'), 'capture');
  assert.equal(v.value('AzerothCoach.db.outbox'), 'nil');
  v.run('AzerothCoach.Link.free=0; id,why=AzerothCoach.Link.Send("chat","","x")');
  assert.equal(v.value('id'), 'nil'); assert.match(v.value('why'), /slots/);
});
test('guarded API preserves nil fields in legacy tuples', () => {
  const v = addon();
  v.run('a,b,c,d=AzerothCoach.State.Try("tuple",function() return 1,nil,nil,4 end)');
  assert.equal(v.value('d'), '4');
});
test('an absent companion causes one short hello and one slot read in ten minutes', () => {
  const v = addon(); let visible = 0;
  for (let second = 0; second < 600; second++) {
    v.run('STUB.Advance(1)');
    if (v.value('AzerothCoachStrip and AzerothCoachStrip.shown') === 'true') visible++;
  }
  assert.ok(visible <= 11, `strip visible for ${visible} seconds`);
  assert.equal(v.value('AzerothCoach.Link.free'), '199');
});
test('old presence files are a baseline; new beats and a wrap prove liveness', () => {
  const signal = 'Interface\\AddOns\\AzerothCoach\\ctl\\valid.wav';
  const prefix = 'Interface\\AddOns\\AzerothCoach\\presence\\';
  const sounds = { [signal]: true };
  for (let i = 50; i <= 1999; i++) sounds[prefix + String(i).padStart(4, '0') + '.wav'] = true;
  const v = addon(false, `STUB.sounds=${lua(sounds)}`);
  assert.equal(v.value('AzerothCoach.Link.IsOnline()'), 'false');
  v.run('AzerothCoach.Link.Tick()'); assert.equal(v.value('AzerothCoach.Link.IsOnline()'), 'false');
  v.run(`STUB.sounds[${lua(prefix + '2000.wav')}]=true; AzerothCoach.Link.Tick()`);
  assert.equal(v.value('AzerothCoach.Link.IsOnline()'), 'true');
  v.run(`STUB.now=STUB.now+91;AzerothCoach.Link.Tick()`); assert.equal(v.value('AzerothCoach.Link.IsOnline()'), 'false');
  v.run(`STUB.sounds[${lua(prefix + '0001.wav')}]=true; AzerothCoach.Link.Tick()`); assert.equal(v.value('AzerothCoach.Link.IsOnline()'), 'true');
  assert.equal(v.value('AzerothCoach.Link.free'), '200');
});
test('hello and coach jobs preserve the chat outbox; combat redraws the strip', () => {
  const v = addon();
  v.run('AzerothCoach.Link.queue={};AzerothCoach.Link.pending={};real=AzerothCoach.Link.Send("chat","","chat");AzerothCoach.Link.Send("coach","","tip");AzerothCoach.Link.Hello();AzerothCoach.Link.Tick()');
  assert.equal(v.value('AzerothCoach.db.outbox.id == real'), 'true');
  v.run('STUB.combat=true; AzerothCoach.Link.Tick()'); assert.equal(v.value('AzerothCoachStrip.shown'), 'false');
  v.run('STUB.combat=false; AzerothCoach.Link.Tick()'); assert.equal(v.value('AzerothCoachStrip.shown'), 'true');
});
test('normal drag keeps the dock and a waiting tip blocks offers', () => {
  const v = addon();
  v.run('AzerothCoach.CoachSection.header.scripts.OnDragStart(); AzerothCoach.CoachSection.header.scripts.OnDragStop()');
  assert.equal(v.value('AzerothCoach.db.position'), 'nil');
  v.run('AzerothCoach.player.taxi=true;UnitOnTaxi=function() return true end; AzerothCoach.Offer({key="wait",createdAt=time()});AzerothCoach.Offer({key="other",createdAt=time()})');
  assert.equal(v.value('AzerothCoach.waiting.key'), 'wait');
  v.run('AzerothCoach.candidates={}; AzerothCoach.tipEvents={}; AzerothCoach.waiting.createdAt=time()-301; STUB.Advance(1)');
  assert.equal(v.value('AzerothCoach.waiting'), 'nil');
});
test('QuestieDB uses map groups, override strings, alternative dungeon areas, and reverse prerequisites', () => {
  const v = addon(false, `
    LibQuestieDB.Support.Get=function() return {private={
      areaIdToUiMapId="return {[20]=99,[21]=10,[31]=11}",areaIdToUiMapIdOverride="return {[20]=10}",
      uiMapIdToAreaId="return {[10]=99}",uiMapIdToAreaIdOverride="return {[10]=20}",dungeons={[30]={"Test Cave",{31}}}
    }} end
    local old=LibQuestieDB.Quest.Get
    LibQuestieDB.Quest.Get=function(id,key)
      if key=="zoneOrSort" then return id==101 and 21 or 31 end
      return old(id,key)
    end
  `);
  assert.equal(v.value('AzerothCoach.Data.Map(20)'), '10');
  assert.equal(v.value('AzerothCoach.Data.Area(10)'), '20');
  assert.equal(v.value('#AzerothCoach.Data.InMap(10)'), '1');
  assert.equal(v.value('AzerothCoach.Data.InZone(30)[1].id'), '102');
  assert.equal(v.value('AzerothCoach.Data.Followups(101)[1]'), '102');
  v.run('UnitRace=function() return "Skyborne","Skyborne",95 end');
  assert.equal(v.value('AzerothCoach.State.Read().raceBit'), '4294967296.0');
});
test('real QuestieDB support files obey the same contract', { skip: !process.env.QUESTIEDB_SOURCE }, () => {
  const v = vm(); v.run(fs.readFileSync(path.join(__dirname, 'game.lua'), 'utf8'));
  v.run('zone={private={}};QuestieLoader={ImportModule=function(_,name) if name=="ZoneDB" then return zone end;return {Current=0,Wotlk=2,Cata=3} end}');
  for (const file of ['areaIdToUiMapId.lua', 'uiMapIdToAreaId.lua', 'dungeons.lua']) v.run(fs.readFileSync(path.join(process.env.QUESTIEDB_SOURCE, 'support/Forever/Zones', file), 'utf8'));
  v.run('LibQuestieDB.Support.Get=function() return zone end;local old=LibQuestieDB.Quest.Get;LibQuestieDB.Quest.Get=function(id,key) if key=="zoneOrSort" then return id==101 and 9 or 1717 end;return old(id,key) end');
  v.load('Planner.lua'); v.load('Data.lua'); v.load('State.lua');
  v.run('AzerothCoach.Data.Initialize(function() end)');
  assert.equal(v.value('AzerothCoach.Data.Map(9)'), '1429');
  assert.equal(v.value('AzerothCoach.Data.Area(1429)'), '12');
  assert.equal(v.value('AzerothCoach.Data.InMap(1429)[1].id'), '101');
  assert.equal(v.value('AzerothCoach.Data.InZone(491)[1].id'), '102');
  assert.equal(v.value('AzerothCoach.Data.EntranceMap(1581)'), '1436');
  v.run('supported=0;for area,row in pairs(zone.private.dungeons) do if AzerothCoach.Data.IsDungeon(area) then assert(type(row[1])=="string" and #row[1]>0);supported=supported+1 end end');
  assert.equal(v.value('supported'), '25');
});
test('event bursts share one snapshot and stale death events cannot create a fresh tip', () => {
  const v = addon();
  v.run('reads=0;local read=AzerothCoach.State.Read; AzerothCoach.State.Read=function() reads=reads+1;return read() end;for i=1,100 do STUB.Event("QUEST_LOG_UPDATE") end;STUB.Advance(.3)');
  assert.equal(v.value('reads'), '1');
  v.run('AzerothCoach.CoachSection.Dismiss();AzerothCoach.candidates={};AzerothCoach.tipEvents={};AzerothCoach.db.lastTipAt=time();AzerothCoach.db.settings.tipPause=1200;for i=1,3 do AzerothCoach.Update("PLAYER_DEAD") end;STUB.Advance(1201)');
  assert.equal(v.value('AzerothCoach.CoachSection.tip and AzerothCoach.CoachSection.tip.kind == "deaths"'), 'nil');
  assert.equal(v.value('AzerothCoach.candidates["deaths:20"]'), 'nil');
});
test('a new tip resets the completed block fade and uses the native dock offsets', () => {
  const v = addon();
  v.run('AzerothCoach.candidates={};AzerothCoach.tipEvents={};STUB.Advance(601);STUB.now=STUB.now+1.1;local block=AzerothCoach.CoachSection.block;block.scripts.OnUpdate(block)');
  assert.equal(v.value('AzerothCoach.CoachSection.block:GetAlpha()'), '0');
  v.run('AzerothCoach.CoachSection.Show({key="next",kind="level",title="Next",body="A visible tip.",createdAt=time()})');
  assert.equal(v.value('AzerothCoach.CoachSection.block:GetAlpha()'), '1');
  assert.equal(v.value('AzerothCoach.CoachSection.block.scripts.OnUpdate'), 'nil');
  assert.equal(v.value('AzerothCoach.CoachSection.block:IsShown()'), 'true');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.point[4]'), '30');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.point[5]'), '0');
});
test('local reply timeouts clear the reload outbox', () => {
  const v = addon();
  v.run('AzerothCoach.Link.queue={};AzerothCoach.Link.pending={};id=AzerothCoach.Link.Send("chat","","timeout");AzerothCoach.Link.pending[id].acked=true;STUB.now=STUB.now+181;AzerothCoach.Link.Tick()');
  assert.equal(v.value('AzerothCoach.db.outbox'), 'nil');
});
test('an empty presence baseline splits its scan across frames', () => {
  const v = addon(false, `soundCalls=0;local sound=PlaySoundFile;PlaySoundFile=function(...) soundCalls=soundCalls+1;return sound(...) end;STUB.sounds["Interface\\\\AddOns\\\\AzerothCoach\\\\ctl\\\\valid.wav"]=true`);
  assert.ok(Number(v.value('soundCalls')) <= 150);
  v.run('soundCalls=0;STUB.Advance(.01)');
  assert.ok(Number(v.value('soundCalls')) <= 64);
  assert.equal(v.value('AzerothCoach.Link.IsOnline()'), 'false');
});
test('state reads each distinct reputation and spell restriction once', () => {
  const v = addon(false, `local get=LibQuestieDB.Quest.Get;LibQuestieDB.Quest.Get=function(id,key) if key=="requiredMinRep" then return {123,100} elseif key=="requiredSpell" then return 456 end;return get(id,key) end`);
  v.run('repReads=0;spellReads=0;C_Reputation={GetFactionDataByID=function() repReads=repReads+1;return {currentStanding=150} end};IsPlayerSpell=function() spellReads=spellReads+1;return true end;AzerothCoach.State.Read()');
  assert.equal(v.value('repReads'), '1'); assert.equal(v.value('spellReads'), '1');
});
test('offline chat gives the Start menu repair and slot failures give the installer repair', () => {
  const v = addon();
  v.run('AzerothCoach.ChatWindow.Open(); offline="";for _,row in ipairs(AzerothCoach.ChatWindow.rows) do if row.text.text:find("not connected",1,true) then offline=row.text.text end end');
  assert.equal(v.value('offline'), 'The companion is not connected. Open the Start menu and click Restart Azeroth Coach. Tips still come from the quest data.');
  v.run('AzerothCoach.Log=function(text) failure=text end; C_AddOns.LoadAddOn=function() return nil,"MISSING" end; AzerothCoach.Link.Poll()');
  assert.equal(v.value('failure'), 'Cannot load AzerothCoach_S001. Run the Azeroth Coach installer again, then restart the game.');
  assert.equal(v.value('AzerothCoach.Link.free'), '200');
});
for (const [job, deadline, expected] of [
  ['chat', 180, [5, 20, 50, 110, 170]],
  ['deep', 360, [5, 20, 50, 110, 170, 230, 290, 350]]
]) test(`fallback ${job} uses at most ${expected.length} slots within ${deadline} seconds`, () => {
  const v = addon();
  v.run(`
    STUB.timers={}; AzerothCoach.Link.pending={}; AzerothCoach.Link.queue={}
    polls={}; started=GetTime(); id=AzerothCoach.Link.Send(${lua(job)},"","slow",function(reply) result=reply end)
    STUB.onLoad=function()
        polls[#polls+1]=GetTime()-started
        if #polls==1 then AzerothCoach_SlotData={session=AzerothCoach.db.session,now=time(),replies={{id=id,chat="chat",status="working",text="Working"}}} end
    end
    for second=0,${deadline} do STUB.now=started+second; AzerothCoach.Link.Tick() end
  `);
  assert.deepEqual(JSON.parse(v.value('AzerothCoach.State.JSON(polls)')), expected);
  assert.equal(v.value('AzerothCoach.Link.pending[id] ~= nil'), 'true');
  v.run(`STUB.now=started+${deadline + 61}; AzerothCoach.Link.Tick()`);
  assert.equal(v.value('result.code'), 'timeout');
  assert.equal(v.value('AzerothCoach.Link.free'), String(200 - expected.length));
  assert.equal(v.value('AzerothCoach.db.outbox'), 'nil');
  v.run('lines={};AzerothCoach.Print=function(text) lines[#lines+1]=text end; AzerothCoach.Doctor(); doctor=table.concat(lines,"\\n")');
  assert.match(v.value('doctor'), new RegExp('Slots used this session: ' + expected.length + '(?:\\n|$)'));
  assert.match(v.value('doctor'), new RegExp('free slots: ' + (200 - expected.length)));
  const docs = fs.readFileSync(path.join(__dirname, '../docs/implementation.md'), 'utf8');
  assert.ok(docs.includes(`One ${job} question uses at most ${expected.length} slots within ${deadline} s.`));
});
test('fallback backoff accepts a late reply once and stops polling', () => {
  const v = addon();
  v.run(`
    STUB.timers={};AzerothCoach.Link.pending={};AzerothCoach.Link.queue={};calls=0;started=GetTime()
    id=AzerothCoach.Link.Send("chat","","slow",function(reply) calls=calls+1;result=reply end)
    STUB.onLoad=function()
        AzerothCoach_SlotData={session=AzerothCoach.db.session,now=time(),replies={{id=id,chat="chat",status=GetTime()-started>=110 and "done" or "working",text="Answer"}}}
    end
    for second=0,240 do STUB.now=started+second;AzerothCoach.Link.Tick() end
  `);
  assert.equal(v.value('result.text'), 'Answer'); assert.equal(v.value('calls'), '1');
  assert.equal(v.value('AzerothCoach.Link.free'), '196');
});
test('trusted signals poll once, then wait for a fresh reply signal', () => {
  const v = addon(false, `STUB.sounds["Interface\\\\AddOns\\\\AzerothCoach\\\\ctl\\\\valid.wav"]=true`);
  v.run(`
    STUB.timers={};AzerothCoach.Link.pending={};AzerothCoach.Link.queue={};started=GetTime()
    id=AzerothCoach.Link.Send("chat","","slow",function(reply) result=reply end)
    STUB.onLoad=function() AzerothCoach_SlotData={session=AzerothCoach.db.session,now=time(),replies={{id=id,chat="chat",status="working"}}} end
    for second=0,100 do STUB.now=started+second;AzerothCoach.Link.Tick() end
  `);
  assert.equal(v.value('AzerothCoach.Link.free'), '199');
  v.run(`
    STUB.onLoad=function() AzerothCoach_SlotData={session=AzerothCoach.db.session,now=time(),replies={{id=id,chat="chat",status="done",text="Signal answer"}}} end
    STUB.sounds[string.format("Interface\\\\AddOns\\\\AzerothCoach\\\\sig\\\\%03d.wav",((id-1)%200)+1)]=true
    AzerothCoach.Link.Tick()
  `);
  assert.equal(v.value('result.text'), 'Signal answer');
  assert.equal(v.value('AzerothCoach.Link.free'), '198');
});
test('a reused reply signal keeps the fallback backoff', () => {
  const v = addon(false, `STUB.sounds["Interface\\\\AddOns\\\\AzerothCoach\\\\ctl\\\\valid.wav"]=true`);
  v.run(`
    STUB.timers={};AzerothCoach.Link.pending={};AzerothCoach.Link.queue={};started=GetTime();polls={}
    STUB.sounds[string.format("Interface\\\\AddOns\\\\AzerothCoach\\\\sig\\\\%03d.wav",(AzerothCoach.db.nextId%200)+1)]=true
    id=AzerothCoach.Link.Send("chat","","slow")
    STUB.onLoad=function() polls[#polls+1]=GetTime()-started;AzerothCoach_SlotData={session=AzerothCoach.db.session,now=time(),replies={{id=id,chat="chat",status="working"}}} end
    for second=0,180 do STUB.now=started+second;AzerothCoach.Link.Tick() end
  `);
  assert.equal(v.value('AzerothCoach.Link.pending[id].sigAtStart'), 'true');
  assert.deepEqual(JSON.parse(v.value('AzerothCoach.State.JSON(polls)')), [5, 20, 50, 110, 170]);
});
test('combat extends fallback waits and several pending questions share a slot read', () => {
  const v = addon();
  v.run(`
    STUB.timers={};AzerothCoach.Link.pending={};AzerothCoach.Link.queue={};started=GetTime();polls={}
    id=AzerothCoach.Link.Send("chat","","slow");other=AzerothCoach.Link.Send("coach","","tip")
    STUB.onLoad=function()
        polls[#polls+1]=GetTime()-started
        AzerothCoach_SlotData={session=AzerothCoach.db.session,now=time(),replies={{id=id,chat="chat",status="working"},{id=other,chat="coach",status="working"}}}
    end
    STUB.now=started+5;AzerothCoach.Link.Tick()
    STUB.now=started+10;STUB.combat=true;AzerothCoach.Link.Tick()
    STUB.now=started+110;AzerothCoach.Link.Tick();STUB.combat=false;AzerothCoach.Link.Tick()
    STUB.now=started+119;AzerothCoach.Link.Tick()
  `);
  assert.equal(v.value('AzerothCoach.Link.free'), '199');
  v.run('STUB.now=started+120;AzerothCoach.Link.Tick()');
  assert.deepEqual(JSON.parse(v.value('AzerothCoach.State.JSON(polls)')), [5, 120]);
  assert.equal(v.value('AzerothCoach.Link.pending[id].started'), v.value('started+100'));
});

test('target ranking calls the map APIs once for each map, not once for each spawn', () => {
  const v = locationAddon();
  v.run(`local many = {}; for i = 1, 300 do many[i] = {i % 100, (i * 7) % 100} end
    targetSpawns[202] = {[20] = many}
    p=AzerothCoach.player;p.x=.5;p.y=.5;p.active={[101]={}};q=AzerothCoach.Data.quests[101];q.objectives={{{202}}}
    rectCalls = 0; local rect = C_Map.GetMapRectOnMap
    C_Map.GetMapRectOnMap = function(...) rectCalls = rectCalls + 1; return rect(...) end
    AzerothCoach.Geo.scales = {}`);
  v.run('AzerothCoach.State.Context(p)');
  const first = Number(v.value('rectCalls'));
  assert.ok(first < 20, `first context used ${first} map rect calls`);
  v.run('rectCalls = 0; AzerothCoach.State.Context(p)');
  assert.ok(Number(v.value('rectCalls')) < 10);
});
