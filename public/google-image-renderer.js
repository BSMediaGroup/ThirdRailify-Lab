const text = (value, max = 240) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function httpUrl(value, { httpsOnly = false } = {}) {
  try {
    const url = new URL(String(value ?? ''));
    if (url.username || url.password || (httpsOnly ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))) return '';
    return url.href;
  } catch {
    return '';
  }
}

const dimension = value => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

export function normalizeGoogleImageResult(value, binding, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Malformed Google image result.');
  const imageUrl = httpUrl(value.image?.url, { httpsOnly: true }) || httpUrl(value.url, { httpsOnly: true });
  const thumbnailUrl = httpUrl(value.thumbnailImage?.url, { httpsOnly: true });
  const contextUrl = httpUrl(value.contextUrl) || httpUrl(value.url);
  if (!imageUrl || !contextUrl) throw new TypeError('Google image result has no safe image and source URL.');
  const title = text(value.titleNoFormatting || value.title || 'Untitled image', 180) || 'Untitled image';
  return Object.freeze({
    resultId: `${binding.generation}:${index}`,
    accountId: binding.accountId,
    projectId: binding.projectId,
    searchInstance: binding.gname,
    generation: binding.generation,
    query: text(binding.query, 160),
    activityId: binding.activityId,
    title,
    titleNoFormatting: text(value.titleNoFormatting, 180) || null,
    url: httpUrl(value.url) || contextUrl,
    visibleUrl: text(value.visibleUrl, 240),
    contextUrl,
    fileFormat: text(value.fileFormat, 80) || null,
    image: Object.freeze({ url: imageUrl, width: dimension(value.image?.width), height: dimension(value.image?.height) }),
    thumbnailImage: Object.freeze({ url: thumbnailUrl, width: dimension(value.thumbnailImage?.width), height: dimension(value.thumbnailImage?.height) }),
    sourceHostname: new URL(contextUrl).hostname.replace(/^www\./, ''),
  });
}

export function normalizeGooglePromotion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Malformed Google promotion.');
  const url = httpUrl(value.url);
  if (!url) throw new TypeError('Google promotion has no safe destination.');
  const imageUrl = httpUrl(value.image?.url, { httpsOnly: true });
  return Object.freeze({
    title: text(value.title || 'Google promotion', 180),
    content: text(value.content, 300),
    url,
    visibleUrl: text(value.visibleUrl, 240),
    image: Object.freeze({ url: imageUrl, width: dimension(value.image?.width), height: dimension(value.image?.height) }),
  });
}

function icon(document, name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

function label(document, className, value) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = value;
  return node;
}

function imageWithFallback(document, item, card) {
  const preview = document.createElement('div');
  preview.className = 'image-result-preview';
  const image = document.createElement('img');
  image.alt = item.title;
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.src = item.thumbnailImage.url || item.image.url;
  const fallback = document.createElement('span');
  fallback.className = 'image-fallback';
  fallback.hidden = true;
  fallback.append(icon(document, 'image'), document.createTextNode('Preview unavailable'));
  image.addEventListener('error', () => {
    if (image.src !== item.image.url && item.image.url) {
      image.src = item.image.url;
      return;
    }
    image.hidden = true;
    fallback.hidden = false;
    card.classList.add('thumbnail-failed');
  });
  preview.append(image, fallback);
  return preview;
}

function selectCard(root, card) {
  for (const node of root.querySelectorAll('.google-image-result[aria-selected="true"]')) node.setAttribute('aria-selected', 'false');
  card.setAttribute('aria-selected', 'true');
}

