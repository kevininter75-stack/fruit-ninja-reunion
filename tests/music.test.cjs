const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  let muted = false;
  const sources = [], gains = [];
  const ctx = { currentTime: 12, destination: {}, decodeAudioData: async () => ({ duration: 15.868 }),
    createGain() { const node = { gain: { value: 0, setTargetAtTime(value) { this.value = value; } }, connect() { return this; }, disconnect() {} }; gains.push(node); return node; },
    createBufferSource() { const source = { connect(destination) { return destination; }, start(time) { this.time = time; }, stop() { this.stopped = true; }, disconnect() {} }; sources.push(source); return source; } };
  const exports = {};
  const code = fs.readFileSync('src/systems/MusicManager.ts','utf8').replace('import.meta.env.BASE_URL', "'/'");
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, require: name => name.includes('audioContext') ? { getAudioContext: () => ctx } : { isMuted: () => muted, setMuted: value => muted = value },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  });
  return { ...exports, sources, gains };
}
test('mix varies by mode and event, stays bounded, menu resets', () => {
  const { musicMix } = harness();
  assert.ok(musicMix('chrono',0,'normal',true) > musicMix('classic',0,'normal',true));
  assert.ok(musicMix('classic',1,'normal',true) > musicMix('classic',0,'normal',true));
  assert.ok(musicMix('chrono',1,'cyclone',true) > musicMix('chrono',1,'gel',true));
  for (const mode of ['classic','chrono','daily']) for (const moment of ['normal','gel','piment','cyclone']) {
    const gain = musicMix(mode,2,moment,true); assert.ok(gain >= 0 && gain <= 1);
    assert.equal(musicMix(mode,1,moment,false), 0.55);
  }
});
test('track starts once, survive mute and sleep without duplication, stop cleans up', async () => {
  const h = harness(), m = new h.MusicManager();
  m.precharger(); m.ensureRunning();
  await m.decoding;
  assert.equal(h.sources.length,1);
  assert.equal(new Set(h.sources.map(s=>s.time)).size,1);
  m.setEnPartie(true); m.setGameplay('chrono',1,'cyclone');
  m.toggleMuted(); assert.equal(h.gains[0].gain.value,0);
  m.toggleMuted(); assert.equal(h.gains[0].gain.value,0.24);
  m.suspend(); m.wake(); m.ensureRunning();
  assert.equal(h.sources.length,1);
  m.stop(); assert.ok(h.sources.every(s=>s.stopped));
  m.ensureRunning(); assert.equal(h.sources.length,2);
});
test('decoded music does not start after stop or during suspension', async () => {
  for(const action of ['stop','suspend']) {
    const h=harness(), m=new h.MusicManager();
    m.ensureRunning(); m[action](); await m.decoding;
    assert.equal(h.sources.length,0);
    if(action==='suspend') { m.wake(); assert.equal(h.sources.length,1); }
  }
});
