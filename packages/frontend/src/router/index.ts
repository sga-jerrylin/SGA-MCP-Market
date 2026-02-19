import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'Market', component: () => import('@/views/MarketView.vue') },
    { path: '/market/:id', name: 'MarketDetail', component: () => import('@/views/MarketDetail.vue') },
    { path: '/login', name: 'Login', component: () => import('@/views/Auth/LoginView.vue') },
    {
      path: '/tokens',
      name: 'TokenView',
      component: () => import('@/views/Auth/TokenView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true, requiresSuperUser: true }
    }
  ]
});

router.beforeEach((to) => {
  const token = localStorage.getItem('sga_market_token');

  if (to.meta.requiresAuth && !token) {
    return { path: '/login' };
  }

  if (to.meta.requiresSuperUser) {
    try {
      const info = localStorage.getItem('sga_user_info');
      const parsed = info ? (JSON.parse(info) as { isSuperUser?: boolean }) : null;
      if (!parsed || parsed.isSuperUser !== true) {
        return { path: '/' };
      }
    } catch {
      return { path: '/' };
    }
  }

  if (to.path === '/login' && token) {
    return { path: '/tokens' };
  }

  return true;
});

export default router;