function resultCard(document, root, item, onAction) {
  const card = document.createElement('article');
  card.className = 'image-result-card google-image-result';
  card.setAttribute('role', 'option');
  card.setAttribute('aria-selected', 'false');
  card.dataset.googleResultId = item.resultId;
  const preview = imageWithFallback(document, item, card);
  preview.tabIndex = 0;
  preview.setAttribute('aria-label', `Select ${item.title}`);
  preview.addEventListener('click', () => selectCard(root, card));
  preview.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectCard(root, card);
    }
  });

  const copy = document.createElement('div');
  copy.className = 'image-result-copy';
  const title = document.createElement('strong');
  title.textContent = item.title;
  title.title = item.title;
  const source = label(document, 'google-result-source', item.sourceHostname || item.visibleUrl || 'Source page');
  source.prepend(icon(document, 'globe'));
  const facts = [];
  if (item.image.width && item.image.height) facts.push(`${item.image.width} × ${item.image.height}`);
  if (item.fileFormat) facts.push(item.fileFormat.replace(/^image\//i, '').toUpperCase());
  copy.append(title, source);
  if (facts.length) copy.append(label(document, 'google-result-facts', facts.join(' · ')));

  const actions = document.createElement('div');
  actions.className = 'image-result-actions google-result-actions';
  const actionSpecs = [['chat', 'chat', 'ADD TO CHAT'], ['generator', 'image', 'REFERENCE'], ['compose', 'layers', 'COMPOSE']];
  for (const [destination, iconName, actionLabel] of actionSpecs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.imageAction = destination;
    button.dataset.googleResultId = item.resultId;
    button.append(icon(document, iconName), document.createTextNode(actionLabel));
    button.addEventListener('click', () => {
      selectCard(root, card);
      onAction(item.resultId, destination, button);
    });
    actions.append(button);
  }
  const sourceLink = document.createElement('a');
  sourceLink.href = item.contextUrl;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.dataset.googleResultId = item.resultId;
  sourceLink.append(icon(document, 'external'), document.createTextNode('SOURCE'));
  sourceLink.addEventListener('click', () => selectCard(root, card));
  actions.append(sourceLink);
  card.append(preview, copy, actions);
  return card;
}

function promotionCard(document, promotion) {
  const link = document.createElement('a');
  link.className = 'google-promotion-card';
  link.href = promotion.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer sponsored';
  if (promotion.image.url) {
    const image = document.createElement('img');
    image.src = promotion.image.url;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove());
    link.append(image);
  }
  const copy = document.createElement('span');
  copy.className = 'google-promotion-copy';
  copy.append(label(document, 'google-promotion-label', 'PROMOTED'), label(document, 'google-promotion-title', promotion.title));
  if (promotion.content) copy.append(label(document, 'google-promotion-content', promotion.content));
  if (promotion.visibleUrl) copy.append(label(document, 'google-promotion-source', promotion.visibleUrl));
  link.append(copy);
  return link;
}

export function renderGoogleImageResults({ resultsDiv, promos, results, binding, onAction }) {
  if (!resultsDiv?.ownerDocument || typeof onAction !== 'function') throw new TypeError('Google result renderer requires a destination and action handler.');
  const promotionValues = promos == null ? [] : promos;
  const resultValues = results == null ? [] : results;
  if (!Array.isArray(promotionValues) || !Array.isArray(resultValues)) throw new TypeError('Google returned malformed result collections.');
  const document = resultsDiv.ownerDocument;
  const normalizedPromos = [];
  for (const promo of promotionValues) {
    try { normalizedPromos.push(normalizeGooglePromotion(promo)); } catch { /* Invalid remote promotion is not rendered. */ }
  }
  const items = [];
  for (const result of resultValues) {
    try { items.push(normalizeGoogleImageResult(result, binding, items.length)); } catch { /* Invalid remote result is not rendered. */ }
  }
  const fragment = document.createDocumentFragment();
  if (normalizedPromos.length) {
    const promotionRegion = document.createElement('section');
    promotionRegion.className = 'google-promotions';
    promotionRegion.setAttribute('aria-label', 'Google promotions');
    for (const promo of normalizedPromos) promotionRegion.append(promotionCard(document, promo));
    fragment.append(promotionRegion);
  }
  if (items.length) {
    const root = document.createElement('div');
    root.className = 'image-results google-image-results';
    root.setAttribute('role', 'listbox');
    root.setAttribute('aria-label', `Google Images results for ${binding.query}`);
    for (const item of items) root.append(resultCard(document, root, item, onAction));
    fragment.append(root);
  }
  resultsDiv.replaceChildren(fragment);
  return { items, promotions: normalizedPromos };
}
