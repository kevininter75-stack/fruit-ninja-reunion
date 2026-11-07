const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const constants = new Proxy({}, { get: (_, key) => key === 'DELUGE_CALM_MS' ? 2600 : key === 'GEL_MIN_GAP_MS' ? 20000 : key === 'SPECIAL_MIN_GAP_MS' ? 14000 : 0 });
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/systems/SpawnManager.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, {
  exports: moduleExports,
  require: (name) => name.includes('constants') ? constants : name.includes('rng')
    ? { rndBetween: (a) => a, rndFloat: (a) => a } : name.includes('fruitCatalog') ? { GEL_VARIETY: { radius: 30 } } : name.includes('SfxManager') ? { sfx: { launch() {} } } : {}
});
function setup(mode) {
  const callbacks = [];
  const scene = { time: { now: 100000, delayedCall: (_, fn) => callbacks.push(fn) }, physics: { world: { gravity: {} } }, scale: { width: 720 } };
  let gels = 0;
  const fruit = { launchAs() { gels++; } };
  const manager = new moduleExports.SpawnManager(scene, { get: () => fruit, getChildren: () => [] }, {}, { getScore: () => 0 }, mode);
  manager.running = true;
  manager.gravite = () => 100;
  manager.isFrenzyOnStage = () => false;
  manager.spawnDelugeBurst = () => {};
  manager.computeSideLaunch = () => ({ x: 0, y: 0, velocityX: 0, velocityY: 0 });
  return { manager, scene, callbacks, gels: () => gels };
}
for (const mode of ['classic', 'chrono', 'daily']) {
  test(`cyclone: gel only in chrono (${mode})`, () => {
    const s = setup(mode);
    s.manager.delugeUntil = s.scene.time.now + 6000;
    s.manager.lastSpecialAt = s.scene.time.now;
    s.manager.spawnWave();
    assert.equal(s.gels(), mode === 'chrono' ? 1 : 0);
    s.manager.spawnWave();
    assert.equal(s.gels(), mode === 'chrono' ? 1 : 0, 'cooldown prevents repeat gel');
  });
}
for (const duringCyclone of [false, true]) {
  test(`pending ordinary launch, cyclone=${duringCyclone}`, () => {
    const s = setup('classic');
    let launches = 0;
    Object.assign(s.manager, { pickShape: () => 'duo', getWaveSize: () => 2, getBombCount: () => 0,
      spawnOne: () => launches++, maybeSpawnBonus() {}, maybeSpawnCyclone() {}, maybeSpawnFrenzy() {}, maybeSpawnGel() {} });
    s.manager.spawnWave();
    assert.equal(launches, 1);
    if (duringCyclone) s.manager.delugeUntil = s.scene.time.now + 6000;
    s.callbacks.forEach(fn => fn());
    assert.equal(launches, duringCyclone ? 1 : 2);
  });
}
test('gel respects spacing outside cyclone and its own cooldown inside cyclone', () => {
  const s = setup('chrono');
  s.manager.lastSpecialAt = s.scene.time.now;
  s.manager.maybeSpawnGel();
  assert.equal(s.gels(), 0);
  s.manager.delugeUntil = s.scene.time.now + 6000;
  s.manager.lastGelAt = s.scene.time.now - 5000;
  s.manager.maybeSpawnGel();
  assert.equal(s.gels(), 0);
});
test('pending launches remain blocked during post-cyclone calm and after stop', () => {
  for (const stopped of [false, true]) {
    const s = setup('classic');
    let launches = 0;
    Object.assign(s.manager, { pickShape: () => 'duo', getWaveSize: () => 2, getBombCount: () => 0,
      spawnOne: () => launches++, maybeSpawnBonus() {}, maybeSpawnCyclone() {}, maybeSpawnFrenzy() {}, maybeSpawnGel() {} });
    s.manager.spawnWave();
    if (stopped) s.manager.stop();
    else s.manager.delugeUntil = s.scene.time.now - 1000;
    s.callbacks.forEach(fn => fn());
    assert.equal(launches, 1);
  }
});
