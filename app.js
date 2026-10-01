const STORAGE_KEYS = {
  products: 'dojiye_products',
  cart: 'dojiye_cart',
  wishlist: 'dojiye_wishlist',
  adminAuth: 'dojiye_admin_auth'
};

const defaultProducts = [
  { id: 'prod_1', name: 'Nesquik Chocolate 400g', category: 'Snacks', price: 120, oldPrice: 150, stock: 15, image: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=500&q=80', rating: 4.5 },
  { id: 'prod_2', name: 'Coca Cola 1.5L', category: 'Drinks', price: 35, oldPrice: 40, stock: 3, image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=500&q=80', rating: 5 },
  { id: 'prod_3', name: 'Sunlight Detergent 2kg', category: 'Food', price: 180, oldPrice: 200, stock: 4, image: 'https://images.unsplash.com/photo-1585842378054-ee2e52f94ba2?auto=format&fit=crop&w=500&q=80', rating: 4 },
  { id: 'prod_4', name: 'Nivea Body Lotion 400ml', category: 'Cosmetics', price: 95, oldPrice: 110, stock: 2, image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=500&q=80', rating: 4.2 },
  { id: 'prod_5', name: 'Basmati Rice 5kg', category: 'Food', price: 250, oldPrice: 280, stock: 8, image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80', rating: 4.8 },
  { id: 'prod_6', name: 'Fresh Milk 1L', category: 'Drinks', price: 25, oldPrice: 30, stock: 20, image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=500&q=80', rating: 4.7 },
  { id: 'prod_7', name: 'Baby Diapers Size 4', category: 'Baby Care', price: 320, oldPrice: 350, stock: 12, image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=500&q=80', rating: 4.9 },
  { id: 'prod_8', name: 'Wireless Bluetooth Earbuds', category: 'Electronics', price: 450, oldPrice: 550, stock: 6, image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=500&q=80', rating: 4.3 }
];

const state = {
  products: load(STORAGE_KEYS.products, defaultProducts),
  cart: load(STORAGE_KEYS.cart, []),
  wishlist: load(STORAGE_KEYS.wishlist, [])
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatMoney(value) {
  return `${Number(value).toLocaleString()} ETB`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function getCategoryOptions() {
  const set = new Set(state.products.map(item => item.category));
  return [...set];
}

function renderCategoryOptions() {
  const select = document.getElementById('categoryFilter');
  if (!select) return;
  const options = ['<option value="all">All Categories</option>']
    .concat(getCategoryOptions().map(cat => `<option value="${cat}">${cat}</option>`));
  select.innerHTML = options.join('');
}

function getFilteredProducts() {
  const search = document.getElementById('searchInput')?.value?.trim().toLowerCase() || '';
  const category = document.getElementById('categoryFilter')?.value || 'all';
  const discountOnly = document.getElementById('discountOnly')?.checked || false;
  const sort = document.getElementById('sortFilter')?.value || 'default';

  let products = [...state.products];

  if (search) {
    products = products.filter(item => [item.name, item.category].join(' ').toLowerCase().includes(search));
  }

  if (category !== 'all') {
    products = products.filter(item => item.category === category);
  }

  if (discountOnly) {
    products = products.filter(item => Number(item.oldPrice) > Number(item.price));
  }

  if (sort === 'price-asc') products.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') products.sort((a, b) => b.price - a.price);
  if (sort === 'rating') products.sort((a, b) => b.rating - a.rating);

  return products;
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const products = getFilteredProducts();
  if (!products.length) {
    grid.innerHTML = '<div class="empty-state">No products match your filter.</div>';
    return;
  }

  grid.innerHTML = products.map(product => {
    const discount = Number(product.oldPrice) > Number(product.price)
      ? Math.round(((Number(product.oldPrice) - Number(product.price)) / Number(product.oldPrice)) * 100)
      : 0;

    return `
      <article class="product-card">
        <img src="${product.image}" alt="${product.name}" />
        <div class="product-body">
          <div class="product-meta">
            <span>${product.category}</span>
            <span>⭐ ${product.rating}</span>
          </div>
          <h4>${product.name}</h4>
          <div class="product-price">
            <strong>${formatMoney(product.price)}</strong>
            ${product.oldPrice ? `<del>${formatMoney(product.oldPrice)}</del>` : ''}
          </div>
          ${discount ? `<span class="tag">-${discount}%</span>` : ''}
          <div class="product-actions">
            <button class="secondary-btn" data-action="wishlist" data-id="${product.id}">♡</button>
            <button class="primary-btn" data-action="cart" data-id="${product.id}">Add to Cart</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-action="cart"]').forEach(item => {
    item.addEventListener('click', () => addToCart(item.dataset.id));
  });

  document.querySelectorAll('[data-action="wishlist"]').forEach(item => {
    item.addEventListener('click', () => toggleWishlist(item.dataset.id));
  });
}

function addToCart(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ ...product, qty: 1 });
  }

  save(STORAGE_KEYS.cart, state.cart);
  updateCartUI();
  showToast(`${product.name} added to cart`);
}

function updateCartUI() {
  const cartCount = document.getElementById('cartCount');
  const subtotalEl = document.getElementById('subtotal');
  const cartItems = document.getElementById('cartItems');
  const panel = document.getElementById('cartPanel');

  const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);
  if (cartCount) cartCount.textContent = totalItems;

  if (subtotalEl) {
    const subtotal = state.cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0);
    subtotalEl.textContent = formatMoney(subtotal);
  }

  if (cartItems) {
    if (!state.cart.length) {
      cartItems.innerHTML = '<p class="empty-state">Your cart is empty.</p>';
      return;
    }

    cartItems.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}" />
        <div>
          <strong>${item.name}</strong>
          <small>${formatMoney(item.price)}</small>
          <div class="qty-wrap">
            <button data-qty="minus" data-id="${item.id}">-</button>
            <span>${item.qty}</span>
            <button data-qty="plus" data-id="${item.id}">+</button>
          </div>
        </div>
        <strong>${formatMoney(item.price * item.qty)}</strong>
      </div>
    `).join('');

    cartItems.querySelectorAll('[data-qty]').forEach(btn => {
      btn.addEventListener('click', () => changeQty(btn.dataset.id, btn.dataset.qty));
    });
  }

  if (panel && state.cart.length > 0) panel.classList.add('open');
}

function changeQty(productId, action) {
  const item = state.cart.find(entry => entry.id === productId);
  if (!item) return;

  if (action === 'plus') item.qty += 1;
  if (action === 'minus') item.qty -= 1;

  if (item.qty <= 0) {
    state.cart = state.cart.filter(entry => entry.id !== productId);
  }

  save(STORAGE_KEYS.cart, state.cart);
  updateCartUI();
}

function toggleWishlist(productId) {
  if (state.wishlist.includes(productId)) {
    state.wishlist = state.wishlist.filter(id => id !== productId);
  } else {
    state.wishlist.push(productId);
  }

  save(STORAGE_KEYS.wishlist, state.wishlist);
  document.getElementById('wishlistCount').textContent = state.wishlist.length;
  showToast('Wishlist updated');
}

function initStorePage() {
  renderCategoryOptions();
  renderProducts();
  updateCartUI();
  document.getElementById('wishlistCount').textContent = state.wishlist.length;

  document.getElementById('searchInput').addEventListener('input', renderProducts);
  document.getElementById('categoryFilter').addEventListener('change', renderProducts);
  document.getElementById('sortFilter').addEventListener('change', renderProducts);
  document.getElementById('discountOnly').addEventListener('change', renderProducts);

  document.getElementById('shopNowBtn').addEventListener('click', () => {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelector('.cart-button').addEventListener('click', () => {
    const panel = document.getElementById('cartPanel');
    panel.classList.toggle('open');
  });

  document.getElementById('closeCart').addEventListener('click', () => {
    document.getElementById('cartPanel').classList.remove('open');
  });

  document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (!state.cart.length) {
      showToast('Your cart is empty');
      return;
    }
    showToast('Checkout started');
  });
}

function initAdminPage() {
  const loginView = document.getElementById('loginView');
  const adminView = document.getElementById('adminView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  const isAuthenticated = localStorage.getItem(STORAGE_KEYS.adminAuth) === 'true';
  if (isAuthenticated) {
    loginView.classList.add('hidden');
    adminView.classList.remove('hidden');
    renderAdminProducts();
  }

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (email === 'khadarqadafi@gmail.com' && password === 'Dojiye@2026!') {
      localStorage.setItem(STORAGE_KEYS.adminAuth, 'true');
      loginView.classList.add('hidden');
      adminView.classList.remove('hidden');
      renderAdminProducts();
      loginError.textContent = '';
      return;
    }

    loginError.textContent = 'Email ama password-ka waa khalad.';
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.adminAuth);
    loginView.classList.remove('hidden');
    adminView.classList.add('hidden');
  });

  document.getElementById('productForm').addEventListener('submit', event => {
    event.preventDefault();
    const product = {
      id: `prod_${Date.now()}`,
      name: document.getElementById('productName').value.trim(),
      category: document.getElementById('productCategory').value.trim(),
      price: Number(document.getElementById('productPrice').value),
      oldPrice: Number(document.getElementById('productPrice').value) + 20,
      stock: Number(document.getElementById('productStock').value),
      image: document.getElementById('productImage').value.trim(),
      rating: 4.5
    };

    state.products.push(product);
    save(STORAGE_KEYS.products, state.products);
    renderAdminProducts();
    renderProducts();
    renderCategoryOptions();
    event.target.reset();
    showToast('Product added');
  });
}

function renderAdminProducts() {
  const target = document.getElementById('adminProducts');
  if (!target) return;

  target.innerHTML = state.products.map(product => `
    <div class="admin-product-item">
      <img src="${product.image}" alt="${product.name}" />
      <div>
        <strong>${product.name}</strong><br />
        <small>${product.category} • ${formatMoney(product.price)}</small>
      </div>
      <button class="secondary-btn" data-admin-delete="${product.id}">Delete</button>
    </div>
  `).join('');

  target.querySelectorAll('[data-admin-delete]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.adminDelete;
      state.products = state.products.filter(item => item.id !== id);
      save(STORAGE_KEYS.products, state.products);
      renderAdminProducts();
      renderProducts();
      renderCategoryOptions();
      showToast('Product deleted');
    });
  });
}

if (document.body.classList.contains('admin-body')) {
  initAdminPage();
} else {
  initStorePage();
}
