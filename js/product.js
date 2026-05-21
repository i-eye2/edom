let __pdProduct = null;
let __pdIndex = 0;
let __pdTouchStartX = 0;
let __pdSelectedSize = '';
let __pdZonesCfg = null;
let __pdShipFree = 2000;

function pdLoadSlideImage(idx) {
  const img = document.querySelector(`.pd-gallery-slide[data-i="${idx}"] img[data-src]`);
  if (!img) return;
  const src = img.getAttribute('data-src');
  if (!src) return;
  img.setAttribute('src', src);
  img.removeAttribute('data-src');
}

function pdFillAreas() {
  const gsel = document.getElementById('pdGov');
  const asel = document.getElementById('pdArea');
  if (!gsel || !asel) return;
  const z = (__pdZonesCfg.zones || []).find((x) => String(x.id) === String(gsel.value));
  const areas = z && Array.isArray(z.areas) ? z.areas : [];
  asel.innerHTML = areas
    .map((a) => `<option value="${escapeHtml(String(a.id))}">${escapeHtml(a.name || a.id)}</option>`)
    .join('');
}

function pdSyncShipDisplay() {
  const priceEl = document.getElementById('pdShipPrice');
  const noteEl = document.getElementById('pdShipNote');
  if (!priceEl || !__pdProduct) return;
  const gsel = document.getElementById('pdGov');
  const asel = document.getElementById('pdArea');
  const govId = gsel && gsel.value ? gsel.value : '';
  const areaId = asel && asel.value ? asel.value : '';
  const baseShip = computeShippingEgpForLocation(__pdZonesCfg || { zones: [], defaultShippingEgp: 150 }, govId, areaId);
  const sub = Number(__pdProduct.price) || 0;
  const ship = sub >= __pdShipFree ? 0 : baseShip;
  priceEl.textContent = ship === 0 ? 'Free' : formatPrice(ship);
  if (noteEl) {
    if (sub >= __pdShipFree && baseShip > 0) {
      noteEl.textContent = `Zone rate ${formatPrice(baseShip)} — waived: single-item price over ${formatPrice(__pdShipFree)} (full cart rules apply at checkout).`;
    } else if (sub >= __pdShipFree) {
      noteEl.textContent = 'Eligible for free-shipping threshold (checkout uses full cart total).';
    } else {
      noteEl.textContent = `Free shipping on orders over ${formatPrice(__pdShipFree)} (cart total). Zone rate shown above.`;
    }
  }
}

function findBestMatchingSize(height, weight, product) {
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const specs = product.sizeSpecs || {};
  
  for (const sz of sizes) {
    const sp = specs[sz];
    if (!sp) continue;
    
    let matchH = true;
    if (sp.min_height != null && height < sp.min_height) matchH = false;
    if (sp.max_height != null && height > sp.max_height) matchH = false;
    
    let matchW = true;
    if (sp.min_weight != null && weight < sp.min_weight) matchW = false;
    if (sp.max_weight != null && weight > sp.max_weight) matchW = false;
    
    if (matchH && matchW) {
      const st = stockForProductSize(product, sz);
      const available = Number.isFinite(st) && st > 0;
      return { size: sz, available };
    }
  }
  return null;
}

function findRecommendedProduct(height, weight, allProducts, currentProductId, currentCategoryId) {
  const candidates = allProducts.filter(p => p.id !== currentProductId);
  
  candidates.sort((a, b) => {
    const aSame = a.categoryId === currentCategoryId ? 1 : 0;
    const bSame = b.categoryId === currentCategoryId ? 1 : 0;
    return bSame - aSame;
  });
  
  for (const p of candidates) {
    const match = findBestMatchingSize(height, weight, p);
    if (match && match.available) {
      return { product: p, size: match.size };
    }
  }
  return null;
}

