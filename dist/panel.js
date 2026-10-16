/* Local intake only. No credentials, images or receipts are written to browser storage. */
const $ = selector => document.querySelector(selector);
let selectedImage = null, previewUrl = null, receipt = null, editorKey = '';
const reviewImageUrls = [];
async function api(route, { method = 'GET', data, editor = false } = {}) {
  const response = await fetch(`/api/panel/${route}`, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(editor ? { Authorization: `Bearer ${editorKey}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The local request failed.');
  return result;
}
function node(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; }
function message(id, text, error = false) { const el = $(id); el.textContent = text; el.className = error ? 'error' : 'success'; }
function downloadReceipt() {
  if (!receipt) return;
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = `fashion-atlas-withdrawal-${receipt.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#download-receipt').addEventListener('click', downloadReceipt);
document.querySelector('[name=capturedAt]').max = new Date().toISOString().slice(0, 10);
$('#image').addEventListener('change', async event => {
  selectedImage = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  $('#preview').hidden = true;
  const file = event.target.files[0]; if (!file) return;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP up to 8 MB.');
    const decoded = await createImageBitmap(file); decoded.close();
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    selectedImage = { mime: file.type, base64 }; previewUrl = URL.createObjectURL(file); $('#preview').src = previewUrl; $('#preview').hidden = false;
    message('#submission-message', 'Image selected. It has not left this browser.');
  } catch (error) { event.target.value = ''; message('#submission-message', error.message || 'The image could not be decoded.', true); }
});
document.querySelector('[name=license]').addEventListener('change', event => { const needed = event.target.value === 'written-permission'; $('#permission-reference').hidden = !needed; document.querySelector('[name=permissionReference]').required = needed; });
$('#submission-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedImage) return message('#submission-message', 'Select a valid image first.', true);
  const form = new FormData(event.target), data = Object.fromEntries(form.entries());
  for (const key of ['allowAnalysis', 'allowDisplay', 'rightsConfirmed', 'subjectConsentConfirmed']) data[key] = form.has(key);
  data.tags = form.getAll('tags'); data.image = selectedImage;
  const button = event.target.querySelector('button[type=submit]'); button.disabled = true;
  try {
    const result = await api('submissions', { method: 'POST', data });
    receipt = { ...result, purpose: 'Private withdrawal receipt. Keep the key confidential.', localEndpoint: location.origin, createdAt: new Date().toISOString() };
    $('#receipt-text').textContent = `Submission: ${result.id}\nWithdrawal key: ${result.withdrawalToken}`; $('#receipt').hidden = false;
    message('#submission-message', 'Saved privately. An editor must review this photograph before it can count toward panel signals.');
    event.target.reset(); selectedImage = null; $('#preview').hidden = true; if (previewUrl) URL.revokeObjectURL(previewUrl);
    $('#permission-reference').hidden = true; document.querySelector('[name=permissionReference]').required = false;
    $('#receipt').scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (error) { message('#submission-message', error.message, true); }
  finally { button.disabled = false; }
});
async function loadAggregates() {
  const result = await api('aggregates'), output = $('#aggregate-output'); output.replaceChildren();
  output.append(node('p', 'Human-tagged / editor-reviewed', 'eyebrow'));
  if (!result.groups.length) { output.append(node('h3', 'The pattern is still a question.'), node('p', 'No cell meets the minimum independent-source threshold. Pending, rejected and withdrawn contributions do not count.')); return; }
  for (const group of result.groups) { const item = node('article', '', 'signal'); item.append(node('strong', group.tag.replaceAll('-', ' ')), node('p', `${group.city} / ${group.scene} / ${group.month}`), node('small', `${group.independent_sources} independent sources · ${group.observation_count} observations · contributed panel only`)); output.append(item); }
}
$('#withdraw-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = new FormData(event.target), id = form.get('id').trim();
  try { await api(`submissions/${encodeURIComponent(id)}/withdraw`, { method: 'POST', data: { token: form.get('token').trim() } }); message('#withdraw-message', 'Withdrawn. The original and contribution metadata were erased from the active local store.'); event.target.reset(); await loadAggregates(); if (editorKey) await loadQueue(); }
  catch (error) { message('#withdraw-message', error.message, true); }
});
async function loadQueue() {
  const result = await api('review', { editor: true }), queue = $('#review-queue'); queue.replaceChildren();
  reviewImageUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  message('#editor-message', `${result.submissions.length} private contribution(s). Approval affects aggregates only.`);
  for (const record of result.submissions) {
    const card = node('article', '', 'review-card'); card.append(node('p', record.state, 'eyebrow'), node('h3', `${record.city} / ${record.scene}`));
    card.append(node('p', `${record.captured_at} · ${record.tags.join(', ')} · ${record.tag_method}`));
    const source = node('a', 'Open provenance ↗'); source.href = record.source_url; source.target = '_blank'; source.rel = 'noopener noreferrer'; card.append(source);
    card.append(node('p', `Rights: ${record.rights_holder} / ${record.license}. Analysis: ${record.permissions.analysis ? 'yes' : 'no'}. Display: ${record.permissions.display ? 'yes' : 'no'}.`));
    if (record.permission_reference) card.append(node('p', `Permission reference: ${record.permission_reference}`));
    card.append(node('p', `Source group: ${record.source_group_key}`));
    const previewButton = node('button', 'Inspect private original', 'secondary'); previewButton.type = 'button';
    previewButton.addEventListener('click', async () => {
      try { const response = await fetch(`/api/panel/submissions/${record.id}/image`, { headers: { Authorization: `Bearer ${editorKey}` } }); if (!response.ok) throw new Error('Could not load private image.'); const url = URL.createObjectURL(await response.blob()); reviewImageUrls.push(url); const img = node('img'); img.src = url; img.alt = 'Private contribution for editorial review'; previewButton.replaceWith(img); }
      catch (error) { message('#editor-message', error.message, true); }
    }); card.append(previewButton);
    const form = node('form'), label = node('label', 'Review note'), input = node('input'); input.required = true; input.maxLength = 1000; input.value = record.review?.note || ''; label.append(input); form.append(label);
    const checkLabel = node('label', '', 'check'), check = node('input'); check.type = 'checkbox'; checkLabel.append(check, node('span', 'I verified provenance, permissions and independent-source grouping.')); form.append(checkLabel);
    const actions = node('div', '', 'actions'), approve = node('button', 'Approve', 'secondary'), reject = node('button', 'Reject', 'secondary'); approve.value = 'approved'; reject.value = 'rejected'; actions.append(approve, reject); form.append(actions);
    form.addEventListener('submit', async event => { event.preventDefault(); const decision = event.submitter.value; try { await api(`submissions/${record.id}/review`, { method: 'POST', editor: true, data: { decision, note: input.value, independentSourceConfirmed: check.checked } }); await loadQueue(); await loadAggregates(); } catch (error) { message('#editor-message', error.message, true); } });
    card.append(form); queue.append(card);
  }
}
$('#editor-form').addEventListener('submit', async event => { event.preventDefault(); editorKey = $('#editor-key').value.trim(); try { await loadQueue(); $('#editor-key').value = ''; } catch (error) { editorKey = ''; message('#editor-message', error.message, true); } });
(async () => {
  try {
    if (location.protocol === 'file:') throw new Error('Static preview');
    const status = await api('status'); if (status.mode !== 'local-private') throw new Error('Local endpoint required');
    $('#connection').textContent = 'Local intake connected'; $('#connection').classList.add('connected'); $('#intake-fields').disabled = false;
    for (const tag of status.tags) { const label = node('label'), input = node('input'); input.type = 'checkbox'; input.name = 'tags'; input.value = tag; label.append(input, node('span', tag.replaceAll('-', ' '))); $('#tags').append(label); }
    await loadAggregates();
  } catch { $('#offline-note').hidden = false; $('#connection').textContent = 'Static preview / intake offline'; }
})();
