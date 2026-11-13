'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vm } = require('./lua');
const { lua, jobsFromStrip } = require('../companion/protocol');
function addon(missing = false, before = '') {
  const v = vm(); v.run(fs.readFileSync(path.join(__dirname, 'game.lua'), 'utf8'));
  if (missing) v.run('LibQuestieDB = nil');
  if (before) v.run(before);
  const files = fs.readFileSync(path.join(__dirname, '../addon/AzerothCoach/AzerothCoach.toc'), 'utf8').split('\n').filter(x => x.endsWith('.lua'));
  files.forEach(v.load); v.run('STUB.Event("PLAYER_LOGIN")'); return v;
}
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
test('source copy, route geometry, limits and whole JSON facts', () => {
  const v = addon(); v.run('AzerothCoach.ChatWindow.Copy("https://example.test/"); d,b=AzerothCoach.Route.Heading({map=10,x=0,y=0},{map=10,x=0.3,y=0.4})');
  assert.equal(v.value('d'), '500.0');
  assert.equal(v.value('AzerothCoach.ChatWindow.copy.input.text'), 'https://example.test/');
  v.run('long=string.rep("é",401); bad,why=AzerothCoach.Link.Send("chat","",long); ctx=AzerothCoach.State.Context(AzerothCoach.player,AzerothCoach.CoachSection.tip,"")');
  assert.equal(v.value('bad'), 'nil');
  const ctx = v.value('ctx'); assert.doesNotThrow(() => JSON.parse(ctx.split('\n--- facts ---\n')[1]));
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
test('normal drag keeps the dock, a waiting tip blocks offers, and a route survives expiry', () => {
  const v = addon();
  v.run('AzerothCoach.CoachSection.header.scripts.OnDragStart(); AzerothCoach.CoachSection.header.scripts.OnDragStop()');
  assert.equal(v.value('AzerothCoach.db.position'), 'nil');
  v.run('AzerothCoach.player.taxi=true;UnitOnTaxi=function() return true end; AzerothCoach.Offer({key="wait",createdAt=time()});AzerothCoach.Offer({key="other",createdAt=time()})');
  assert.equal(v.value('AzerothCoach.waiting.key'), 'wait');
  v.run('AzerothCoach.candidates={}; AzerothCoach.tipEvents={}; AzerothCoach.waiting.createdAt=time()-301; STUB.Advance(1)');
  assert.equal(v.value('AzerothCoach.waiting'), 'nil');
  v.run('UnitOnTaxi=function() return false end; AzerothCoach.player.taxi=false;AzerothCoach.Route.Start({{map=10,x=.2,y=.3,label="Fixture"}});AzerothCoach.CoachSection.shownAt=time()-601;STUB.Advance(1);AzerothCoach.CoachSection.Refresh()');
  assert.equal(v.value('AzerothCoach.CoachSection.route:IsShown()'), 'true');
  assert.equal(v.value('AzerothCoach.CoachSection.frame.shown'), 'true');
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
  v.run('zone={private={}};QuestieLoader={ImportModule=function(_,name) if name=="ZoneDB" then return zone end;return {Current={}} end}');
  for (const file of ['areaIdToUiMapId.lua', 'uiMapIdToAreaId.lua']) v.run(fs.readFileSync(path.join(process.env.QUESTIEDB_SOURCE, 'support/Forever/Zones', file), 'utf8'));
  v.run('zone.private.dungeons={[491]={"Test Cave",{1717}}}; LibQuestieDB.Support.Get=function() return zone end;local old=LibQuestieDB.Quest.Get;LibQuestieDB.Quest.Get=function(id,key) if key=="zoneOrSort" then return id==101 and 9 or 1717 end;return old(id,key) end');
  v.load('Planner.lua'); v.load('Data.lua'); v.load('State.lua');
  v.run('AzerothCoach.Data.Initialize(function() end)');
  assert.equal(v.value('AzerothCoach.Data.Map(9)'), '1429');
  assert.equal(v.value('AzerothCoach.Data.Area(1429)'), '12');
  assert.equal(v.value('AzerothCoach.Data.InMap(1429)[1].id'), '101');
  assert.equal(v.value('AzerothCoach.Data.InZone(491)[1].id'), '102');
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