function openSizeGuideModal() {
  document.getElementById('sizeGuideOverlay')?.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'sizeGuideOverlay';
  overlay.className = 'modal-overlay-checkout open';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:20px;';
  
  overlay.innerHTML = `
    <div class="checkout-modal" style="max-width:440px;width:100%;background:var(--gray-100);border:1px solid var(--gray-200);padding:32px;position:relative">
      <h2 style="font-family:var(--font-serif);font-size:24px;margin-bottom:20px;color:var(--white)">Find My Size</h2>
      <button type="button" id="closeSizeGuideX" style="position:absolute;top:20px;right:20px;background:none;border:none;color:var(--gray-500);font-size:20px;cursor:pointer">✕</button>
      
      <div id="guideInputForm">
        <div class="form-row">
          <label style="display:block;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--gray-500);margin-bottom:8px">Height (cm)</label>
          <input type="number" id="guideHeight" placeholder="e.g. 175" class="form-input" style="width:100%;padding:12px;background:var(--black);border:1px solid var(--gray-200);color:var(--white)" required />
        </div>
        <div class="form-row" style="margin-top:16px">
          <label style="display:block;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--gray-500);margin-bottom:8px">Weight (kg)</label>
          <input type="number" id="guideWeight" placeholder="e.g. 75" class="form-input" style="width:100%;padding:12px;background:var(--black);border:1px solid var(--gray-200);color:var(--white)" required />
        </div>
        
        <div style="margin-top:24px;display:flex;gap:12px">
          <button type="button" class="btn btn-gold" id="btnCalculateGuide" style="flex:1">Calculate</button>
          <button type="button" class="btn btn-outline" id="btnCancelGuide" style="flex:1">Cancel</button>
        </div>
      </div>
      
      <div id="guideResults" style="display:none;margin-top:16px;text-align:center">
        <div id="guideResultsContent" style="font-size:14px;line-height:1.6;color:var(--white)"></div>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:center">
          <button type="button" class="btn btn-gold" id="btnGuideApply" style="display:none;width:100%">Select Size</button>
          <button type="button" class="btn btn-outline" id="btnGuideClose" style="width:100%">Close</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const close = () => overlay.remove();
  document.getElementById('closeSizeGuideX').onclick = close;
  document.getElementById('btnCancelGuide').onclick = close;
  document.getElementById('btnGuideClose').onclick = close;
  
  document.getElementById('btnCalculateGuide').onclick = () => {
    const hInput = document.getElementById('guideHeight');
    const wInput = document.getElementById('guideWeight');
    const h = Number(hInput.value);
    const w = Number(wInput.value);
    
    if (!h || h <= 0 || !w || w <= 0) {
      alert('Please enter valid height and weight.');
      return;
    }
    
    const match = findBestMatchingSize(h, w, __pdProduct);
    const formDiv = document.getElementById('guideInputForm');
    const resultsDiv = document.getElementById('guideResults');
    const contentDiv = document.getElementById('guideResultsContent');
    const applyBtn = document.getElementById('btnGuideApply');
    
    formDiv.style.display = 'none';
    resultsDiv.style.display = 'block';
    
    if (match && match.available) {
      contentDiv.innerHTML = `
        <div style="font-size:48px;color:var(--gold);font-family:var(--font-serif);margin-bottom:12px">${escapeHtml(match.size)}</div>
        <p>Based on your details, size <strong>${escapeHtml(match.size)}</strong> fits you best and is currently in stock!</p>
      `;
      applyBtn.style.display = 'block';
      applyBtn.onclick = () => {
        const sizeButtons = document.querySelectorAll('.pd-sizes .pd-size');
        let selectedBtn = null;
        sizeButtons.forEach(btn => {
          const btnText = btn.textContent.split(' ')[0];
          if (btnText === match.size) {
            selectedBtn = btn;
          }
        });
        if (selectedBtn) {
          selectedBtn.click();
        }
        close();
      };
    } else {
      let matchedSizeName = match ? match.size : null;
      let reason = matchedSizeName 
        ? `Size <strong>${escapeHtml(matchedSizeName)}</strong> is out of stock.`
        : `We couldn't find a matching size for this product.`;
      
      const rec = findRecommendedProduct(h, w, window.__pdAllProductsCache || [], __pdProduct.id, __pdProduct.categoryId);
      
      if (rec) {
        const href = productPublicHref(rec.product);
        contentDiv.innerHTML = `
          <div style="font-size:18px;color:#e8a0a0;margin-bottom:12px">⚠️ Size Unavailable</div>
          <p style="margin-bottom:16px">${reason}</p>
          <div style="border-top:1px solid var(--gray-200);padding-top:16px;margin-top:16px">
            <p style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Recommended for you</p>
            <div style="display:flex;align-items:center;gap:12px;background:var(--gray-50);padding:12px;border:1px solid var(--gray-200);text-align:left;cursor:pointer" onclick="location.href='${escapeHtml(href)}'">
              <img src="${escapeHtml(rec.product.image)}" style="width:48px;height:60px;object-fit:cover" />
              <div>
                <div style="font-family:var(--font-serif);font-size:15px;color:var(--white)">${escapeHtml(rec.product.name)}</div>
                <div style="font-size:12px;color:var(--gold)">Size ${escapeHtml(rec.size)} is available</div>
              </div>
            </div>
          </div>
        `;
      } else {
        contentDiv.innerHTML = `
          <div style="font-size:18px;color:#e8a0a0;margin-bottom:12px">⚠️ Size Unavailable</div>
          <p>${reason}</p>
          <p style="font-size:12px;color:var(--gray-500);margin-top:12px">No alternative products with matching sizes in stock were found.</p>
        `;
      }
      applyBtn.style.display = 'none';
    }
  };
}

