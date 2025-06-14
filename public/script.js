(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const adminBody = document.getElementById('admin-body');
        const storeBody = document.getElementById('store-body');
        
        if (adminBody) {
            initAdminPanel(adminBody);
        }
        if (storeBody) {
            initStore(storeBody);
        }
    });
    
    // Utility Functions
    const Utils = {
        showToast: (message, type = 'success') => {
            const toast = document.getElementById('toast');
            if (!toast) return;
            toast.textContent = message;
            toast.className = `toast show ${type}`;
            setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
        },
        openModal: (modalId) => {
            document.getElementById(modalId)?.classList.remove('hidden');
            document.getElementById('modal-backdrop')?.classList.remove('hidden');
        },
        closeModal: (modalId) => {
            document.getElementById(modalId)?.classList.add('hidden');
            document.getElementById('modal-backdrop')?.classList.add('hidden');
        },
        formatCurrency: (value) => {
            if (typeof value !== 'number') value = 0;
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
        },
        cleanPhoneNumber: (phone) => {
            return phone.replace(/\D/g, '');
        }
    };

    // Shared Visuals Logic
    const applyGlobalSettings = (settings, bodyElement) => {
        bodyElement.classList.remove('theme-light', 'theme-dark');
        bodyElement.classList.add(`theme-${settings.theme || 'dark'}`);
        const font = settings.fontFamily || 'Poppins';
        const fontId = `dynamic-font-link-${bodyElement.id}`;
        const existingFontLink = document.getElementById(fontId);
        if (existingFontLink) existingFontLink.remove();
        const fontLink = document.createElement('link');
        fontLink.id = fontId;
        fontLink.rel = 'stylesheet';
        fontLink.href = `https://fonts.googleapis.com/css2?family=${font.replace(' ', '+')}:wght@300;400;500;600;700&display=swap`;
        document.head.appendChild(fontLink);
        bodyElement.style.setProperty('--font-family', `'${font}', sans-serif`);
    };

    // LocalStorage-based Data Source
    const LocalStorageDB = {
        getCollection: (name) => {
            return {
                subscribe: (callback) => {
                    const data = JSON.parse(localStorage.getItem(name) || '[]');
                    callback(data);
                    window.addEventListener('storageUpdate', (e) => {
                        if (e.detail.collection === name) {
                            callback(JSON.parse(localStorage.getItem(name) || '[]'));
                        }
                    });
                },
                create: async (data) => {
                    const collection = JSON.parse(localStorage.getItem(name) || '[]');
                    const id = Date.now().toString();
                    const newItem = { ...data, id, created_at: new Date().toISOString() };
                    collection.push(newItem);
                    localStorage.setItem(name, JSON.stringify(collection));
                    window.dispatchEvent(new CustomEvent('storageUpdate', { detail: { collection: name } }));
                    return newItem;
                },
                update: async (id, data) => {
                    const collection = JSON.parse(localStorage.getItem(name) || '[]');
                    const index = collection.findIndex(item => item.id == id);
                    if (index !== -1) {
                        collection[index] = { ...collection[index], ...data };
                        localStorage.setItem(name, JSON.stringify(collection));
                        window.dispatchEvent(new CustomEvent('storageUpdate', { detail: { collection: name } }));
                    }
                },
                delete: async (id) => {
                    const collection = JSON.parse(localStorage.getItem(name) || '[]');
                    const filtered = collection.filter(item => item.id != id);
                    localStorage.setItem(name, JSON.stringify(filtered));
                    window.dispatchEvent(new CustomEvent('storageUpdate', { detail: { collection: name } }));
                }
            };
        }
    };

    // Admin Panel Logic
    function initAdminPanel(adminBody) {
        const productsCollection = LocalStorageDB.getCollection('product_v3');
        const customersCollection = LocalStorageDB.getCollection('customer_v1');
        const settingsCollection = LocalStorageDB.getCollection('visualSetting_v2');
        const cashEventsCollection = LocalStorageDB.getCollection('cashEvent_v1');
        const salesCollection = LocalStorageDB.getCollection('sale_v1');

        let products = [];
        let customers = [];
        let visualSettings = null;
        let cashState = { isOpen: false, balance: 0, history: [] };
        let sales = [];
        let posCart = [];
        let productChartInstance, categoryChartInstance;
        let currentOrderFilter = 'all';

        // Authentication & Navigation
        const handleLogin = (e) => {
            e.preventDefault();
            if (document.getElementById('username').value === 'admin' && document.getElementById('password').value === 'admin') {
                sessionStorage.setItem('loggedIn', 'true');
                checkAuth();
            } else {
                const loginError = document.getElementById('login-error');
                loginError.textContent = 'Usuário ou senha inválidos.';
                setTimeout(() => { loginError.textContent = ''; }, 3000);
            }
        };

        const handleLogout = () => {
            sessionStorage.removeItem('loggedIn');
            checkAuth();
        };

        const checkAuth = () => {
            if (sessionStorage.getItem('loggedIn') === 'true') {
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('admin-panel').classList.remove('hidden');
                bindAdminSubscriptions();
            } else {
                document.getElementById('login-screen').classList.remove('hidden');
                document.getElementById('admin-panel').classList.add('hidden');
            }
        };

        const handleNav = (e) => {
            const link = e.currentTarget;
            if (!link.dataset.target) return;
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => {
                s.classList.toggle('hidden', s.id !== link.dataset.target);
                s.classList.toggle('active', s.id === link.dataset.target);
            });
            if (link.dataset.target === 'pos-section') updatePosAvailability();
        };

        // Data Subscriptions
        const bindAdminSubscriptions = () => {
            productsCollection.subscribe(data => {
                products = data;
                renderProducts();
                renderPosProducts();
                updateDashboard();
            });
            customersCollection.subscribe(data => {
                customers = data;
                renderCustomers();
                updatePosCustomerSelect();
                updateDashboard();
            });
            salesCollection.subscribe(data => {
                sales = data;
                updateDashboard();
                renderOnlineOrders();
                renderCustomers();
            });
            settingsCollection.subscribe(async (settingsList) => {
                if (settingsList.length > 0) {
                    visualSettings = settingsList[0];
                } else {
                    visualSettings = await settingsCollection.create({
                        theme: 'dark',
                        fontFamily: 'Poppins',
                        storeName: 'MK World Imports',
                        storeSlogan: 'Eletrônicos e Acessórios',
                        logoUrl: '/logoloja.png',
                        backgroundUrl: 'https://images.unsplash.com/photo-1550009158-94ae76552485?q=80&w=2574&auto=format&fit=crop',
                        whatsappNumber: '5511999999999',
                        instagramUser: 'mkimports',
                        storeColorPrimary: '#3B82F6',
                        storeColorBackground: '#111827',
                        storeColorText: '#F9FAFB',
                        storeColorCard: '#1F2937',
                        adminLogoUrl: '/logoloja.png',
                        adminColorPrimary: '#3B82F6',
                        adminColorBackground: '#111827',
                        adminColorSurface: '#1F2937',
                        adminColorText: '#F9FAFB'
                    });
                }
                applyGlobalSettings(visualSettings, adminBody);
                applyAdminPanelSettings(visualSettings);
                loadDesignerForm();
            });
            cashEventsCollection.subscribe(events => {
                recalculateCashState(events);
                updateCashView();
                updateDashboard();
                updatePosAvailability();
            });
        };

        // Dashboard & Charts
        const updateDashboard = () => {
            if (!document.getElementById('dashboard-sales')) return;
            document.getElementById('dashboard-sales').textContent = Utils.formatCurrency(sales.reduce((sum, s) => sum + s.total, 0));
            document.getElementById('dashboard-customers').textContent = customers.length;
            document.getElementById('dashboard-products').textContent = products.reduce((sum, p) => sum + p.stock, 0);
            document.getElementById('dashboard-orders').textContent = sales.filter(s => s.type === 'online' && s.status === 'pending').length;
            const totalInvestment = products.reduce((sum, p) => sum + (p.investmentValue || 0) * p.stock, 0);
            const revenuePotential = products.reduce((sum, p) => sum + (p.price || 0) * p.stock, 0);
            document.getElementById('dashboard-investment').textContent = Utils.formatCurrency(totalInvestment);
            document.getElementById('dashboard-revenue-potential').textContent = Utils.formatCurrency(revenuePotential);
            renderDashboardRecentSales();
            renderCharts();
        };

        const renderDashboardRecentSales = () => {
            const tbody = document.querySelector('#recent-sales-table tbody');
            if (!tbody) return;
            const recentSales = [...sales].reverse().slice(0, 5);
            tbody.innerHTML = recentSales.map(sale => `
                <tr>
                    <td>${sale.customerName}</td>
                    <td>${Utils.formatCurrency(sale.total)}</td>
                    <td><span class="order-status ${sale.status || 'pending'}">${sale.status || 'Pendente'}</span></td>
                    <td>${new Date(sale.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
            `).join('');
        };

        const renderCharts = () => {
            import('chart.js').then(({ Chart, registerables }) => {
                Chart.register(...registerables);
                const salesCtx = document.getElementById('salesChart')?.getContext('2d');
                const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');
                if (!salesCtx || !categoryCtx) return;
                if (productChartInstance) productChartInstance.destroy();
                if (categoryChartInstance) categoryChartInstance.destroy();
                const salesByCat = sales.reduce((acc, sale) => {
                    sale.items.forEach(item => {
                        const category = item.category || 'Sem Categoria';
                        acc[category] = (acc[category] || 0) + (item.price * item.qty);
                    });
                    return acc;
                }, {});
                const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
                categoryChartInstance = new Chart(categoryCtx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(salesByCat),
                        datasets: [{
                            label: 'Vendas',
                            data: Object.values(salesByCat),
                            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#8B5CF6'],
                            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
                            borderWidth: 2
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
                });
                const salesByDay = sales.reduce((acc, sale) => {
                    const date = new Date(sale.created_at).toLocaleDateString('pt-BR');
                    acc[date] = (acc[date] || 0) + sale.total;
                    return acc;
                }, {});
                const sortedDates = Object.keys(salesByDay).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
                const sortedSales = sortedDates.map(date => salesByDay[date]);
                productChartInstance = new Chart(salesCtx, {
                    type: 'line',
                    data: {
                        labels: sortedDates,
                        datasets: [{
                            label: 'Vendas por Dia',
                            data: sortedSales,
                            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
                            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() + '33',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: 'rgba(255,255,255,0.1)' } },
                            x: { ticks: { color: textColor }, grid: { color: 'rgba(255,255,255,0.1)' } }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }).catch(e => console.error("Chart.js loading failed:", e));
        };

        // Products
        const renderProducts = () => {
            const tbody = document.querySelector('#products-table tbody');
            const searchTerm = document.getElementById('product-search').value.toLowerCase();
            const filteredProducts = products.filter(p => (p.name || '').toLowerCase().includes(searchTerm));
            tbody.innerHTML = [...filteredProducts].reverse().map(p => `
                <tr>
                    <td><img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" class="product-table-img"></td>
                    <td>${p.name}</td>
                    <td>${Utils.formatCurrency(p.price)}</td>
                    <td>${Utils.formatCurrency(p.investmentValue || 0)}</td>
                    <td>${p.stock}</td>
                    <td>${p.category}</td>
                    <td>${new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                    <td class="action-btns">
                        <button class="edit-product-btn" data-id="${p.id}" title="Editar"><i class='bx bxs-edit'></i></button>
                        <button class="delete-product-btn" data-id="${p.id}" title="Excluir"><i class='bx bxs-trash'></i></button>
                    </td>
                </tr>`).join('');
            document.querySelectorAll('.edit-product-btn').forEach(btn => btn.addEventListener('click', () => openProductModal(btn.dataset.id)));
            document.querySelectorAll('.delete-product-btn').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
        };

        const openProductModal = (id = null) => {
            const form = document.getElementById('product-form');
            form.reset();
            document.getElementById('product-id').value = '';
            document.getElementById('product-images').value = '';
            const previewsContainer = document.getElementById('product-image-previews');
            previewsContainer.innerHTML = '';
            if (id) {
                const product = products.find(p => p.id == id);
                document.getElementById('product-modal-title').textContent = 'Editar Produto';
                document.getElementById('product-id').value = product.id;
                document.getElementById('product-name').value = product.name;
                document.getElementById('product-desc').value = product.desc;
                document.getElementById('product-price').value = product.price;
                document.getElementById('product-investment-price').value = product.investmentValue || '';
                document.getElementById('product-stock').value = product.stock;
                document.getElementById('product-category').value = product.category;
                document.getElementById('product-video').value = product.videoUrl || '';
                if (product.images && product.images.length > 0) {
                    product.images.forEach(imgUrl => {
                        const previewContainer = document.createElement('div');
                        previewContainer.className = 'preview-image-container';
                        const img = document.createElement('img');
                        img.src = imgUrl;
                        img.className = 'preview-image';
                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.className = 'remove-preview-btn';
                        removeBtn.innerHTML = '×';
                        removeBtn.onclick = () => previewContainer.remove();
                        previewContainer.appendChild(img);
                        previewContainer.appendChild(removeBtn);
                        previewsContainer.appendChild(previewContainer);
                    });
                }
            } else {
                document.getElementById('product-modal-title').textContent = 'Adicionar Produto';
            }
            Utils.openModal('product-modal');
        };

        const saveProduct = async (e) => {
            e.preventDefault();
            const id = document.getElementById('product-id').value;
            const previewElements = document.querySelectorAll('#product-image-previews .preview-image-container');
            const imageUrls = Array.from(previewElements).map(container => {
                const img = container.querySelector('img');
                return img && img.src ? img.src : null;
            }).filter(url => url);
            const productData = {
                name: document.getElementById('product-name').value,
                desc: document.getElementById('product-desc').value,
                price: parseFloat(document.getElementById('product-price').value),
                investmentValue: parseFloat(document.getElementById('product-investment-price').value) || 0,
                stock: parseInt(document.getElementById('product-stock').value, 10),
                category: document.getElementById('product-category').value,
                images: imageUrls,
                videoUrl: document.getElementById('product-video').value
            };
            try {
                if (id) {
                    await productsCollection.update(id, productData);
                } else {
                    await productsCollection.create(productData);
                }
                Utils.closeModal('product-modal');
                Utils.showToast('Produto salvo com sucesso!');
            } catch (error) {
                console.error("Product save failed:", error);
                Utils.showToast('Erro ao salvar o produto.', 'error');
            }
        };

        const deleteProduct = async (id) => {
            if (confirm('Tem certeza que deseja excluir este produto?')) {
                await productsCollection.delete(id);
                Utils.showToast('Produto excluído com sucesso!');
            }
        };

        const handleImageSelection = (e) => {
            const files = e.target.files;
            const previewsContainer = document.getElementById('product-image-previews');
            if (!files) return;
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                const previewContainer = document.createElement('div');
                previewContainer.className = 'preview-image-container';
                const img = document.createElement('img');
                img.className = 'preview-image';
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-preview-btn';
                removeBtn.innerHTML = '×';
                removeBtn.onclick = () => previewContainer.remove();
                previewContainer.appendChild(img);
                previewContainer.appendChild(removeBtn);
                previewsContainer.appendChild(previewContainer);
                const reader = new FileReader();
                reader.onload = (event) => {
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
            e.target.value = null;
        };

        // Online Orders
        const renderOnlineOrders = () => {
            const container = document.getElementById('orders-list');
            if (!container) return;
            const onlineOrders = sales.filter(s => {
                if (s.type !== 'online') return false;
                if (currentOrderFilter === 'all') return true;
                return s.status === currentOrderFilter;
            }).reverse();
            if (onlineOrders.length === 0) {
                container.innerHTML = '<p style="text-align: center; padding: 2rem;">Nenhum pedido online encontrado para este filtro.</p>';
                return;
            }
            container.innerHTML = onlineOrders.map(order => `
                <div class="order-card" id="order-${order.id}">
                    <div class="order-header">
                        <h4>Pedido de ${order.customerName}</h4>
                        <div class="order-meta">
                            <span>${new Date(order.created_at).toLocaleString('pt-BR')}</span>
                            <span class="order-status ${order.status || 'pending'}">${order.status || 'Pendente'}</span>
                        </div>
                    </div>
                    <div class="order-body">
                        <h5>Itens:</h5>
                        <ul>
                            ${order.items.map(item => `<li>${item.qty}x ${item.name} - ${Utils.formatCurrency(item.price)}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="order-footer">
                        <div class="order-total">
                            <strong>Total: ${Utils.formatCurrency(order.total)}</strong>
                            <span>(${order.paymentMethod})</span>
                        </div>
                        <div class="order-actions">
                            ${order.status !== 'completed' ? `<button class="confirm-order-btn" data-id="${order.id}"><i class='bx bx-check-circle'></i> Confirmar</button>` : `<span class="text-success" style="display: flex; align-items: center; gap: 6px;"><i class='bx bx-check-circle'></i> Concluído</span>`}
                            <button class="delete-order-btn" data-id="${order.id}"><i class='bx bxs-trash'></i></button>
                        </div>
                    </div>
                </div>
            `).join('');
            document.querySelectorAll('.confirm-order-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    await salesCollection.update(btn.dataset.id, { status: 'completed' });
                    Utils.showToast('Pedido confirmado!');
                });
            });
            document.querySelectorAll('.delete-order-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Tem certeza que deseja cancelar este pedido? O estoque dos itens será restaurado.')) {
                        btn.disabled = true;
                        try {
                            const order = sales.find(s => s.id === btn.dataset.id);
                            if (order?.items?.length) {
                                const stockUpdates = order.items.map(item => {
                                    const product = products.find(p => p.id === item.id);
                                    if (product) {
                                        return productsCollection.update(product.id, { stock: product.stock + item.qty });
                                    }
                                    return Promise.resolve();
                                });
                                await Promise.all(stockUpdates);
                            }
                            await salesCollection.delete(btn.dataset.id);
                            Utils.showToast('Pedido cancelado com sucesso!');
                        } catch (error) {
                            console.error('Erro ao excluir pedido:', error);
                            Utils.showToast('Erro ao excluir pedido.', 'error');
                            btn.disabled = false;
                        }
                    }
                });
            });
        };

        // Customers
        const renderCustomers = () => {
            const tbody = document.querySelector('#customers-table tbody');
            const searchTerm = document.getElementById('customer-search').value.toLowerCase();
            const filteredCustomers = customers.filter(c => 
                (c.name || '').toLowerCase().includes(searchTerm) || 
                (c.cpf || '').includes(searchTerm)
            );
            tbody.innerHTML = filteredCustomers.map(c => {
                const totalSpent = sales.filter(s => s.customerId === c.id).reduce((sum, s) => sum + s.total, 0);
                return `
                    <tr>
                        <td>${c.name}</td>
                        <td>${c.cpf || 'N/A'}</td>
                        <td>${c.email || 'N/A'}</td>
                        <td>${c.phone}</td>
                        <td>${Utils.formatCurrency(totalSpent)}</td>
                        <td class="action-btns">
                            <button class="edit-customer-btn" data-id="${c.id}" title="Editar"><i class='bx bxs-edit'></i></button>
                            <button class="delete-customer-btn" data-id="${c.id}" title="Excluir"><i class='bx bxs-trash'></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
            document.querySelectorAll('.edit-customer-btn').forEach(btn => btn.addEventListener('click', () => openCustomerModal(btn.dataset.id)));
            document.querySelectorAll('.delete-customer-btn').forEach(btn => btn.addEventListener('click', () => deleteCustomer(btn.dataset.id)));
        };

        const openCustomerModal = (id = null) => {
            const form = document.getElementById('customer-form');
            form.reset();
            document.getElementById('customer-id').value = '';
            if (id) {
                const customer = customers.find(c => c.id == id);
                document.getElementById('customer-modal-title').textContent = 'Editar Cliente';
                document.getElementById('customer-id').value = customer.id;
                document.getElementById('customer-name').value = customer.name;
                document.getElementById('customer-cpf').value = customer.cpf;
                document.getElementById('customer-email').value = customer.email;
                document.getElementById('customer-phone').value = customer.phone;
                document.getElementById('customer-address').value = customer.address;
            } else {
                document.getElementById('customer-modal-title').textContent = 'Adicionar Cliente';
            }
            Utils.openModal('customer-modal');
        };

        const saveCustomer = async (e) => {
            e.preventDefault();
            const id = document.getElementById('customer-id').value;
            const customerData = {
                name: document.getElementById('customer-name').value,
                cpf: document.getElementById('customer-cpf').value,
                email: document.getElementById('customer-email').value,
                phone: document.getElementById('customer-phone').value,
                address: document.getElementById('customer-address').value
            };
            if (id) {
                await customersCollection.update(id, customerData);
            } else {
                await customersCollection.create(customerData);
            }
            Utils.closeModal('customer-modal');
            Utils.showToast('Cliente salvo com sucesso!');
        };

        const deleteCustomer = async (id) => {
            if (confirm('Tem certeza que deseja excluir este cliente?')) {
                await customersCollection.delete(id);
                Utils.showToast('Cliente excluído com sucesso!');
            }
        };

        // Point of Sale
        const renderPosProducts = () => {
            const searchTerm = document.getElementById('pos-product-search').value.toLowerCase();
            const grid = document.getElementById('pos-product-list');
            grid.innerHTML = products.filter(p => 
                p.name.toLowerCase().includes(searchTerm)
            ).map(p => `
                <div class="pos-product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}">
                    <img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" width="80" height="80" loading="lazy" decoding="async">
                    <h5>${p.name}</h5>
                    <p>${Utils.formatCurrency(p.price)}</p>
                    ${p.stock <= 0 ? '<small>Esgotado</small>' : `<small>Estoque: ${p.stock}</small>`}
                </div>
            `).join('');
            document.querySelectorAll('.pos-product-card').forEach(card => {
                card.addEventListener('click', () => addToPosCart(card.dataset.id));
            });
        };

        const updatePosCustomerSelect = () => {
            const select = document.getElementById('pos-customer-select-input');
            select.innerHTML = '<option value="consumidor-final">Consumidor Final</option>' +
                customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        };

        const addToPosCart = (id) => {
            const product = products.find(p => p.id == id);
            if (!product || product.stock <= 0) {
                return Utils.showToast('Produto esgotado!', 'error');
            }
            const existingItem = posCart.find(item => item.id === id);
            if (existingItem) {
                if (existingItem.qty < product.stock) {
                    existingItem.qty++;
                } else {
                    return Utils.showToast('Quantidade máxima em estoque atingida!', 'error');
                }
            } else {
                posCart.push({ ...product, qty: 1 });
            }
            updatePosCart();
        };

        const updatePosCart = () => {
            const itemsList = document.getElementById('pos-cart-items');
            const totalAmountElement = document.getElementById('pos-total-amount');
            let total = 0;
            itemsList.innerHTML = posCart.map(item => {
                total += item.price * item.qty;
                return `
                    <li class="cart-item">
                        <span class="cart-item-name">${item.qty}x ${item.name}</span>
                        <span class="cart-item-price">${Utils.formatCurrency(item.price * item.qty)}</span>
                        <button type="button" class="remove-pos-item-btn" data-id="${item.id}" title="Remove Item">×</button>
                    </li>
                `;
            }).join('');
            totalAmountElement.textContent = Utils.formatCurrency(total);
            document.querySelectorAll('.remove-pos-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    posCart = posCart.filter(item => item.id !== btn.dataset.id);
                    updatePosCart();
                });
            });
        };

        const registerPosSale = async () => {
            if (!cashState.isOpen) return Utils.showToast('O caixa está fechado.', 'error');
            if (posCart.length === 0) return Utils.showToast('O carrinho está vazio.', 'error');
            const total = posCart.reduce((sum, item) => sum + item.price * item.qty, 0);
            for (const item of posCart) {
                const product = products.find(p => p.id === item.id);
                if (product.stock < item.qty) {
                    return Utils.showToast(`Estoque insuficiente para ${item.name}.`, 'error');
                }
            }
            Utils.showToast('Registrando venda...', 'info');
            const customerSelect = document.getElementById('pos-customer-select-input');
            const saleData = {
                items: posCart,
                total,
                paymentMethod: document.getElementById('pos-payment-method').value,
                customerName: customerSelect.options[customerSelect.selectedIndex].textContent,
                customerId: customerSelect.value,
                type: 'pos',
                status: 'completed'
            };
            const createdSale = await salesCollection.create(saleData);
            for (const item of posCart) {
                const product = products.find(p => p.id === item.id);
                await productsCollection.update(item.id, { stock: product.stock - item.qty });
            }
            await cashEventsCollection.create({
                entryType: 'entry',
                description: `Venda PDV - Cliente: ${saleData.customerName}`,
                amount: total,
                saleId: createdSale.id
            });
            posCart = [];
            updatePosCart();
            Utils.showToast('Venda registrada com sucesso!');
        };

        // Cash Control
        const recalculateCashState = (events) => {
            if (!Array.isArray(events)) {
                console.warn('Eventos de caixa inválidos:', events);
                cashState = { isOpen: false, balance: 0, history: [] };
                return;
            }
            const sortedEvents = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let balance = 0;
            let isOpen = false;
            const history = [];
            for (const event of sortedEvents) {
                if (!event || !event.entryType) {
                    console.warn('Evento de caixa inválido:', event);
                    continue;
                }
                const historyEntry = { 
                    ...event,
                    date: new Date(event.created_at),
                    description: event.description || 'Sem descrição',
                    type: event.entryType,
                    amount: Number(event.amount) || 0,
                    id: event.id,
                    saleId: event.saleId,
                    isCancelled: !!event.isCancelled
                };
                switch (event.entryType) {
                    case 'open':
                        isOpen = true;
                        balance = Number(event.amount) || 0;
                        break;
                    case 'entry':
                        if (isOpen && !event.isCancelled) balance += Number(event.amount) || 0;
                        break;
                    case 'exit':
                        if (isOpen && !event.isCancelled) balance -= Number(event.amount) || 0;
                        break;
                    case 'close':
                        isOpen = false;
                        break;
                    default:
                        console.warn('Tipo de evento desconhecido:', event.entryType);
                }
                history.push(historyEntry);
            }
            cashState = { isOpen, balance, history };
            console.log('Estado do caixa atualizado:', cashState);
        };

        const updatePosAvailability = () => {
            const posOverlay = document.getElementById('pos-cash-closed-overlay');
            if (posOverlay) posOverlay.classList.toggle('hidden', cashState.isOpen);
        };

        const updateCashView = () => {
            const indicator = document.getElementById('cash-state-indicator');
            if (cashState.isOpen) {
                indicator.textContent = 'Caixa Aberto';
                indicator.classList.add('open');
                document.getElementById('cash-closed-view').classList.add('hidden');
                document.getElementById('cash-open-view').classList.remove('hidden');
                document.getElementById('current-balance').textContent = Utils.formatCurrency(cashState.balance);
                renderCashHistory();
            } else {
                indicator.textContent = 'Caixa Fechado';
                indicator.classList.remove('open');
                document.getElementById('cash-closed-view').classList.remove('hidden');
                document.getElementById('cash-open-view').classList.add('hidden');
            }
        };

        const renderCashHistory = () => {
    const tbody = document.querySelector('#cash-history-table tbody');
    if (!tbody) {
        console.warn('Elemento #cash-history-table tbody não encontrado.');
        return;
    }
    if (!Array.isArray(cashState?.history)) {
        console.warn('cashState.history não é um array válido:', cashState?.history);
        tbody.innerHTML = '<tr><td colspan="5">Nenhum histórico disponível</td></tr>';
        return;
    }
    tbody.innerHTML = [...cashState.history].reverse().map(t => {
        let typeClass = '';
        if (t.type === 'entry') typeClass = 'text-success';
        else if (t.type === 'exit') typeClass = 'text-error';
        else if (t.type === 'open' || t.type === 'close') typeClass = 'text-info';
        const isCancellable = t.saleId && t.type === 'entry' && !t.isCancelled;
        const isEditable = (t.type === 'entry' || t.type === 'exit') && !t.saleId && !t.isCancelled;
        let actions = '';
        if (isCancellable) {
            actions = `<button class="cancel-sale-btn" data-sale-id="${t.saleId}" data-event-id="${t.id}" title="Cancelar Venda"><i class='bx bx-undo'></i></button>`;
        }
        if (isEditable) {
            actions += `
                <button class="edit-cash-entry-btn" data-event-id="${t.id}" title="Editar"><i class='bx bxs-edit'></i></button>
                <button class="delete-cash-entry-btn" data-event-id="${t.id}" title="Excluir"><i class='bx bxs-trash'></i></button>
            `;
        }
        return `
            <tr>
                <td>${new Date(t.date).toLocaleString('pt-BR')}</td>
                <td>${t.description || 'Sem descrição'} ${t.isCancelled ? '<span class="text-error" style="font-size: smaller;">(Cancelado)</span>' : ''}</td>
                <td class="${typeClass}">${t.type}</td>
                <td>${Utils.formatCurrency(t.amount)}</td>
                <td class="action-btns">${actions}</td>
            </tr>
        `;
    }).join('');
};

        const openCash = async (e) => {
            e.preventDefault();
            const initialBalance = parseFloat(document.getElementById('initial-balance').value);
            await cashEventsCollection.create({
                entryType: 'open',
                description: 'Abertura de Caixa',
                amount: initialBalance
            });
            Utils.showToast('Caixa aberto com sucesso!');
            document.getElementById('open-cash-form').reset();
        };

        const openCashEntryModal = (type) => {
            const form = document.getElementById('cash-entry-form');
            form.reset();
            document.getElementById('cash-entry-title').textContent = type === 'entry' ? 'Registrar Entrada' : 'Registrar Saída';
            document.getElementById('cash-entry-type').value = type;
            document.getElementById('cash-entry-id').value = '';
            Utils.openModal('cash-entry-modal');
        };

        const openCashEntryModalForEdit = (eventId) => {
            const event = cashState.history.find(e => e.id === eventId);
            if (!event) return Utils.showToast('Movimentação não encontrada.', 'error');
            document.getElementById('cash-entry-title').textContent = `Editar ${event.type === 'entry' ? 'Entrada' : 'Saída'}`;
            document.getElementById('cash-entry-id').value = event.id;
            document.getElementById('cash-entry-type').value = event.type;
            document.getElementById('cash-entry-amount').value = event.amount;
            document.getElementById('cash-entry-desc').value = event.description;
            Utils.openModal('cash-entry-modal');
        };

        const saveCashEntry = async (e) => {
            e.preventDefault();
            const id = document.getElementById('cash-entry-id').value;
            const amount = parseFloat(document.getElementById('cash-entry-amount').value);
            const description = document.getElementById('cash-entry-desc').value;
            const type = document.getElementById('cash-entry-type').value;
            if (type === 'exit' && amount > cashState.balance) {
                return Utils.showToast('O valor da saída excede o saldo do caixa.', 'error');
            }
            const eventData = { entryType: type, description, amount };
            if (id) {
                await cashEventsCollection.update(id, eventData);
                Utils.showToast('Movimentação atualizada com sucesso!');
            } else {
                await cashEventsCollection.create(eventData);
                Utils.showToast('Movimentação registrada com sucesso!');
            }
            Utils.closeModal('cash-entry-modal');
            document.getElementById('cash-entry-form').reset();
        };

        const deleteCashEntry = async (id) => {
            if (confirm('Tem certeza que deseja excluir esta movimentação?')) {
                await cashEventsCollection.delete(id);
                Utils.showToast('Movimentação excluída com sucesso!');
            }
        };

            const openCloseCashModal = () => {
            if (!cashState.isOpen) {
                Utils.showToast('O caixa está fechado.', 'error');
                return;
            }
            const lastOpenIndex = cashState.history.findLastIndex(e => e.type === 'open');
            if (lastOpenIndex === -1) {
                Utils.showToast('Erro de estado do caixa.', 'error');
                return;
            }
            const sessionEvents = cashState.history.slice(lastOpenIndex);
            const initial = sessionEvents.find(e => e.type === 'open')?.amount || 0;
            const salesTotal = sessionEvents.filter(e => e.type === 'entry' && e.saleId && !e.isCancelled).reduce((sum, e) => sum + e.amount, 0);
            const otherEntries = sessionEvents.filter(e => e.type === 'entry' && !e.saleId && !e.isCancelled).reduce((sum, e) => sum + e.amount, 0);
            const exits = sessionEvents.filter(e => e.type === 'exit' && !e.isCancelled).reduce((sum, e) => sum + e.amount, 0);
            const elements = {
                initial: document.getElementById('summary-initial'),
                sales: document.getElementById('summary-sales'),
                entries: document.getElementById('summary-entries'),
                totalEntries: document.getElementById('summary-total-entries'),
                exits: document.getElementById('summary-exits'),
                finalBalance: document.getElementById('summary-final-balance')
            };
            if (Object.values(elements).some(el => !el)) {
                console.error('Elementos de resumo do caixa não encontrados:', elements);
                Utils.showToast('Erro ao carregar resumo do caixa.', 'error');
                return;
            }
            elements.initial.textContent = Utils.formatCurrency(initial);
            elements.sales.textContent = Utils.formatCurrency(salesTotal);
            elements.entries.textContent = Utils.formatCurrency(otherEntries);
            elements.totalEntries.textContent = Utils.formatCurrency(salesTotal + otherEntries);
            elements.exits.textContent = Utils.formatCurrency(exits);
            elements.finalBalance.textContent = Utils.formatCurrency(cashState.balance);
            Utils.openModal('close-cash-summary-modal');
        };

        const handleConfirmCloseCash = async (e) => {
            e.preventDefault();
            const confirmBtn = document.getElementById('confirm-close-cash-btn');
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<i class="bx bx-loader bx-spin"></i> Fechando...`;
            try {
                await cashEventsCollection.create({ 
                    entryType: 'close', 
                    description: 'Fechamento de Caixa', 
                    amount: cashState.balance 
                });
                Utils.closeModal('close-cash-summary-modal');
                Utils.showToast('Caixa fechado com sucesso!');
            } catch (error) {
                console.error('Erro ao fechar caixa:', error);
                Utils.showToast('Erro ao fechar caixa.', 'error');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = 'Confirmar Fechamento';
            }
        };

        const handleCancelSale = async (button) => {
            const { saleId, eventId } = button.dataset;
            if (!saleId || !eventId) {
                return Utils.showToast('Erro: IDs não encontrados.', 'error');
            }
            if (confirm('Tem certeza que deseja cancelar esta venda? O estoque será restaurado.')) {
                button.disabled = true;
                Utils.showToast('Cancelando venda...', 'info');
                try {
                    const sale = sales.find(s => s.id === saleId);
                    if (!sale) throw new Error('Venda não encontrada.');
                    if (sale.items?.length) {
                        const stockUpdates = sale.items.map(item => {
                            const product = products.find(p => p.id === item.id);
                            if (product) {
                                return productsCollection.update(p.id, { stock: product.stock + item.qty });
                            }
                            return Promise.resolve();
                        });
                        await Promise.all(stockUpdates);
                    }
                    await cashEventsCollection.update(eventId, { isCancelled: true });
                    await salesCollection.delete(saleId);
                    Utils.showToast('Venda cancelada com sucesso!');
                } catch (error) {
                    console.error('Erro ao cancelar venda:', error);
                    Utils.showToast(error.message || 'Erro ao cancelar venda.', 'error');
                    button.disabled = false;
                }
            }
        };

        // Visual Designer
        const applyAdminPanelSettings = (settings) => {
            adminBody.style.setProperty('--color-primary', settings.adminColorPrimary || '');
            adminBody.style.setProperty('--color-background', settings.adminColorBackground || '');
            adminBody.style.setProperty('--color-surface', settings.adminColorSurface || '');
            adminBody.style.setProperty('--color-text', settings.adminColorText || '');
            if (settings.adminLogoUrl) {
                const loginLogo = document.getElementById('login-logo-img');
                const sidebarLogo = document.getElementById('sidebar-logo');
                if (loginLogo) loginLogo.src = settings.adminLogoUrl;
                if (sidebarLogo) sidebarLogo.src = settings.adminLogoUrl;
            }
        };

        const loadDesignerForm = () => {
            if (!visualSettings) return;
            document.querySelectorAll('.designer-form [data-setting]').forEach(input => {
                const settingKey = input.dataset.setting;
                const settingValue = visualSettings[settingKey];
                if (input.type === 'file') {
                    const previewTargetId = input.dataset.previewTarget;
                    if (previewTargetId && settingValue) {
                        document.getElementById(previewTargetId).src = settingValue;
                    }
                } else if (input.type === 'color') {
                    input.value = settingValue || '#000000';
                } else {
                    input.value = settingValue || '';
                }
            });
        };

        const handleDesignerFileUpload = (e) => {
            const input = e.target;
            if (!input.files || !input.files[0]) return;
            const settingKey = input.dataset.setting;
            const previewTargetId = input.dataset.previewTarget;
            const file = input.files[0];
            if (!file.type.startsWith('image/')) {
                Utils.showToast('Por favor, selecione uma imagem válida.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = async (event) => {
                const dataUrl = event.target.result;
                if (previewTargetId) {
                    document.getElementById(previewTargetId).src = dataUrl;
                }
                if (visualSettings && settingKey) {
                    visualSettings[settingKey] = dataUrl;
                    await settingsCollection.update(visualSettings.id, { [settingKey]: dataUrl });
                    applyAdminPanelSettings(visualSettings);
                    Utils.showToast('Imagem atualizada!');
                }
            };
            reader.readAsDataURL(file);
        };

        const handleDesignerChange = async (e) => {
            if (e.target.type === 'file') return;
            if (!e.target.dataset.setting || !visualSettings) return;
            const settingKey = e.target.dataset.setting;
            const settingValue = e.target.value;
            if (visualSettings[settingKey] !== settingValue) {
                visualSettings[settingKey] = settingValue;
                if (settingKey === 'theme' || settingKey === 'fontFamily') {
                    applyGlobalSettings(visualSettings, adminBody);
                } else if (settingKey.startsWith('admin')) {
                    applyAdminPanelSettings(visualSettings);
                }
                await settingsCollection.update(visualSettings.id, { [settingKey]: settingValue });
            }
        };

        // Event Listeners
        const bindAdminEventListeners = () => {
            document.getElementById('login-form').addEventListener('submit', handleLogin);
            document.getElementById('logout-btn').addEventListener('click', handleLogout);
            document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', handleNav));
            document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
            document.getElementById('product-form').addEventListener('submit', saveProduct);
            document.getElementById('cancel-product-btn').addEventListener('click', () => Utils.closeModal('product-modal'));
            document.getElementById('product-images').addEventListener('change', handleImageSelection);
            document.getElementById('product-search').addEventListener('input', renderProducts);
            document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerModal());
            document.getElementById('customer-form').addEventListener('submit', saveCustomer);
            document.getElementById('cancel-customer-btn').addEventListener('click', () => Utils.closeModal('customer-modal'));
            document.getElementById('customer-search').addEventListener('input', renderCustomers);
            document.querySelectorAll('#orders-section .filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#orders-section .filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentOrderFilter = btn.dataset.status;
                    renderOnlineOrders();
                });
            });
            document.getElementById('pos-product-search').addEventListener('input', renderPosProducts);
            document.getElementById('pos-finalize-btn').addEventListener('click', registerPosSale);
            document.getElementById('open-cash-form').addEventListener('submit', openCash);
            document.getElementById('register-entry-btn').addEventListener('click', () => openCashEntryModal('entry'));
            document.getElementById('register-exit-btn').addEventListener('click', () => openCashEntryModal('exit'));
            document.getElementById('cash-entry-form').addEventListener('submit', saveCashEntry);
            document.querySelectorAll('.cancel-cash-entry-btn').forEach(btn => btn.addEventListener('click', () => Utils.closeModal('cash-entry-modal')));
            document.getElementById('close-cash-btn').addEventListener('click', openCloseCashModal);
            document.getElementById('close-cash-summary-form').addEventListener('submit', handleConfirmCloseCash);
            document.getElementById('cancel-close-cash-summary-btn').addEventListener('click', () => Utils.closeModal('close-cash-summary-modal'));
            document.querySelector('#cash-history-table tbody').addEventListener('click', (e) => {
                const cancelBtn = e.target.closest('.cancel-sale-btn');
                const editBtn = e.target.closest('.edit-cash-entry-btn');
                const deleteBtn = e.target.closest('.delete-cash-entry-btn');
                if (cancelBtn) handleCancelSale(cancelBtn);
                else if (editBtn) openCashEntryModalForEdit(editBtn.dataset.eventId);
                else if (deleteBtn) deleteCashEntry(deleteBtn.dataset.eventId);
            });
            const designerForm = document.getElementById('designer-form');
            if (designerForm) {
                let designerDebounceTimer;
                designerForm.addEventListener('input', (e) => {
                    if (e.target.type === 'file') {
                        handleDesignerFileUpload(e);
                    } else {
                        handleDesignerChange(e);
                    }
                    if (e.target.dataset.setting) {
                        clearTimeout(designerDebounceTimer);
                        designerDebounceTimer = setTimeout(() => {
                            Utils.showToast('Alteração salva!', 'success');
                        }, 1200);
                    }
                });
            }
            document.querySelectorAll('.preview-toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.dataset.view;
                    const wrapper = document.getElementById('store-preview-wrapper');
                    document.querySelectorAll('.preview-toggle-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    wrapper.classList.remove('view-desktop', 'view-mobile');
                    wrapper.classList.add(`view-${view}`);
                });
            });
            const adminPanel = document.getElementById('admin-panel');
            const sidebarToggle = document.getElementById('sidebar-toggle-btn');
            if (adminPanel && sidebarToggle) {
                const toggleSidebar = () => {
                    adminPanel.classList.toggle('sidebar-collapsed');
                    const isCollapsed = adminPanel.classList.contains('sidebar-collapsed');
                    localStorage.setItem('sidebarCollapsed', isCollapsed);
                    sidebarToggle.innerHTML = isCollapsed ? "<i class='bx bx-chevron-right'></i>" : "<i class='bx bx-chevron-left'></i>";
                    sidebarToggle.title = isCollapsed ? 'Expandir menu' : 'Recolher menu';
                };
                sidebarToggle.addEventListener('click', toggleSidebar);
                if (localStorage.getItem('sidebarCollapsed') === 'true') {
                    adminPanel.classList.add('sidebar-collapsed');
                    sidebarToggle.innerHTML = "<i class='bx bx-chevron-right'></i>";
                    sidebarToggle.title = 'Expandir menu';
                }
            }
        };

        bindAdminEventListeners();
        checkAuth();
    }

    // Public Store Logic
    function initStore(storeBody) {
        const productsCollection = LocalStorageDB.getCollection('product_v3');
        const settingsCollection = LocalStorageDB.getCollection('visualSetting_v2');
        const customersCollection = LocalStorageDB.getCollection('customer_v1');
        const salesCollection = LocalStorageDB.getCollection('sale_v1');
        let products = [];
        let settings = {};
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        let customers = [];
        let currentView = 'grid'; // Default to grid view

        const bindStoreSubscriptions = () => {
            productsCollection.subscribe(data => {
                products = data;
                renderProducts();
                populateCategoryFilter();
            });
            settingsCollection.subscribe(settingsList => {
                if (settingsList.length > 0) {
                    settings = settingsList[0];
                    applyGlobalSettings(settings, storeBody);
                    applyStoreSettings(settings);
                }
            });
            customersCollection.subscribe(data => {
                customers = data;
            });
        };

        const applyStoreSettings = (settings) => {
            document.title = settings.storeName || 'Loja Online';
            document.getElementById('store-name-header').textContent = settings.storeName || 'MK World Imports';
            document.getElementById('store-slogan-header').textContent = settings.storeSlogan || 'Eletrônicos e Acessórios';
            document.getElementById('footer-store-name').textContent = settings.storeName || 'MK World Imports';
            document.getElementById('store-logo-img').src = settings.logoUrl || '/logoloja.png';
            if (settings.backgroundUrl) {
                document.getElementById('hero-banner').style.backgroundImage = `url('${settings.backgroundUrl}')`;
            }
            storeBody.style.setProperty('--color-primary', settings.storeColorPrimary || '#3B82F6');
            storeBody.style.setProperty('--color-background', settings.storeColorBackground || '#111827');
            storeBody.style.setProperty('--color-text', settings.storeColorText || '#F9FAFB');
            storeBody.style.setProperty('--color-card', settings.storeColorCard || '#1F2937');
            const socialContainer = document.getElementById('social-links-container');
            if (socialContainer) {
                socialContainer.innerHTML = '';
                if (settings.whatsappNumber) {
                    const waLink = document.createElement('a');
                    waLink.href = `https://wa.me/${Utils.cleanPhoneNumber(settings.whatsappNumber)}`;
                    waLink.target = '_blank';
                    waLink.title = 'WhatsApp';
                    waLink.innerHTML = `<i class='bx bxl-whatsapp'></i>`;
                    socialContainer.appendChild(waLink);
                }
                if (settings.instagramUser) {
                    const igLink = document.createElement('a');
                    igLink.href = `https://instagram.com/${settings.instagramUser}`;
                    igLink.target = '_blank';
                    igLink.title = 'Instagram';
                    igLink.innerHTML = `<i class='bx bxl-instagram'></i>`;
                    socialContainer.appendChild(igLink);
                }
            }
        };

        const renderProducts = () => {
            const grid = document.getElementById('products-list');
            if (!grid) return;
            const search = document.getElementById('product-search-input').value.toLowerCase();
            const category = document.getElementById('category-filter').value;
            const filteredProducts = products.filter(p => 
                ((p.name || '').toLowerCase().includes(search) || (p.desc || '').toLowerCase().includes(search)) && 
                (category === 'all' || p.category === category)
            );
            grid.classList.remove('view-grid', 'view-list');
            grid.classList.add(`view-${currentView}`);
            if (filteredProducts.length === 0) {
                grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; padding: 2rem;">${products.length === 0 ? 'Nenhum produto cadastrado ainda.' : 'Nenhum produto encontrado.'}</p>`;
                return;
            }
            grid.innerHTML = [...filteredProducts].reverse().map(p => `
                <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}" title="Clique para ver mais detalhes">
                    <div class="product-image-container">
                        <img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" loading="lazy" decoding="async">
                    </div>
                    <div class="product-info">
                        <h3>${p.name}</h3>
                        <span class="product-category">${p.category || 'Sem Categoria'}</span>
                        <p class="product-stock">${p.stock > 0 ? `Estoque: ${p.stock} un.` : 'Esgotado'}</p>
                        <p class="product-price">${Utils.formatCurrency(p.price)}</p>
                        ${currentView === 'list' && p.desc ? `<p class="product-desc">${p.desc.slice(0, 100)}${p.desc.length > 100 ? '...' : ''}</p>` : ''}
                        <button class="add-to-cart-btn" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>Adicionar ao Carrinho</button>
                    </div>
                </div>
            `).join('');
            document.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (!e.target.closest('.add-to-cart-btn')) {
                        openProductDetailModal(card.dataset.id);
                    }
                });
            });
            document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addToCart(btn.dataset.id);
                });
            });
        };

        const populateCategoryFilter = () => {
            const select = document.getElementById('category-filter');
            if (!select) return;
            const categories = [...new Set(products.map(p => p.category).filter(c => c))];
            select.innerHTML = '<option value="all">Todas as Categorias</option>' + 
                categories.map(c => `<option value="${c}">${c}</option>`).join('');
        };

        const openProductDetailModal = (id) => {
            const product = products.find(p => p.id == id);
            if (!product) return;
            const content = document.getElementById('product-detail-content');
            content.innerHTML = `
                <div class="product-detail">
                    <div class="product-detail-images">
                        ${product.images && product.images.length > 0 ? `
                            <img src="${product.images[0]}" alt="${product.name}" class="main-image">
                            <div class="thumbnail-gallery">
                                ${product.images.map((img, i) => `
                                    <img src="${img}" alt="${product.name} ${i + 1}" class="thumbnail ${i === 0 ? 'active' : ''}">
                                `).join('')}
                            </div>
                        ` : `<img src="/placeholder.png" alt="${product.name}" class="main-image">`}
                        ${product.videoUrl ? `
                            <div class="product-video">
                                <iframe src="${product.videoUrl.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>
                            </div>
                        ` : ''}
                    </div>
                    <div class="product-detail-info">
                        <h2>${product.name}</h2>
                        <p class="product-category">${product.category || 'Sem Categoria'}</p>
                        <p class="product-price">${Utils.formatCurrency(product.price)}</p>
                        <p class="product-stock">${product.stock > 0 ? `Estoque: ${product.stock} un.` : 'Esgotado'}</p>
                        ${product.desc ? `<p class="product-desc">${product.desc}</p>` : ''}
                        <button class="add-to-cart-btn" data-id="${product.id}" ${product.stock <= 0 ? 'disabled' : ''}>Adicionar ao Carrinho</button>
                    </div>
                </div>
            `;
            const relatedProducts = products.filter(p => p.id !== id && p.category === product.category && p.stock > 0).slice(0, 3);
            const relatedContainer = document.getElementById('related-products-list');
            relatedContainer.innerHTML = relatedProducts.length > 0 ? relatedProducts.map(p => `
                <div class="product-card" data-id="${p.id}">
                    <img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" loading="lazy">
                    <h5>${p.name}</h5>
                    <p>${Utils.formatCurrency(p.price)}</p>
                </div>
            `).join('') : '<p>Nenhum produto relacionado encontrado.</p>';
            document.querySelectorAll('#related-products-list .product-card').forEach(card => {
                card.addEventListener('click', () => openProductDetailModal(card.dataset.id));
            });
            document.querySelectorAll('#product-detail-content .add-to-cart-btn').forEach(btn => {
                btn.addEventListener('click', () => addToCart(btn.dataset.id));
            });
            document.querySelectorAll('.thumbnail').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    document.querySelector('.main-image').src = thumb.src;
                    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
            });
            Utils.openModal('product-detail-modal');
        };

        const addToCart = (id) => {
            const product = products.find(p => p.id == id);
            if (!product || product.stock <= 0) {
                return Utils.showToast('Produto esgotado!', 'error');
            }
            const existingItem = cart.find(item => item.id === id);
            if (existingItem) {
                if (existingItem.qty < product.stock) {
                    existingItem.qty++;
                } else {
                    return Utils.showToast('Quantidade máxima em estoque atingida!', 'error');
                }
            } else {
                cart.push({ ...product, qty: 1 });
            }
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCart();
            Utils.showToast('Produto adicionado ao carrinho!');
        };

        const updateCart = () => {
            const cartItems = document.getElementById('cart-items-container');
            const cartTotal = document.getElementById('cart-total');
            const cartCount = document.getElementById('cart-count');
            const checkoutBtn = document.getElementById('checkout-btn');
            if (!cartItems || !cartTotal || !cartCount || !checkoutBtn) return;
            cartItems.innerHTML = cart.length === 0 ? '<p style="text-align: center; padding: 1rem;">Seu carrinho está vazio.</p>' : cart.map(item => `
                <div class="cart-item">
                    <img src="${(item.images && item.images[0]) || '/placeholder.png'}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-info">
                        <span>${item.name}</span>
                        <div class="cart-item-controls">
                            <button class="cart-qty-btn" data-id="${item.id}" data-action="decrease">-</button>
                            <span>${item.qty}</span>
                            <button class="cart-qty-btn" data-id="${item.id}" data-action="increase">+</button>
                        </div>
                    </div>
                    <span>${Utils.formatCurrency(item.price * item.qty)}</span>
                    <button class="remove-cart-item-btn" data-id="${item.id}">×</button>
                </div>
            `).join('');
            const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
            cartTotal.textContent = Utils.formatCurrency(total);
            cartCount.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
            checkoutBtn.disabled = cart.length === 0;
            document.querySelectorAll('.remove-cart-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    cart = cart.filter(item => item.id !== btn.dataset.id);
                    localStorage.setItem('cart', JSON.stringify(cart));
                    updateCart();
                });
            });
            document.querySelectorAll('.cart-qty-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    const action = btn.dataset.action;
                    const item = cart.find(i => i.id === id);
                    const product = products.find(p => p.id === id);
                    if (!item || !product) return;
                    if (action === 'increase' && item.qty < product.stock) {
                        item.qty++;
                    } else if (action === 'decrease' && item.qty > 1) {
                        item.qty--;
                    } else if (action === 'decrease' && item.qty === 1) {
                        cart = cart.filter(i => i.id !== id);
                    } else {
                        Utils.showToast('Quantidade máxima em estoque atingida!', 'error');
                        return;
                    }
                    localStorage.setItem('cart', JSON.stringify(cart));
                    updateCart();
                });
            });
        };

        const openCheckoutModal = () => {
            if (cart.length === 0) return Utils.showToast('O carrinho está vazio.', 'error');
            const orderSummary = document.getElementById('checkout-order-summary');
            const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
            orderSummary.innerHTML = `
                <h4>Resumo do Pedido</h4>
                <ul>
                    ${cart.map(item => `
                        <li>
                            <span>${item.qty}x ${item.name}</span>
                            <span>${Utils.formatCurrency(item.price * item.qty)}</span>
                        </li>
                    `).join('')}
                </ul>
                <p><strong>Total:</strong> ${Utils.formatCurrency(total)}</p>
            `;
            document.getElementById('checkout-form').reset();
            Utils.openModal('checkout-modal');
        };

        const handleCheckout = async (e) => {
            e.preventDefault();
            const name = document.getElementById('checkout-customer-name').value.trim();
            const phone = Utils.cleanPhoneNumber(document.getElementById('checkout-customer-phone').value);
            const paymentMethod = document.getElementById('payment-method-select').value;
            if (!name || !phone) {
                return Utils.showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
            }
            if (!phone.match(/^\d{10,15}$/)) {
                return Utils.showToast('Número de telefone inválido. Use o formato: +5511987654321', 'error');
            }
            const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
            for (const item of cart) {
                const product = products.find(p => p.id === item.id);
                if (product.stock < item.qty) {
                    Utils.closeModal('checkout-modal');
                    return Utils.showToast(`Estoque insuficiente para ${item.name}.`, 'error');
                }
            }
            const finalizeBtn = document.getElementById('finalize-whatsapp-btn');
            finalizeBtn.disabled = true;
            finalizeBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Finalizando...`;
            try {
                let customer = customers.find(c => c.phone === phone);
                if (!customer) {
                    customer = await customersCollection.create({ name, phone });
                } else if (customer.name !== name) {
                    await customersCollection.update(customer.id, { name });
                }
                const saleData = {
                    items: cart.map(item => ({ ...item, qty: item.qty })),
                    total,
                    paymentMethod,
                    customerName: name,
                    customerId: customer.id,
                    type: 'online',
                    status: 'pending'
                };
                const createdSale = await salesCollection.create(saleData);
                for (const item of cart) {
                    const product = products.find(p => p.id === item.id);
                    await productsCollection.update(item.id, { stock: product.stock - item.qty });
                }
                const orderDetails = cart.map(item => `${item.qty}x ${item.name} - ${Utils.formatCurrency(item.price * item.qty)}`).join('\n');
                const message = encodeURIComponent(
                    `Olá, sou ${name} e gostaria de confirmar meu pedido:\n\n` +
                    `${orderDetails}\n\n` +
                    `Total: ${Utils.formatCurrency(total)}\n` +
                    `Pagamento: ${paymentMethod}\n` +
                    `Telefone: ${phone}`
                );
                const whatsappUrl = `https://wa.me/${Utils.cleanPhoneNumber(settings.whatsappNumber)}?text=${message}`;
                cart = [];
                localStorage.setItem('cart', JSON.stringify(cart));
                updateCart();
                Utils.closeModal('checkout-modal');
                Utils.showToast('Pedido registrado! Redirecionando para o WhatsApp...', 'success');
                setTimeout(() => {
                    window.open(whatsappUrl, '_blank');
                }, 1000);
            } catch (error) {
                console.error('Checkout error:', error);
                Utils.showToast('Erro ao finalizar o pedido.', 'error');
                finalizeBtn.disabled = false;
                finalizeBtn.innerHTML = 'Confirmar e Finalizar via WhatsApp';
            }
        };

        const toggleView = (view) => {
            currentView = view;
            document.getElementById('grid-view-btn').classList.toggle('active', view === 'grid');
            document.getElementById('list-view-btn').classList.toggle('active', view === 'list');
            renderProducts();
        };

        const bindStoreEventListeners = () => {
            document.getElementById('product-search-input')?.addEventListener('input', renderProducts);
            document.getElementById('category-filter')?.addEventListener('change', renderProducts);
            document.getElementById('cart-button')?.addEventListener('click', () => Utils.openModal('cart-modal'));
            document.getElementById('close-cart-btn')?.addEventListener('click', () => Utils.closeModal('cart-modal'));
            document.getElementById('close-product-detail-btn')?.addEventListener('click', () => Utils.closeModal('product-detail-modal'));
            document.getElementById('checkout-btn')?.addEventListener('click', openCheckoutModal);
            document.getElementById('close-checkout-btn')?.addEventListener('click', () => Utils.closeModal('checkout-modal'));
            document.getElementById('checkout-form')?.addEventListener('submit', handleCheckout);
            document.getElementById('grid-view-btn')?.addEventListener('click', () => toggleView('grid'));
            document.getElementById('list-view-btn')?.addEventListener('click', () => toggleView('list'));
            document.getElementById('modal-backdrop')?.addEventListener('click', () => {
                Utils.closeModal('cart-modal');
                Utils.closeModal('product-detail-modal');
                Utils.closeModal('checkout-modal');
            });
        };

        bindStoreSubscriptions();
        bindStoreEventListeners();
        updateCart();
        toggleView('grid'); // Initialize with grid view
    }
})();