'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vm } = require('./lua');
const { lua } = require('../companion/protocol');

function addon(before = '') {
  const v = vm();
  v.run(fs.readFileSync(path.join(__dirname, 'game.lua'), 'utf8'));
  v.run(before);
  const files = fs.readFileSync(path.join(__dirname, '../addon/AzerothCoach/AzerothCoach.toc'), 'utf8')
    .split(/\r?\n/).filter(file => file.endsWith('.lua'));
  files.forEach(v.load);
  v.run('STUB.Event("PLAYER_LOGIN"); M=AzerothCoach.MinimapButton; W=AzerothCoach.ChatWindow; C=AzerothCoach.CoachSection; b=M.frame');
  return v;
}
function badge(v) { return v.value('b.badge:IsShown()'); }
function hintCount(v) {
  return Number(v.value('(function() local n=0;for _,row in ipairs(AzerothCoach.db.log) do if row.text=="Type /coach or click the minimap button to open the coach again." then n=n+1 end end;return n end)()'));
}

test('minimap button uses the shared native look and starts at the bottom-left edge', () => {
  const v = addon();
  assert.equal(v.value('b.parent == Minimap'), 'true');
  assert.equal(v.value('b.width'), '31');
  assert.equal(v.value('b.height'), '31');
  assert.equal(v.value('b.strata'), 'MEDIUM');
  assert.equal(v.value('b.icon.width'), '20');
  const toc = fs.readFileSync(path.join(__dirname, '../addon/AzerothCoach/AzerothCoach.toc'), 'utf8');
  assert.equal(v.value('b.icon.texture'), toc.match(/^## IconTexture: (.+)$/m)[1].trim());
  assert.equal(v.value('b.textures[3].width'), '53');
  assert.equal(v.value('b.textures[3].point[1]'), 'TOPLEFT');
  assert.equal(v.value('AzerothCoach.db.minimap.angle'), '225');
  assert.equal(v.value('AzerothCoach.db.minimap.hide'), 'false');
  assert.equal(v.value('b:IsShown()'), 'true');
  const x = Number(v.value('b.point[4]')), y = Number(v.value('b.point[5]'));
  assert.ok(x < 0 && y < 0);
  assert.ok(Math.abs(Math.hypot(x, y) - 80) < 1e-8);
});

test('minimap left-click and empty slash command use the same chat toggle', () => {
  const v = addon();
  v.run('b.scripts.OnClick(b,"LeftButton")');
  assert.equal(v.value('W.frame:IsShown()'), 'true');
  v.run('SlashCmdList.AZEROTHCOACH("")');
  assert.equal(v.value('W.frame:IsShown()'), 'false');
  v.run('SlashCmdList.AZEROTHCOACH(""); b.scripts.OnClick(b,"LeftButton")');
  assert.equal(v.value('W.frame:IsShown()'), 'false');
});

test('minimap right-click calls the shared menu with the button as owner', () => {
  const v = addon();
  v.run('local menu=C.Menu;calls=0;C.Menu=function(owner) calls=calls+1;menuOwner=owner;menu(owner) end;b.scripts.OnClick(b,"RightButton");shared=AzerothCoach.UI.menu');
  assert.equal(v.value('calls'), '1');
  assert.equal(v.value('menuOwner == b'), 'true');
  assert.equal(v.value('shared.point[2] == b'), 'true');
  const labels = v.value('(function() local names={};for _,row in ipairs(shared.rows) do names[#names+1]=row.text end;return table.concat(names,"|") end)()');
  v.run('C.Menu()');
  assert.equal(v.value('AzerothCoach.UI.menu == shared'), 'true');
  assert.equal(v.value('shared.point[2] == C.frame'), 'true');
  assert.equal(labels, 'Ask the coach|Dismiss|Pause 15 minutes|Pause 1 hour|Dock to quest tracker|Settings');
  v.run('b.scripts.OnClick(b,"RightButton");shared.rows[1].scripts.OnClick()');
  assert.equal(v.value('W.frame:IsShown()'), 'true');
  v.run('W.frame:Hide();b.scripts.OnClick(b,"RightButton");shared.rows[2].scripts.OnClick()');
  assert.equal(v.value('C.tip'), 'nil');
});

test('drag follows the minimap edge at its effective scale and restores the saved angle after reload', () => {
  const v = addon();
  v.run('Minimap.scale=2;STUB.cursorX=1000;STUB.cursorY=1000;b.scripts.OnMouseDown();b.scripts.OnDragStart()');
  assert.ok(Math.abs(Number(v.value('AzerothCoach.db.minimap.angle')) - 90) < 1e-8);
  v.run('STUB.cursorX=800;STUB.cursorY=800;b.scripts.OnUpdate(b);b.scripts.OnDragStop()');
  assert.ok(Math.abs(Number(v.value('AzerothCoach.db.minimap.angle')) - 180) < 1e-8);
  assert.equal(v.value('b.scripts.OnUpdate'), 'nil');
  v.run('b.scripts.OnClick(b,"LeftButton")');
  assert.equal(v.value('W.frame:IsShown()'), 'false');
  const saved = JSON.parse(v.value('AzerothCoach.State.JSON(AzerothCoach.db.minimap)'));
  const reloaded = addon(`AzerothCoachDB={minimap=${lua(saved)}}`);
  assert.equal(Number(reloaded.value('AzerothCoach.db.minimap.angle')), saved.angle);
  assert.ok(Math.abs(Number(reloaded.value('b.point[4]')) + 80) < 1e-8);
  assert.ok(Math.abs(Number(reloaded.value('b.point[5]'))) < 1e-8);
  v.run('b.scripts.OnMouseDown();b.scripts.OnClick(b,"LeftButton")');
  assert.equal(v.value('W.frame:IsShown()'), 'true');
});

test('badge marks hidden and collapsed tips, stays cleared after chat open, and marks a new tip', () => {
  const v = addon();
  assert.equal(badge(v), 'false');
  v.run('C.frame:ToggleCollapsed()');
  assert.equal(badge(v), 'true');
  v.run('W.Open()');
  assert.equal(badge(v), 'false');
  v.run('W.frame:Hide();C.Refresh();STUB.Advance(1)');
  assert.equal(badge(v), 'false');
  v.run('C.Show({key="next",kind="level",title="Next",body="A test tip.",createdAt=time()})');
  assert.equal(badge(v), 'true');
  v.run('C.frame:ToggleCollapsed()');
  assert.equal(badge(v), 'false');
  v.run('STUB.Event("PLAYER_REGEN_DISABLED")');
  assert.equal(badge(v), 'true');
  v.run('C.Dismiss()');
  assert.equal(badge(v), 'false');
});

test('badge marks a queued tip and clears on queue expiry or dismissal', () => {
  const v = addon();
  v.run('C.Dismiss();AzerothCoach.candidates={};AzerothCoach.tipEvents={};AzerothCoach.flags.cinematic=true;AzerothCoach.Offer({key="wait",createdAt=time()})');
  assert.equal(badge(v), 'true');
  v.run('W.Open();W.frame:Hide();M.Refresh()');
  assert.equal(badge(v), 'false');
  v.run('AzerothCoach.waiting=nil;AzerothCoach.Offer({key="new",createdAt=time()});C.Dismiss()');
  assert.equal(v.value('AzerothCoach.waiting'), 'nil');
  assert.equal(badge(v), 'false');
  v.run('AzerothCoach.Offer({key="expires",createdAt=time()});STUB.Advance(300)');
  assert.equal(v.value('AzerothCoach.waiting'), 'nil');
  assert.equal(badge(v), 'false');
});

test('badge clears when a hidden tip expires without a close hint', () => {
  const v = addon();
  v.run('C.frame:ToggleCollapsed();AzerothCoach.candidates={};AzerothCoach.tipEvents={};STUB.Advance(601)');
  assert.equal(v.value('C.tip'), 'nil');
  assert.equal(badge(v), 'false');
  assert.equal(hintCount(v), 0);
});

test('tooltip shows the link status and the click instructions', () => {
  const v = addon();
  for (const [state, text] of [['online', 'online'], ['stale', 'no signal'], ['down', 'not connected']]) {
    v.run(`AzerothCoach.Link.Status=function() return "${state}" end;b.scripts.OnEnter()`);
    assert.equal(v.value('GameTooltip.owner == b'), 'true');
    assert.deepEqual(JSON.parse(v.value('AzerothCoach.State.JSON(GameTooltip.lines)')),
      ['Azeroth Coach', text, 'Click: open the chat. Right-click: options.']);
    v.run('b.scripts.OnLeave()');
    assert.equal(v.value('GameTooltip:IsShown()'), 'false');
  }
});

test('visibility slash command saves the setting and prints the setting message', () => {
  const v = addon();
  v.run('SlashCmdList.AZEROTHCOACH("button off")');
  assert.equal(v.value('b:IsShown()'), 'false');
  assert.equal(v.value('AzerothCoach.db.minimap.hide'), 'true');
  assert.equal(v.value('AzerothCoach.db.log[#AzerothCoach.db.log].text'), 'Setting applied: button off.');
  const reloaded = addon('AzerothCoachDB={minimap={angle=225,hide=true}}');
  assert.equal(reloaded.value('b:IsShown()'), 'false');
  v.run('SlashCmdList.AZEROTHCOACH("button on")');
  assert.equal(v.value('b:IsShown()'), 'true');
  assert.equal(v.value('AzerothCoach.db.minimap.hide'), 'false');
  assert.equal(v.value('AzerothCoach.db.log[#AzerothCoach.db.log].text'), 'Setting applied: button on.');
});

test('native checkbox reads and writes the saved minimap visibility', () => {
  const v = addon(`
    Settings={VarType={Boolean="boolean"},RegisterVerticalLayoutCategory=function() return {} end,RegisterAddOnCategory=function() end,
      RegisterProxySetting=function(category,key,kind,label,default,get,set) proxy={key=key,label=label,default=default,get=get,set=set};return proxy end,
      CreateCheckbox=function(category,setting,label) checkbox=setting end}
  `);
  assert.equal(v.value('checkbox.label'), 'Show the minimap button');
  assert.equal(v.value('checkbox.get()'), 'true');
  v.run('checkbox.set(false)');
  assert.equal(v.value('b:IsShown()'), 'false');
  assert.equal(v.value('AzerothCoach.db.minimap.hide'), 'true');
  v.run('SlashCmdList.AZEROTHCOACH("button on")');
  assert.equal(v.value('checkbox.get()'), 'true');
  v.run('checkbox.set(false);checkbox.set(true)');
  assert.equal(v.value('b:IsShown()'), 'true');
});

for (const action of ['W.close.scripts.OnClick()', 'W.frame:Hide()', 'SlashCmdList.AZEROTHCOACH("")', 'b.scripts.OnClick(b,"LeftButton")', 'C.Dismiss()']) {
  test(`reopen hint shows once per character after ${action}`, () => {
    const v = addon();
    assert.equal(hintCount(v), 0);
    v.run('W.Open();W.HideForShot()');
    assert.equal(hintCount(v), 0);
    v.run(`W.ResumeShot();${action}`);
    assert.equal(hintCount(v), 1);
    assert.equal(v.value('AzerothCoach.db.reopenHint'), 'true');
    v.run('W.Open();W.frame:Hide();C.Dismiss()');
    assert.equal(hintCount(v), 1);
    const reloaded = addon('AzerothCoachDB={reopenHint=true}');
    reloaded.run('W.Open();W.frame:Hide();C.Dismiss()');
    assert.equal(hintCount(reloaded), 0);
  });
}
