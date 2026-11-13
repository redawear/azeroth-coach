'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
function vm(files = []) {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const run = code => { if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1))); };
  const value = expr => {
    run(`RESULT = tostring((${expr}))`); lua.lua_getglobal(L, to_luastring('RESULT'));
    const result = to_jsstring(lua.lua_tostring(L, -1)); lua.lua_pop(L, 1); return result;
  };
  run('unpack = table.unpack; loadstring = load; math.atan2 = math.atan');
  const load = file => run(fs.readFileSync(path.join(__dirname, '..', 'addon', 'AzerothCoach', file), 'utf8'));
  files.forEach(load); return { run, value, load };
}
module.exports = { vm };
