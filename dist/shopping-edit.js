let catalogRequest;
const shopping = document.querySelector('#shopping-edit');
const productGrid = document.querySelector('#edit-grid');
const shoppingLink = document.querySelector('#shopping-link');

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function secureUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function catalogState(title, description, loading = false) {
  const state = node('div', 'edit-status' + (loading ? ' edit-loading' : ''));
  state.append(node('strong', '', title), node('p', '', description));
  productGrid.replaceChildren(state);
  return state;
}
function productCard(product, index) {
  if (!secureUrl(product.image) || !secureUrl(product.url)) return null;
  const card = node('a', 'edit-card');
  card.href = secureUrl(product.url); card.target = '_blank'; card.rel = 'noopener noreferrer';
  const top = node('div', 'edit-card-top');
  top.append(node('span', '', product.label), node('b', '', '0' + (index + 1)));
  const photo = node('div', 'edit-photo'), img = node('img');
  img.src = secureUrl(product.image); img.alt = product.imageAlt || product.title;
  img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
  img.addEventListener('error', () => { img.remove(); card.classList.add('image-missing'); });
  photo.append(img);
  const copy = node('div', 'edit-card-copy'), description = node('div');
  description.append(node('h4', '', product.title), node('div', 'edit-merchant', 'Shop ' + product.merchant + ' ↗'));
  const arrow = node('span', 'edit-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
  copy.append(description, arrow); card.append(top, photo, copy);
  return card;
}
async function loadShoppingEdit() {
  catalogRequest?.abort();
  catalogRequest = new AbortController();
  const activeRequest = catalogRequest;
  catalogState('Finding the objects.', 'Fresh photographs, straight from the shops.', true);
  productGrid.setAttribute('aria-busy', 'true');
  try {
    if (location.protocol === 'file:') throw Error('local-server');
    const response = await fetch('/api/catalog?edit=fogline-utility', { cache: 'no-store', signal: activeRequest.signal });
    if (!response.ok) throw Error('unavailable');
    const data = await response.json();
    const cards = (Array.isArray(data.products) ? data.products : []).map(productCard).filter(Boolean);
    if (!cards.length) throw Error('empty');
    if (activeRequest !== catalogRequest) return;
    productGrid.replaceChildren(...cards);
    document.querySelector('#edit-freshness').textContent = 'Original merchant photography / selected for this study';
  } catch (error) {
    if (activeRequest.signal.aborted) return;
    const state = catalogState('The edit is between arrivals.', 'The live catalogue is unavailable here. Open the local Atlas app to explore current merchant photographs.');
    if (location.protocol === 'file:' || !['localhost', '127.0.0.1'].includes(location.hostname)) {
      const link = node('a', '', 'Run the Atlas ↗'); link.href = 'https://github.com/zalassandra/fashion-atlas#run-the-atlas'; state.append(link);
    } else {
      const retry = node('button', '', 'Try the catalogue again ↗'); retry.type = 'button'; retry.onclick = loadShoppingEdit; state.append(retry);
    }
  } finally { if (activeRequest === catalogRequest) productGrid.removeAttribute('aria-busy'); }
}
window.showShoppingEdit = key => {
  catalogRequest?.abort(); productGrid.replaceChildren();
  shopping.hidden = key !== 'sf'; shoppingLink.hidden = key !== 'sf';
  if (key === 'sf') loadShoppingEdit();
};
document.querySelector('#study-dialog').addEventListener('close', () => {
  catalogRequest?.abort(); productGrid.replaceChildren();
  document.body.style.overflow = '';
});