function pdSyncBuyRow(selectedSize) {
  if (!__pdProduct) return;
  const st = stockForProductSize(__pdProduct, selectedSize);
  const out = !Number.isFinite(st) || st < 1;
  const av = document.getElementById('pdAvail');
  const addBtn = document.getElementById('pdAddCart');
  const pu = window.__pdUiCopy || {};
  if (av) {
    av.className = 'pd-availability ' + (out ? 'pd-availability-out' : 'pd-availability-in');
    av.textContent = out ? 'Currently unavailable in this size' : 'Available';
  }
  if (addBtn) {
    addBtn.disabled = out;
    addBtn.textContent = out ? 'Out of stock' : pu.addToCartLabel || 'Add to cart';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initLoader();
  const ok = await mountStandardShell('shop');
  if (!ok) return;

  const params = new URLSearchParams(location.search);
  const slugQ = params.get('slug');
  const idQ = params.get('id');
  if (!slugQ && !idQ) {
    location.href = 'shop.html';
    return;
  }

  const [productOne, hp, zonesCfg, shipFree, allProducts] = await Promise.all([
    EyeApi.fetchProductBySlugOrId({ slug: slugQ, id: idQ }),
    EyeApi.fetchHomepageJson(),
    EyeApi.fetchShippingZonesConfig(),
    EyeApi.fetchShippingFreeThresholdEgp(),
    EyeApi.fetchProducts()
  ]);
  window.__pdAllProductsCache = allProducts || [];
  __pdZonesCfg = zonesCfg || { zones: [], defaultShippingEgp: 150 };
  __pdShipFree = shipFree;
  const brandBadge = escapeHtml(hp?.brand?.productBadge || '');
  const pu = hp.product || {};
  window.__pdUiCopy = pu;

  __pdProduct = productOne;

  if (!__pdProduct) {
    document.getElementById('productRoot').innerHTML =
      '<p style="padding:120px 24px;text-align:center;font-family:var(--font-serif);font-size:28px;color:var(--gray-500)">Product not found</p>';
    return;
  }

  if (typeof EyeAnalytics !== 'undefined') {
    EyeAnalytics.trackProductView(__pdProduct.id, __pdProduct.name);
  }

  if (__pdProduct.slug && idQ && !slugQ) {
    try {
      const next = new URLSearchParams();
      next.set('slug', String(__pdProduct.slug).trim());
      history.replaceState({}, '', 'product.html?' + next.toString());
    } catch (_) {}
  }

  const sizes = Array.isArray(__pdProduct.sizes) ? __pdProduct.sizes : [];
  __pdSelectedSize = firstBuyableSize(__pdProduct);
  if (!__pdSelectedSize && sizes.length) __pdSelectedSize = sizes[0];

  const imgs = __pdProduct.images && __pdProduct.images.length ? __pdProduct.images : [__pdProduct.image].filter(Boolean);

  const metaBadge = __pdProduct.badge
    ? `<div class="pd-meta">${escapeHtml(__pdProduct.badge)}</div>`
    : brandBadge
      ? `<div class="pd-meta">${brandBadge}</div>`
      : '<div class="pd-meta"></div>';

  const zones = __pdZonesCfg.zones || [];

  document.getElementById('productRoot').innerHTML = `
    <div class="product-detail-grid">
      <div class="pd-left-col">
        <div class="pd-gallery ${imgs.length > 1 ? 'multi' : ''}" id="pdGallery">
          <div class="pd-gallery-track" id="pdTrack">
            ${imgs
              .map(
                (src, i) =>
                  `<div class="pd-gallery-slide" data-i="${i}"><img ${
                    i === 0 ? `src="${escapeHtml(src)}"` : `data-src="${escapeHtml(src)}"`
                  } alt="" loading="lazy" decoding="async" /></div>`
              )
              .join('')}
          </div>
          ${imgs.length > 1 ? `<button type="button" class="pd-arrow prev" id="pdPrev" aria-label="Previous image">‹</button>
          <button type="button" class="pd-arrow next" id="pdNext" aria-label="Next image">›</button>
          <div class="pd-dots" id="pdDots"></div>` : ''}
        </div>
        ${imgs.length > 1 ? `<div class="pd-thumbs" id="pdThumbs"></div>` : ''}
      </div>
      <div class="pd-info">
        ${metaBadge}
        <h1>${escapeHtml(__pdProduct.name)}</h1>
        <div class="pd-price">${
          __pdProduct.comparePrice
            ? `<span class="pd-price-old">${formatPrice(__pdProduct.comparePrice)}</span><span class="pd-price-new">${formatPrice(
                __pdProduct.price
              )}</span>`
            : formatPrice(__pdProduct.price)
        }</div>
        <p class="pd-desc">${escapeHtml(__pdProduct.description || '')}</p>
        <div class="pd-label">${escapeHtml(pu.selectSizeLabel || '')}</div>
        <div class="pd-sizes" id="pdSizes"></div>
        <button type="button" class="pd-size-guide-btn" id="pdSizeGuideBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><path d="M2 12h20"></path><path d="M20 12v-3"></path><path d="M16 12v-5"></path><path d="M12 12v-3"></path><path d="M8 12v-5"></path><path d="M4 12v-3"></path></svg>
          Find my size
        </button>
        <p class="pd-availability pd-availability-in" id="pdAvail">Available</p>
        <div class="pd-actions">
          <button type="button" class="btn btn-primary" id="pdAddCart">${escapeHtml(pu.addToCartLabel || '')}</button>
          <button type="button" class="btn btn-outline" id="pdWishlist">${escapeHtml(pu.wishlistLabel || '')}</button>
        </div>
        <a href="shop.html" class="pd-back">${escapeHtml(pu.backToShopLabel || '')}</a>
      </div>
    </div>
    <div class="pd-suggestions">
      <h2 class="pd-suggestions-title">You may also like</h2>
      <div class="pd-suggestions-grid" id="pdSuggestionsGrid"></div>
    </div>`;

  const sugGrid = document.getElementById('pdSuggestionsGrid');
  if (sugGrid && allProducts) {
    const suggestions = allProducts
      .filter(p => p.id !== __pdProduct.id && p.categoryId === __pdProduct.categoryId)
      .slice(0, 8);
    
    if (suggestions.length === 0) {
      document.querySelector('.pd-suggestions').style.display = 'none';
    } else {
      sugGrid.innerHTML = suggestions.map(p => {
        const href = productPublicHref(p);
        const out = !productHasBuyableStock(p);
        const priceHtml = p.comparePrice
          ? `<span class="product-price-old">${formatPrice(p.comparePrice)}</span><span class="product-price-new">${formatPrice(p.price)}</span>`
          : formatPrice(p.price);
        return `
          <div class="product-card" onclick="location.href='${escapeHtml(href)}'">
            <div class="product-img-wrap">
              <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" />
            </div>
            <div class="product-info">
              <div class="product-name">${escapeHtml(p.name)}</div>
              <div class="product-price">${priceHtml}</div>
            </div>
          </div>`;
      }).join('');
    }
  }

  const sizesEl = document.getElementById('pdSizes');
  sizes.forEach((s) => {
    const st = stockForProductSize(__pdProduct, s);
    const dead = !Number.isFinite(st) || st < 1;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pd-size' + (s === __pdSelectedSize ? ' selected' : '') + (dead ? ' pd-size-na' : '');
    b.textContent = dead ? `${s} (0)` : s;
    b.disabled = dead;
    if (!dead) {
      b.onclick = () => {
        __pdSelectedSize = s;
        sizesEl.querySelectorAll('.pd-size').forEach((x) => x.classList.toggle('selected', x === b));
        pdSyncBuyRow(__pdSelectedSize);
      };
    }
    sizesEl.appendChild(b);
  });

  pdSyncBuyRow(__pdSelectedSize);

  const guideBtn = document.getElementById('pdSizeGuideBtn');
  if (guideBtn) {
    guideBtn.onclick = () => openSizeGuideModal();
  }

  document.getElementById('pdAddCart').onclick = () => {
    if (!__pdSelectedSize) {
      showToast('Please select a size');
      return;
    }
    if (stockForProductSize(__pdProduct, __pdSelectedSize) < 1) return;
    Cart.add(__pdProduct, __pdSelectedSize);
  };

  await Wishlist.refresh();
  const wlBtn = document.getElementById('pdWishlist');
  const wlOn = () => Wishlist.has(__pdProduct.id);
  const syncWlLabel = () => {
    wlBtn.textContent = wlOn() ? pu.savedLabel || 'Saved' : pu.wishlistLabel || 'Wishlist';
  };
  syncWlLabel();
  wlBtn.onclick = async () => {
    await Wishlist.toggle(__pdProduct.id);
    syncWlLabel();
  };
  if (imgs.length > 1) {
    const track = document.getElementById('pdTrack');
    const dots = document.getElementById('pdDots');
    const thumbs = document.getElementById('pdThumbs');
    function goSlide(i) {
      const n = imgs.length;
      __pdIndex = ((i % n) + n) % n;
      track.style.transform = `translateX(-${__pdIndex * 100}%)`;
      pdLoadSlideImage(__pdIndex);
      pdLoadSlideImage(__pdIndex + 1);
      pdLoadSlideImage(__pdIndex - 1);
      dots.querySelectorAll('.pd-dot').forEach((dot, j) => dot.classList.toggle('active', j === __pdIndex));
      if (thumbs) {
        thumbs.querySelectorAll('.pd-thumb-btn').forEach((thumb, j) => {
          thumb.classList.toggle('active', j === __pdIndex);
        });
      }
    }
    imgs.forEach((src, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'pd-dot' + (i === 0 ? ' active' : '');
      d.onclick = () => goSlide(i);
      dots.appendChild(d);

      if (thumbs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pd-thumb-btn' + (i === 0 ? ' active' : '');
        btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
        btn.innerHTML = `<img src="${escapeHtml(src)}" alt="" />`;
        btn.onclick = () => goSlide(i);
        thumbs.appendChild(btn);
      }
    });
    document.getElementById('pdPrev').onclick = () => goSlide(__pdIndex - 1);
    document.getElementById('pdNext').onclick = () => goSlide(__pdIndex + 1);
    pdLoadSlideImage(0);
    pdLoadSlideImage(1);

    const g = document.getElementById('pdGallery');
    g.addEventListener(
      'touchstart',
      (e) => {
        __pdTouchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    g.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].screenX - __pdTouchStartX;
      if (dx < -40) goSlide(__pdIndex + 1);
      if (dx > 40) goSlide(__pdIndex - 1);
    });
  }
});
