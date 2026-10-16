import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPanelStore, validateSubmission } from '../lib/panel/store.mjs';
import { createPanelServer } from '../scripts/panel-server.mjs';

// Synthetic test fixture, no photographs or people's data.
function submission(index = 0, overrides = {}) {
  const bytes = Buffer.alloc(40, index); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255; bytes[38] = 255; bytes[39] = 217;
  return { city: 'Test City', scene: 'Test scene', capturedAt: '2025-01-15', sourceUrl: 'https://example.org/photo/' + index,
    sourceGroup: 'Test source ' + index, rightsHolder: 'Test photographer', license: 'own-work',
    rightsConfirmed: true, subjectConsentConfirmed: true, allowAnalysis: true, allowDisplay: false,
    tags: ['backpack'], image: { mime: 'image/jpeg', base64: bytes.toString('base64') }, ...overrides };
}
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fashion-atlas-test-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  return {directory, store:createPanelStore(directory)};
}
test('rejects missing consent, false dates, unsafe provenance URLs and fake MIME signatures', () => {
  for (const change of [{rightsConfirmed:false}, {subjectConsentConfirmed:false}, {allowAnalysis:false,allowDisplay:false},
    {capturedAt:'2025-02-30'}, {sourceUrl:'javascript:alert(1)'}, {image:{mime:'image/png',base64:submission().image.base64}}]) {
    assert.throws(()=>validateSubmission(submission(0,change)));
  }
});
test('saves a private pending contribution, deduplicates and erases on withdrawal', async t => {
  const {store,directory}=await fixture(t), receipt=await store.submit(submission());
  assert.equal(receipt.state,'pending');
  const listing=await store.list(); assert.equal(listing.length,1);
  assert.equal(JSON.stringify(listing).includes(receipt.withdrawalToken),false);
  assert.equal(listing[0].image_path,undefined);
  await assert.rejects(store.submit(submission()),{status:409});
  assert.deepEqual((await store.aggregates()).groups,[]);
  await assert.rejects(store.withdraw(receipt.id,'wrong'),{status:403});
  await store.withdraw(receipt.id,receipt.withdrawalToken);
  assert.deepEqual(await readdir(path.join(directory,'originals')),[]);
  assert.deepEqual(await store.list(),[]);
  assert.equal((await readFile(path.join(directory,'submissions.json'),'utf8')).includes('Test photographer'),false);
  await assert.rejects(store.submit(submission()),{status:409});
});
test('aggregates require three distinct approved sources and analysis permission', async t => {
  const {store}=await fixture(t);
  const approve=id=>store.review(id,{decision:'approved',note:'Test provenance verified',independentSourceConfirmed:true});
  const a=await store.submit(submission(1)); await approve(a.id);
  const b=await store.submit(submission(2,{sourceGroup:'Test source 1'})); await approve(b.id);
  const c=await store.submit(submission(3)); await approve(c.id);
  assert.deepEqual((await store.aggregates()).groups,[]);
  const displayOnly=await store.submit(submission(4,{allowAnalysis:false,allowDisplay:true})); await approve(displayOnly.id);
  assert.deepEqual((await store.aggregates()).groups,[]);
  const d=await store.submit(submission(5));
  await assert.rejects(store.review(d.id,{decision:'approved',note:'Test'}));
  await approve(d.id);
  const groups=(await store.aggregates()).groups;
  assert.equal(groups.length,1); assert.equal(groups[0].independent_sources,3); assert.equal(groups[0].observation_count,4);
  await store.withdraw(d.id,d.withdrawalToken);
  assert.deepEqual((await store.aggregates()).groups,[]);
});
test('concurrent intake is serialized without losing observations', async t => {
  const {store}=await fixture(t);
  await Promise.all(Array.from({length:8},(_,i)=>store.submit(submission(i))));
  assert.equal((await store.list()).length,8);
});
test('HTTP intake enforces origin and editor authorization, and serves the actual gallery', async t => {
  const {directory}=await fixture(t);
  const {server}=createPanelServer({dataDirectory:directory,editorToken:'test-only-editor-key-00000000000000'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const page=await fetch(origin); assert.equal(page.status,200); assert.match(await page.text(),/shopping-edit/);
  assert.equal((await fetch(origin+'/api/panel/review')).status,401);
  assert.equal((await fetch(origin+'/api/panel/status',{headers:{Origin:'https://outside.example'}})).status,403);
  const blocked=await fetch(origin+'/api/panel/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission())});
  assert.equal(blocked.status,403);
  const added=await fetch(origin+'/api/panel/submissions',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(submission())});
  assert.equal(added.status,201);
  const receipt=await added.json();
  const review=await fetch(origin+'/api/panel/review',{headers:{Authorization:'Bearer test-only-editor-key-00000000000000'}});
  assert.equal(review.status,200); assert.equal((await review.json()).submissions.length,1);
  assert.equal((await fetch(origin+'/api/panel/submissions/'+receipt.id+'/image')).status,401);
  assert.equal((await fetch(origin+'/.private/visual-panel/submissions.json')).status,404);
});
