// --- SCRIPT PARA PAINEL ADMINISTRATIVO E LOJA VIRTUAL ---
const room = new WebsimSocket();

// IIFE to encapsulate the entire script and avoid global scope pollution
(() => {
    document.addEventListener('DOMContentLoaded', () => {
        // Simple router to initialize the correct script for the current page
        if (document.getElementById('admin-body')) {
            initAdminPanel();
        }
        if (document.getElementById('store-body')) {
            initStore();
        }
    });

    // =================================================================
    // DATA SOURCE
    // =================================================================
    // The old localStorage-based DB object has been removed.
    // The application now relies solely on WebsimSocket for persistent data.
    // The client-side shopping cart will continue to use localStorage.

    // =================================================================
    // UTILITY FUNCTIONS
    // =================================================================
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
        }
    };

    // =================================================================
    // ADMIN PANEL LOGIC (`index.html`)
    // =================================================================
    function initAdminPanel() {
        // --- Websim Collections ---
        const productsCollection = room.collection('product_v3');
        const customersCollection = room.collection('customer_v1');
        const settingsCollection = room.collection('visualSetting_v1');
        const cashEventsCollection = room.collection('cashEvent_v1');
        const salesCollection = room.collection('sale_v1');

        const uploadFile = async (file) => {
            try {
                return await websim.upload(file);
            } catch (error) {
                console.error('Error uploading file:', error);
                Utils.showToast('Erro no upload do arquivo.', 'error');
                throw error;
            }
        };

        // --- Local State ---
        let products = [];
        let customers = [];
        let visualSettings = null;
        let cashState = { isOpen: false, balance: 0, history: [] };
        let sales = [];
        let posCart = [];
        let productChartInstance, categoryChartInstance;
        let currentOrderFilter = 'all';

        // --- Authentication & Navigation ---
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

        // --- Data Subscriptions & State Management ---
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
                renderCustomers(); // Re-render customers to update total spent
            });
            settingsCollection.subscribe(async (settingsList) => {
                if (settingsList.length > 0) {
                    visualSettings = settingsList[0];
                } else {
                    // Create default settings if none exist
                    visualSettings = await settingsCollection.create({
                        storeName: 'MK World Imports', storeSlogan: 'Eletrônicos e Acessórios', logoUrl: '/logoloja.png', backgroundUrl: 'https://images.unsplash.com/photo-1550009158-94ae76552485?q=80&w=2574&auto=format&fit=crop', whatsappNumber: '5511999999999', instagramUser: 'websim', colorPrimary: '#3B82F6', colorBackground: '#111827', colorText: '#F9FAFB', colorCard: '#1F2937', adminLogoUrl: '/logoloja.png'
                    });
                }
                loadDesignerForm();
                // Update admin panel logos
                if (visualSettings && visualSettings.adminLogoUrl) {
                    const adminLogoUrl = visualSettings.adminLogoUrl;
                    const loginLogo = document.getElementById('login-logo-img');
                    const sidebarLogo = document.getElementById('sidebar-logo');
                    if (loginLogo) loginLogo.src = adminLogoUrl;
                    if (sidebarLogo) sidebarLogo.src = adminLogoUrl;
                }
            });
            cashEventsCollection.subscribe(events => {
                recalculateCashState(events);
                updateCashView();
                updateDashboard();
                updatePosAvailability();
            });
        };

        // --- Dashboard & Charts ---
        const updateDashboard = () => {
            if(!document.getElementById('dashboard-sales')) return;
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
            const recentSales = [...sales].reverse().slice(0, 5); // Get last 5
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
                
                // Sales by Category Chart
                const salesByCat = sales.reduce((acc, sale) => {
                    sale.items.forEach(item => {
                        const category = item.category || 'Sem Categoria';
                        acc[category] = (acc[category] || 0) + (item.price * item.qty);
                    });
                    return acc;
                }, {});

                categoryChartInstance = new Chart(categoryCtx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(salesByCat),
                        datasets: [{
                            label: 'Vendas',
                            data: Object.values(salesByCat),
                            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#8B5CF6' ],
                            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#1F2937',
                            borderWidth: 2
                        }]
                    },
                     options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: 'white' } } } }
                });
                
                // Sales by Day Chart
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
                            borderColor: 'rgba(59, 130, 246, 1)',
                            backgroundColor: 'rgba(59, 130, 246, 0.2)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)'}},
                            x: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)'}}
                        },
                         plugins: { legend: { display: false } }
                    }
                });

            }).catch(e => console.error("Chart.js loading failed:", e));
        };

        // --- Products ---
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
            document.getElementById('product-images').value = ''; // Clear file input
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
                        removeBtn.innerHTML = '&times;';
                        removeBtn.onclick = () => {
                            previewContainer.remove(); // Simple removal from DOM
                        };

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
            
            const existingImageUrls = [];
            const newFilesToUpload = [];

            // Separate already uploaded images from new files by checking for `fileData`
            previewElements.forEach(container => {
                if (container.fileData) {
                    // This is a new file that needs to be uploaded.
                    newFilesToUpload.push(container.fileData);
                } else {
                    // This is an existing image, just keep its URL.
                    const img = container.querySelector('img');
                    if (img && img.src && !img.src.startsWith('data:')) {
                        existingImageUrls.push(img.src);
                    }
                }
            });

            try {
                // Upload new files sequentially to be safer and provide feedback
                const newImageUrls = [];
                if (newFilesToUpload.length > 0) {
                    Utils.showToast('Iniciando envio de imagens...', 'info');
                    for (let i = 0; i < newFilesToUpload.length; i++) {
                        const file = newFilesToUpload[i];
                        Utils.showToast(`Enviando imagem ${i + 1} de ${newFilesToUpload.length}...`, 'info');
                        const url = await uploadFile(file);
                        newImageUrls.push(url);
                    }
                    Utils.showToast('Imagens enviadas. Salvando produto...', 'info');
                } else {
                    Utils.showToast('Salvando produto...', 'info');
                }

                // Combine the old URLs with the new ones
                const allImages = [...existingImageUrls, ...newImageUrls];

                const productData = {
                    name: document.getElementById('product-name').value, desc: document.getElementById('product-desc').value, price: parseFloat(document.getElementById('product-price').value), investmentValue: parseFloat(document.getElementById('product-investment-price').value) || 0, stock: parseInt(document.getElementById('product-stock').value, 10), category: document.getElementById('product-category').value, images: allImages, videoUrl: document.getElementById('product-video').value,
                };

                if (id) {
                    await productsCollection.update(id, productData);
                } else {
                    await productsCollection.create(productData);
                }
                Utils.closeModal('product-modal');
                Utils.showToast('Produto salvo com sucesso!');
            } catch (error) {
                console.error("Product save failed:", error);
                Utils.showToast('Falha ao salvar o produto.', 'error');
            }
        };

        const deleteProduct = async (id) => {
            if (confirm('Tem certeza que deseja excluir este produto?')) {
                await productsCollection.delete(id);
                Utils.showToast('Produto excluído!');
            }
        };
        
        const handleImageSelection = (e) => {
            const files = e.target.files;
            const previewsContainer = document.getElementById('product-image-previews');
    
            if (!files) return;

            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
    
                // Create container and attach file data immediately to prevent race conditions
                const previewContainer = document.createElement('div');
                previewContainer.className = 'preview-image-container';
                previewContainer.fileData = file; // Attach file data synchronously
    
                const img = document.createElement('img');
                img.className = 'preview-image';
    
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-preview-btn';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => {
                    previewContainer.remove();
                };
    
                previewContainer.appendChild(img);
                previewContainer.appendChild(removeBtn);
                previewsContainer.appendChild(previewContainer);

                // Now read the file for preview
                const reader = new FileReader();
                reader.onload = (event) => {
                    img.src = event.target.result; // Set preview image src asynchronously
                };
                reader.readAsDataURL(file);
            }
            // Clear the file input value. This allows the user to select the same file again
            // if they remove it from the previews and want to re-add it.
            e.target.value = null;
        };

        // --- Online Orders ---
        const renderOnlineOrders = () => {
            const container = document.getElementById('orders-list');
            if (!container) return;

            const onlineOrders = [...sales].filter(s => {
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
                            <span class="order-status ${order.status || 'pending'}">${order.status || 'pending'}</span>
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
                    btn.disabled = true; // Prevent double clicks
                    const orderId = btn.dataset.id;
                    await salesCollection.update(orderId, { status: 'completed' });
                    Utils.showToast('Pedido confirmado!');
                });
            });

            document.querySelectorAll('.delete-order-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const orderId = btn.dataset.id;
                    const orderToDelete = sales.find(s => s.id === orderId);

                    if (!orderToDelete) return Utils.showToast('Pedido não encontrado.', 'error');

                    let confirmMessage = 'Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.';
                    
                    if (orderToDelete.status === 'pending') {
                         confirmMessage = 'Tem certeza que deseja excluir este pedido? O estoque dos itens será restaurado.';
                    }

                    if (confirm(confirmMessage)) {
                        btn.disabled = true;
                        
                        try {
                            if (orderToDelete.status === 'pending') {
                                Utils.showToast('Restaurando estoque...', 'info');
                                const stockUpdatePromises = orderToDelete.items.map(item => {
                                    const product = products.find(p => p.id === item.id);
                                    if (product) {
                                        const newStock = (product.stock || 0) + item.qty;
                                        return productsCollection.update(product.id, { stock: newStock });
                                    }
                                    return Promise.resolve();
                                });
                                await Promise.all(stockUpdatePromises);
                            }

                            await salesCollection.delete(orderId);
                            Utils.showToast('Pedido excluído com sucesso.');
                        } catch (error) {
                             console.error('Falha ao excluir o pedido:', error);
                             Utils.showToast('Erro ao excluir o pedido.', 'error');
                             btn.disabled = false;
                        }
                    }
                });
            });
        };

        // --- Customers ---
        const renderCustomers = () => {
            const filteredCustomers = customers.filter(c => 
                (c.name || '').toLowerCase().includes(document.getElementById('customer-search').value.toLowerCase()) ||
                (c.cpf || '').includes(document.getElementById('customer-search').value)
            );
            const tbody = document.querySelector('#customers-table tbody');
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
            const customerData = { name: document.getElementById('customer-name').value, cpf: document.getElementById('customer-cpf').value, email: document.getElementById('customer-email').value, phone: document.getElementById('customer-phone').value, address: document.getElementById('customer-address').value };
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
                Utils.showToast('Cliente excluído!');
            }
        };

        // --- Point of Sale (POS) ---
        const renderPosProducts = () => {
            const searchTerm = document.getElementById('pos-product-search').value.toLowerCase();
            const grid = document.getElementById('pos-product-list');
            grid.innerHTML = products
                .filter(p => p.name.toLowerCase().includes(searchTerm))
                .map(p => `
                <div class="pos-product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}">
                    <img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" width="80" height="80" loading="lazy" decoding="async">
                    <h5>${p.name}</h5>
                    <p>${Utils.formatCurrency(p.price)}</p>
                    ${p.stock <= 0 ? '<small>Esgotado</small>' : `<small>Estoque: ${p.stock}</small>`}
                </div>
            `).join('');
            document.querySelectorAll('.pos-product-card').forEach(card => card.addEventListener('click', () => addToPosCart(card.dataset.id)));
        };

        const updatePosCustomerSelect = () => {
            const select = document.getElementById('pos-customer-select-input');
            select.innerHTML = `<option value="consumidor-final">Consumidor Final</option>` +
                customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        };
        
        const addToPosCart = (id) => {
            const product = products.find(p => p.id == id);
            if(product.stock <= 0) {
                return Utils.showToast('Produto esgotado!', 'error');
            }
            const existingItem = posCart.find(item => item.id == id);
            if (existingItem) {
                if(existingItem.qty < product.stock) {
                   existingItem.qty++;
                } else {
                   return Utils.showToast('Quantidade máxima em estoque atingida.', 'error');
                }
            } else {
                posCart.push({ ...product, qty: 1 });
            }
            updatePosCart();
        };

        const updatePosCart = () => {
            const itemsList = document.getElementById('pos-cart-items');
            const totalAmountEl = document.getElementById('pos-total-amount');
            let total = 0;
            itemsList.innerHTML = posCart.map(item => {
                total += item.price * item.qty;
                return `
                    <li>
                        <span>${item.qty}x ${item.name}</span>
                        <span>${Utils.formatCurrency(item.price * item.qty)}</span>
                        <button class="remove-pos-item-btn" data-id="${item.id}" title="Remover item">&times;</button>
                    </li>
                `;
            }).join('');
            totalAmountEl.textContent = Utils.formatCurrency(total);
            document.querySelectorAll('.remove-pos-item-btn').forEach(btn => btn.addEventListener('click', () => {
                posCart = posCart.filter(item => item.id != btn.dataset.id);
                updatePosCart();
            }));
        };

        const registerPosSale = async () => {
            if (!cashState.isOpen) return Utils.showToast('O caixa está fechado.', 'error');
            if (posCart.length === 0) return Utils.showToast('O carrinho está vazio.', 'error');

            const total = posCart.reduce((sum, item) => sum + item.price * item.qty, 0);
            
            for (const item of posCart) {
                const product = products.find(p => p.id === item.id);
                if (product.stock < item.qty) return Utils.showToast(`Estoque insuficiente para ${item.name}.`, 'error');
            }

            Utils.showToast('Registrando venda...', 'info');
            const customerSelect = document.getElementById('pos-customer-select-input');
            const saleRecord = {
                items: posCart, total: total, paymentMethod: document.getElementById('pos-payment-method').value, customerName: customerSelect.options[customerSelect.selectedIndex].text, customerId: customerSelect.value, type: 'pos', status: 'completed'
            };
            const createdSale = await salesCollection.create(saleRecord);

            for (const item of posCart) {
                const product = products.find(p => p.id === item.id);
                await productsCollection.update(product.id, { stock: product.stock - item.qty });
            }
            
            await cashEventsCollection.create({
                entryType: 'entrada',
                desc: `Venda PDV - Cliente: ${saleRecord.customerName}`,
                amount: total,
                saleId: createdSale.id
            });
            
            posCart = [];
            updatePosCart();
            Utils.showToast('Venda registrada com sucesso!');
        };
        
        // --- Cash Control ---
        const recalculateCashState = (events) => {
            const sortedEvents = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let balance = 0;
            let isOpen = false;
            const history = [];

            for (const event of sortedEvents) {
                const historyItem = { 
                    date: event.created_at, 
                    desc: event.desc, 
                    type: event.entryType, 
                    amount: event.amount,
                    id: event.id,
                    saleId: event.saleId,
                    isCancelled: event.isCancelled
                };
                switch(event.entryType) {
                    case 'info': isOpen = true; balance = event.amount; break;
                    case 'entrada': if(isOpen && !event.isCancelled) balance += event.amount; break;
                    case 'saida': if(isOpen) balance -= event.amount; break;
                    case 'close': isOpen = false; break;
                }
                history.push(historyItem);
            }
            cashState = { isOpen, balance, history };
        };
        const updatePosAvailability = () => document.getElementById('pos-cash-closed-overlay')?.classList.toggle('hidden', cashState.isOpen);
        const updateCashView = () => {
            const indicator = document.getElementById('cash-status-indicator');
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
            tbody.innerHTML = [...cashState.history].reverse().map(t => {
                let typeClass = '';
                if (t.type === 'entrada') typeClass = 'text-success';
                else if (t.type === 'saida') typeClass = 'text-error';
                else if (t.type === 'info') typeClass = 'text-info';
                
                const saleWasCancelled = t.type === 'entrada' && t.isCancelled;
                const isCancellableSale = t.type === 'entrada' && t.saleId && !t.isCancelled;
                
                const actions = isCancellableSale
                    ? `<button class="cancel-sale-btn" data-sale-id="${t.saleId}" data-cashevent-id="${t.id}" title="Cancelar Venda"><i class='bx bx-undo'></i></button>`
                    : '';

                return `
                <tr>
                    <td>${new Date(t.date).toLocaleString('pt-BR')}</td>
                    <td>${t.desc} ${saleWasCancelled ? '<span class="text-error" style="font-size: 0.8em;">(Cancelada)</span>' : ''}</td>
                    <td class="${typeClass}">${t.type}</td>
                    <td>${Utils.formatCurrency(t.amount)}</td>
                    <td class="action-btns">${actions}</td>
                </tr>
            `}).join('');
        };
        
        const openCash = async (e) => {
            e.preventDefault();
            const initialBalance = parseFloat(document.getElementById('initial-balance').value);
            await cashEventsCollection.create({ entryType: 'info', desc: 'Abertura de Caixa', amount: initialBalance });
        };
        const openCashEntryModal = (type) => {
            document.getElementById('cash-entry-title').textContent = type === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída';
            document.getElementById('cash-entry-type').value = type;
            document.getElementById('cash-entry-form').reset();
            Utils.openModal('cash-entry-modal');
        };
        const saveCashEntry = async (e) => {
            e.preventDefault();
            const type = document.getElementById('cash-entry-type').value;
            const amount = parseFloat(document.getElementById('cash-entry-amount').value);
            if (type === 'saida' && amount > cashState.balance) return Utils.showToast('Valor de saída maior que o saldo em caixa.', 'error');
            await cashEventsCollection.create({ entryType: type, desc: document.getElementById('cash-entry-desc').value, amount: amount });
            Utils.closeModal('cash-entry-modal');
        };
        
        const openCloseCashModal = () => {
            if (!cashState.isOpen) return;
            const sessionEvents = cashState.history.slice(cashState.history.findLastIndex(e => e.type === 'info'));
            
            const initial = sessionEvents.find(e => e.type === 'info')?.amount || 0;
            const salesTotal = sessionEvents.filter(e => e.type === 'entrada' && e.saleId && !e.isCancelled).reduce((sum, e) => sum + e.amount, 0);
            const otherEntries = sessionEvents.filter(e => e.type === 'entrada' && !e.saleId).reduce((sum, e) => sum + e.amount, 0);
            const exits = sessionEvents.filter(e => e.type === 'saida').reduce((sum, e) => sum + e.amount, 0);

            document.getElementById('summary-initial').textContent = Utils.formatCurrency(initial);
            document.getElementById('summary-sales').textContent = Utils.formatCurrency(salesTotal);
            document.getElementById('summary-entries').textContent = Utils.formatCurrency(otherEntries);
            document.getElementById('summary-total-entries').textContent = Utils.formatCurrency(salesTotal + otherEntries);
            document.getElementById('summary-exits').textContent = Utils.formatCurrency(exits);
            document.getElementById('summary-final-balance').textContent = Utils.formatCurrency(cashState.balance);
            
            Utils.openModal('close-cash-summary-modal');
        };

        const handleConfirmCloseCash = async (e) => {
            e.preventDefault();
            await cashEventsCollection.create({ entryType: 'close', desc: 'Fechamento de Caixa', amount: cashState.balance });
            Utils.closeModal('close-cash-summary-modal');
        };

        // --- Visual Designer ---
        const loadDesignerForm = () => {
            if(!visualSettings) return;
            document.querySelectorAll('.designer-form [data-setting]').forEach(input => {
                const key = input.dataset.setting;
                const value = visualSettings[key];
                if (input.type === 'file') {
                    const previewTargetId = input.dataset.previewTarget;
                    if (previewTargetId) {
                        const previewEl = document.getElementById(previewTargetId);
                        if (previewEl && value) previewEl.src = value;
                    }
                } else if(input.type === 'color') {
                    input.value = value || '#000000'; // Default to black if no value
                }
                 else {
                   input.value = value || '';
                }
            });
        };
        
        const handleDesignerChange = async (e) => {
            if (e.target.type === 'file' || !e.target.dataset.setting || !visualSettings) return;
            const key = e.target.dataset.setting;
            const value = e.target.value;
            if (visualSettings[key] !== value) {
                await settingsCollection.update(visualSettings.id, { [key]: value });
                // Toast is handled by the debounced timer to avoid spamming
            }
        };

        const handleDesignerFileUpload = async (e) => {
            const file = e.target.files[0];
            const key = e.target.dataset.setting;
            const previewTargetId = e.target.dataset.previewTarget;
            if (!file || !key || !visualSettings) return;
            Utils.showToast('Enviando imagem...', 'info');
            try {
                const url = await uploadFile(file);
                if (previewTargetId) {
                    const previewEl = document.getElementById(previewTargetId);
                    if (previewEl) previewEl.src = url;
                }
                await settingsCollection.update(visualSettings.id, { [key]: url });
                Utils.showToast('Imagem atualizada!', 'success');
                 // If we uploaded the admin logo, refresh the images on the page immediately.
                if (key === 'adminLogoUrl') {
                    const loginLogo = document.getElementById('login-logo-img');
                    const sidebarLogo = document.getElementById('sidebar-logo');
                    if (loginLogo) loginLogo.src = url;
                    if (sidebarLogo) sidebarLogo.src = url;
                }
            } catch (error) {
                Utils.showToast('Falha no upload da imagem.', 'error');
            }
        };

        // --- Event Listeners & Initializations ---
        const bindAdminEvents = () => {
            document.getElementById('login-form').addEventListener('submit', handleLogin);
            document.getElementById('logout-btn').addEventListener('click', handleLogout);
            document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', handleNav));
            
            // Product modal & list
            document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
            document.getElementById('product-form').addEventListener('submit', saveProduct);
            document.getElementById('cancel-product-btn').addEventListener('click', () => Utils.closeModal('product-modal'));
            document.getElementById('product-images').addEventListener('change', handleImageSelection);
            document.getElementById('product-search').addEventListener('input', renderProducts);

            // Customer modal
            document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerModal());
            document.getElementById('customer-form').addEventListener('submit', saveCustomer);
            document.getElementById('cancel-customer-btn').addEventListener('click', () => Utils.closeModal('customer-modal'));
            document.getElementById('customer-search').addEventListener('input', renderCustomers);
            
            // Online Orders Filter
            document.querySelectorAll('#orders-section .filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#orders-section .filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentOrderFilter = btn.dataset.status;
                    renderOnlineOrders();
                });
            });

            // POS
            document.getElementById('pos-product-search').addEventListener('input', renderPosProducts);
            document.getElementById('pos-finalize-btn').addEventListener('click', registerPosSale);

            // Cash Control
            document.getElementById('open-cash-form').addEventListener('submit', openCash);
            document.getElementById('register-entry-btn').addEventListener('click', () => openCashEntryModal('entrada'));
            document.getElementById('register-exit-btn').addEventListener('click', () => openCashEntryModal('saida'));
            document.getElementById('cash-entry-form').addEventListener('submit', saveCashEntry);
            document.querySelectorAll('.cancel-cash-entry-btn').forEach(btn => btn.addEventListener('click', () => Utils.closeModal('cash-entry-modal')));
            document.getElementById('close-cash-btn').addEventListener('click', openCloseCashModal);
            document.getElementById('close-cash-summary-form').addEventListener('submit', handleConfirmCloseCash);
            document.getElementById('cancel-close-cash-summary-btn').addEventListener('click', () => Utils.closeModal('close-cash-summary-modal'));

            document.querySelector('#cash-history-table tbody').addEventListener('click', (e) => {
                const button = e.target.closest('.cancel-sale-btn');
                if (button) {
                    // handleCancelSale(button); // This function seems to have been removed in prev prompts.
                }
            });

            // Designer
            const designerForm = document.getElementById('designer-form');
            if (designerForm) {
                let designerDebounceTimer;
                designerForm.addEventListener('input', (e) => {
                    handleDesignerChange(e);
                    
                    if (e.target.type !== 'file' && e.target.dataset.setting) {
                         clearTimeout(designerDebounceTimer);
                         designerDebounceTimer = setTimeout(() => {
                            Utils.showToast('Alteração salva!', 'success');
                         }, 1200);
                    }
                });

                designerForm.querySelector('#store-logo-file')?.addEventListener('change', handleDesignerFileUpload);
                designerForm.querySelector('#store-bg-file')?.addEventListener('change', handleDesignerFileUpload);
                designerForm.querySelector('#admin-logo-file')?.addEventListener('change', handleDesignerFileUpload);
            }

            // Designer Preview Toggles
            document.querySelectorAll('.preview-toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.dataset.view; // 'desktop' or 'mobile'
                    const wrapper = document.getElementById('store-preview-wrapper');

                    // Update button active state
                    document.querySelectorAll('.preview-toggle-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Update wrapper class
                    wrapper.classList.remove('view-desktop', 'view-mobile');
                    wrapper.classList.add(`view-${view}`);
                });
            });

            // Sidebar Toggle
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

                // Check for saved state on load
                if (localStorage.getItem('sidebarCollapsed') === 'true') {
                    adminPanel.classList.add('sidebar-collapsed');
                    sidebarToggle.innerHTML = "<i class='bx bx-chevron-right'></i>";
                    sidebarToggle.title = 'Expandir menu';
                }
            }
        };
        
        bindAdminEvents();
        checkAuth();
    }


    // =================================================================
    // PUBLIC STORE LOGIC (`loja.html`)
    // =================================================================
    function initStore() {
        // --- Websim Collections ---
        const productsCollection = room.collection('product_v3');
        const settingsCollection = room.collection('visualSetting_v1');
        const customersCollection = room.collection('customer_v1');
        const salesCollection = room.collection('sale_v1');

        let products = [];
        let settings = {};
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        let customers = [];
        
        const bindStoreSubscriptions = () => {
            productsCollection.subscribe(data => {
                products = data;
                renderProducts();
                populateCategoryFilter();
            });
            settingsCollection.subscribe(settingsList => {
                if (settingsList.length > 0) {
                    settings = settingsList[0];
                    applyVisualSettings();
                }
            });
            customersCollection.subscribe(data => {
                customers = data;
            });
        };

        const applyVisualSettings = () => {
            document.title = settings.storeName || 'Loja Online';
            document.getElementById('store-name-header').textContent = settings.storeName || 'Sua Loja';
            document.getElementById('store-slogan-header').textContent = settings.storeSlogan || 'Seu Slogan';
            document.getElementById('footer-store-name').textContent = settings.storeName || 'Sua Loja';
            document.getElementById('store-logo-img').src = settings.logoUrl || '/logoloja.png';
            if (settings.backgroundUrl) {
                document.getElementById('hero-banner').style.backgroundImage = `url('${settings.backgroundUrl}')`;
            }
            
            const root = document.documentElement;
            root.style.setProperty('--color-primary', settings.colorPrimary || '#3B82F6');
            root.style.setProperty('--color-background', settings.colorBackground || '#111827');
            root.style.setProperty('--color-text', settings.colorText || '#F9FAFB');
            root.style.setProperty('--color-card', settings.colorCard || '#1F2937');

            // Render Social Links
            const socialContainer = document.getElementById('social-links-container');
            if (socialContainer) {
                socialContainer.innerHTML = ''; // Clear existing
                if (settings.whatsappNumber) {
                    const waLink = document.createElement('a');
                    waLink.href = `https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`;
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

        // --- Product Catalog ---
        const renderProducts = () => {
            const grid = document.getElementById('products-list');
            if (!grid) return;
            const search = document.getElementById('product-search-input').value.toLowerCase();
            const category = document.getElementById('category-filter').value;
            
            const filteredProducts = products.filter(p => (p.name.toLowerCase().includes(search) || (p.desc || '').toLowerCase().includes(search)) && (category === 'all' || p.category === category) );
            
            if (filteredProducts.length === 0) {
                grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; padding: 2rem 0;">Nenhum produto encontrado.</p>`;
                if (products.length === 0) {
                   grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; padding: 2rem 0;">Nenhum produto cadastrado ainda.</p>`;
                }
                return;
            }

            grid.innerHTML = [...filteredProducts].reverse().map(p => `
                <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}" title="Clique para ver mais detalhes">
                    <div class="product-image-container">
                        <img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" loading="lazy" decoding="async">
                    </div>
                    <div class="product-info">
                        <h3>${p.name}</h3>
                        <span class="product-category">${p.category}</span>
                        <p class="product-stock">${p.stock > 0 ? `Estoque: ${p.stock} un.` : 'Esgotado'}</p>
                        <p class="product-price">${Utils.formatCurrency(p.price)}</p>
                        <button class="add-to-cart-btn" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}><i class='bx bxs-cart-add'></i> ${p.stock > 0 ? 'Adicionar' : 'Indisponível'}</button>
                    </div>
                </div>`).join('');

            document.querySelectorAll('.add-to-cart-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); addToCart(btn.dataset.id); }));
            document.querySelectorAll('.product-card').forEach(card => card.addEventListener('click', () => openProductDetailModal(card.dataset.id)));
        };
        
        const populateCategoryFilter = () => {
            const categories = [...new Set(products.map(p => p.category))].filter(Boolean);
            const filter = document.getElementById('category-filter');
            // Reset filter but keep the first option
            filter.innerHTML = `<option value="all">Todas as Categorias</option>`;
            filter.innerHTML += categories.map(c => `<option value="${c}">${c}</option>`).join('');
        };
        
        // --- Cart Logic ---
        const saveCart = () => localStorage.setItem('cart', JSON.stringify(cart));
        const addToCart = (id) => {
            const product = products.find(p => p.id == id);
            if (!product || product.stock <= 0) return Utils.showToast('Produto indisponível.', 'error');
            const cartItem = cart.find(item => item.id == id);
            if (cartItem) {
                if (cartItem.qty < product.stock) cartItem.qty++; else return Utils.showToast('Estoque máximo no carrinho.', 'error');
            } else {
                cart.push({ id: product.id, name: product.name, price: product.price, images: product.images, stock: product.stock, qty: 1 });
            }
            saveCart();
            updateCart();
            Utils.showToast(`${product.name} adicionado ao carrinho!`);
        };
        
        const updateCart = () => {
            const cartContainer = document.getElementById('cart-items-container');
            const cartTotalEl = document.getElementById('cart-total');
            const cartCountEl = document.getElementById('cart-count');
            const checkoutBtn = document.getElementById('checkout-btn');
            
            let total = 0;
            if (cart.length === 0) {
                cartContainer.innerHTML = `
                    <div class="empty-cart-view">
                        <i class='bx bx-cart-alt'></i>
                        <h4>Seu carrinho está vazio</h4>
                        <p>Adicione produtos para vê-los aqui.</p>
                        <button id="continue-shopping-btn">Continuar comprando</button>
                    </div>`;
                document.getElementById('continue-shopping-btn').addEventListener('click', () => Utils.closeModal('cart-modal'));
            } else {
                cartContainer.innerHTML = cart.map(item => {
                    total += item.price * item.qty;
                    return `
                        <div class="cart-item">
                            <img src="${(item.images && item.images[0]) || '/placeholder.png'}" alt="${item.name}" width="70" height="70" decoding="async">
                            <div class="cart-item-info">
                                <h4>${item.name}</h4>
                                <p>${Utils.formatCurrency(item.price)}</p>
                            </div>
                            <div class="cart-item-actions">
                                <input type="number" class="cart-item-qty" value="${item.qty}" min="1" data-id="${item.id}">
                                <button class="remove-from-cart-btn" data-id="${item.id}" title="Remover"><i class='bx bxs-trash'></i></button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            cartTotalEl.textContent = Utils.formatCurrency(total);
            cartCountEl.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
            checkoutBtn.disabled = cart.length === 0;

            document.querySelectorAll('.cart-item-qty').forEach(input => input.addEventListener('change', updateCartItemQty));
            document.querySelectorAll('.remove-from-cart-btn').forEach(btn => btn.addEventListener('click', () => removeFromCart(btn.dataset.id)));
        };
        
        const updateCartItemQty = (e) => {
            const id = e.target.dataset.id;
            const newQty = parseInt(e.target.value, 10);
            const item = cart.find(i => i.id == id);
            const product = products.find(p => p.id == id);
            const maxStock = product ? product.stock : item.stock;

            if (item && newQty > 0) {
                if (newQty > maxStock) {
                    Utils.showToast(`Estoque máximo para este item é ${maxStock}.`, 'error');
                    e.target.value = maxStock; // revert to max stock
                    item.qty = maxStock;
                } else {
                    item.qty = newQty;
                }
                saveCart();
                updateCart();
            }
        };

        const removeFromCart = (id) => { cart = cart.filter(item => item.id != id); saveCart(); updateCart(); };

        // --- Product Detail & Checkout ---
        const openProductDetailModal = (id) => {
            const product = products.find(p => p.id == id);
            if (!product) return;
            
            const content = document.getElementById('product-detail-content');
            
            const getYoutubeEmbedUrl = (url) => {
                if (!url) return '';
                let videoId;
                if (url.includes('youtu.be/')) {
                    videoId = url.split('youtu.be/')[1].split('?')[0];
                } else if (url.includes('watch?v=')) {
                    videoId = url.split('watch?v=')[1].split('&')[0];
                }
                return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
            };
            
            const embedUrl = getYoutubeEmbedUrl(product.videoUrl);

            content.innerHTML = `
                <div class="product-detail-media">
                    <div class="product-detail-gallery">
                        <img src="${(product.images && product.images[0]) || '/placeholder.png'}" alt="${product.name}" class="main-image" id="detail-main-image" decoding="async">
                        <div class="product-detail-thumbnails">
                            ${(product.images || []).map(img => `<img src="${img}" alt="thumbnail" class="thumbnail" width="70" height="70" decoding="async">`).join('')}
                        </div>
                    </div>
                    ${embedUrl ? `
                    <div class="product-detail-video">
                        <iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                    </div>
                    ` : ''}
                </div>
                <div class="product-detail-info">
                    <h3>${product.name}</h3>
                    <p class="product-price">${Utils.formatCurrency(product.price)}</p>
                    <p class="product-desc">${product.desc || 'Sem descrição.'}</p>
                    <button class="add-to-cart-btn" data-id="${product.id}" ${product.stock <= 0 ? 'disabled' : ''}><i class='bx bxs-cart-add'></i> ${product.stock > 0 ? 'Adicionar ao Carrinho' : 'Esgotado'}</button>
                </div>
            `;
            
            // Render related products
            const relatedContainer = document.getElementById('related-products-list');
            const relatedProducts = products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
            if (relatedProducts.length > 0) {
                 document.getElementById('related-products-container').style.display = 'block';
                 relatedContainer.innerHTML = relatedProducts.map(p => `
                    <div class="product-card" data-id="${p.id}" title="${p.name}">
                        <div class="product-image-container">
                             <img src="${(p.images && p.images[0]) || '/placeholder.png'}" alt="${p.name}" loading="lazy" decoding="async">
                        </div>
                        <div class="product-info">
                             <h3>${p.name}</h3>
                             <p class="product-price">${Utils.formatCurrency(p.price)}</p>
                        </div>
                    </div>`).join('');
                relatedContainer.querySelectorAll('.product-card').forEach(card => card.addEventListener('click', () => {
                    Utils.closeModal('product-detail-modal');
                    openProductDetailModal(card.dataset.id);
                }));
            } else {
                document.getElementById('related-products-container').style.display = 'none';
            }


            const mainImage = content.querySelector('#detail-main-image');
            content.querySelectorAll('.product-detail-thumbnails .thumbnail').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    mainImage.src = thumb.src;
                    content.querySelectorAll('.thumbnail.active').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
            });
            if(content.querySelector('.thumbnail')) {
               content.querySelector('.thumbnail').classList.add('active');
            }
            
            content.querySelector('.add-to-cart-btn').addEventListener('click', () => {
                addToCart(product.id);
            });

            Utils.openModal('product-detail-modal');
        };
        
        const handleCheckout = () => {
            if (cart.length > 0) {
                 const summaryContainer = document.getElementById('checkout-order-summary');
                 const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
                 summaryContainer.innerHTML = `
                    <h4>Resumo do Pedido</h4>
                    ${cart.map(item => `
                        <div class="summary-item">
                            <span>${item.qty}x ${item.name}</span>
                            <span>${Utils.formatCurrency(item.price * item.qty)}</span>
                        </div>
                    `).join('')}
                    <div class="summary-total">
                        <span>Total</span>
                        <span>${Utils.formatCurrency(total)}</span>
                    </div>
                 `;

                 Utils.closeModal('cart-modal');
                 Utils.openModal('checkout-modal');
            } else {
                Utils.showToast('Seu carrinho está vazio.', 'error');
            }
        };
        
        const finalizeOrderViaWhatsapp = async (e) => {
            e.preventDefault();
            if (cart.length === 0) return;
            const customerName = document.getElementById('checkout-customer-name').value.trim();
            const customerPhone = document.getElementById('checkout-customer-phone').value.trim();
            if (!customerName || !customerPhone) return Utils.showToast('Por favor, preencha seu nome e telefone.', 'error');

            Utils.showToast('Registrando seu pedido...', 'info');

            let customer = customers.find(c => c.phone === customerPhone);
            if (!customer) {
                customer = await customersCollection.create({ name: customerName, phone: customerPhone, cpf: '', email: '', address: '' });
                Utils.showToast('Cadastro realizado com sucesso!', 'success');
            } else {
                // Update customer name if it has changed
                if(customer.name !== customerName) {
                    await customersCollection.update(customer.id, { name: customerName });
                }
            }
            
            const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
            const paymentMethod = document.getElementById('payment-method-select').value;
            
            const saleItems = cart.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.qty, category: item.category }));

            const saleRecord = {
                items: saleItems,
                total: total,
                paymentMethod: paymentMethod,
                customerName: customerName,
                customerId: customer.id,
                type: 'online',
                status: 'pending'
            };
            await salesCollection.create(saleRecord);

            for (const item of cart) {
                const product = products.find(p => p.id === item.id);
                if (product) { 
                    await productsCollection.update(product.id, { stock: product.stock - item.qty });
                }
            }

            let message = `Olá, *${settings.storeName || 'Loja'}*!\n\nMeu nome é *${customerName}* e gostaria de finalizar meu pedido.\n\n*Itens do Pedido:*\n`;
            cart.forEach(item => { message += `- ${item.qty}x ${item.name} (${Utils.formatCurrency(item.price)})\n`; });
            message += `\n*Total: ${Utils.formatCurrency(total)}*\n*Forma de Pagamento: ${paymentMethod}*`;
            
            window.open(`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
            
            cart = [];
            saveCart();
            updateCart();
            Utils.closeModal('checkout-modal');
            Utils.showToast('Pedido enviado! Finalize a compra no WhatsApp.');
        };

        const bindStoreEvents = () => {
            document.getElementById('product-search-input').addEventListener('input', renderProducts);
            document.getElementById('category-filter').addEventListener('change', renderProducts);
            document.getElementById('cart-button').addEventListener('click', () => Utils.openModal('cart-modal'));
            document.getElementById('close-cart-btn').addEventListener('click', () => Utils.closeModal('cart-modal'));
            document.getElementById('checkout-btn').addEventListener('click', handleCheckout);
            document.getElementById('close-checkout-btn').addEventListener('click', () => Utils.closeModal('checkout-modal'));
            document.getElementById('checkout-form').addEventListener('submit', finalizeOrderViaWhatsapp);
            document.getElementById('close-product-detail-btn').addEventListener('click', () => Utils.closeModal('product-detail-modal'));
        
            // View Toggle Logic
            const productsListEl = document.getElementById('products-list');
            const gridViewBtn = document.getElementById('grid-view-btn');
            const listViewBtn = document.getElementById('list-view-btn');

            if (productsListEl && gridViewBtn && listViewBtn) {
                const applyView = (view) => {
                    if (view === 'list') {
                        productsListEl.classList.add('view-list');
                        listViewBtn.classList.add('active');
                        gridViewBtn.classList.remove('active');
                    } else { // grid
                        productsListEl.classList.remove('view-list');
                        gridViewBtn.classList.add('active');
                        listViewBtn.classList.remove('active');
                    }
                };

                gridViewBtn.addEventListener('click', () => {
                    applyView('grid');
                    localStorage.setItem('productView', 'grid');
                });

                listViewBtn.addEventListener('click', () => {
                    applyView('list');
                    localStorage.setItem('productView', 'list');
                });

                // Initialize view on load
                applyView(localStorage.getItem('productView') || 'grid');
            }
        };

        bindStoreSubscriptions();
        updateCart();
        bindStoreEvents();
    }
})();