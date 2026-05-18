// ==========================================
// 每日打卡 - Service Worker
// ==========================================

const CACHE_NAME = 'checkin-cache-v5';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// 安装 Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('缓存打开');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 激活 Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(name => {
                    if (name !== CACHE_NAME) {
                        console.log('删除旧缓存:', name);
                        return caches.delete(name);
                    }
                })
            );
        })
    );
});

// 判断是否为静态资源请求
function isStaticAsset(request) {
    const url = new URL(request.url);
    return ASSETS.some(asset => url.pathname.endsWith(asset.replace('./', '')));
}

// 拦截请求 - 静态资源缓存优先，其他请求网络优先
self.addEventListener('fetch', event => {
    // 非 GET 请求直接走网络
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                // 缓存命中：发起网络请求更新缓存，同时返回缓存内容
                if (isStaticAsset(event.request)) {
                    fetch(event.request).then(response => {
                        if (response.ok) {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, response.clone());
                            });
                        }
                    }).catch(() => {});
                }
                return cachedResponse;
            }

            // 缓存未命中：走网络
            return fetch(event.request).then(response => {
                if (response.ok && isStaticAsset(event.request)) {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clonedResponse);
                    });
                }
                return response;
            }).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return new Response('离线', { status: 503 });
            });
        })
    );
});

// 监听消息
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
