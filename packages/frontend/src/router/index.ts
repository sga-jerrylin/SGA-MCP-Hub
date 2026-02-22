import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import MainLayout from '@/layouts/MainLayout.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: 'Dashboard' }
      },
      {
        path: 'repository',
        name: 'Repository',
        component: () => import('@/views/Repository/RepoView.vue'),
        meta: { title: 'Repository' }
      },
      {
        path: 'connect',
        name: 'HubConnect',
        component: () => import('@/views/Connect/HubConnect.vue'),
        meta: { title: 'Hub Connect' }
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('@/views/Monitor/MonitorView.vue'),
        meta: { title: 'Monitor' }
      },
      {
        path: 'settings/market',
        name: 'MarketSettings',
        component: () => import('@/views/Settings/MarketSettings.vue'),
        meta: { title: 'Market Settings' }
      },
      {
        path: 'admin/tenants',
        name: 'TenantManagement',
        component: () => import('@/views/Admin/TenantManagement.vue'),
        meta: { title: 'Tenant Management' }
      },
      {
        path: 'admin/tenants/:tenantId/keys',
        name: 'KeyManagement',
        component: () => import('@/views/Admin/KeyManagement.vue'),
        meta: { title: 'API Key Management' }
      }
    ]
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Auth/LoginView.vue'),
    meta: { title: 'Login' }
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('mcp_token');
  const isLoginPage = to.path === '/login';
  if (!token && !isLoginPage) {
    next('/login');
  } else if (token && isLoginPage) {
    next('/');
  } else {
    next();
  }
});

router.afterEach((to) => {
  const title = (to.meta?.title as string) || 'MCP Claw';
  document.title = `${title} - MCP Claw`;
});

export default router;
