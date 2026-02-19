<template>
  <header class="navbar">
    <div class="navbar-inner">
      <div class="navbar-left">
        <img src="/logo.jpg" alt="MCP Claw" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;" />
        <span class="brand-text">MCP Market</span>
        <span class="brand-by">by SGA</span>
        <nav v-if="showLinks" class="nav-links">
          <router-link to="/" class="nav-link">首页</router-link>
          <a href="#" class="nav-link">市场</a>
          <a href="#" class="nav-link">文档</a>
          <a href="#" class="nav-link">支持</a>
        </nav>
      </div>
      <div class="navbar-right">
        <template v-if="isLoggedIn">
          <span class="user-email">{{ userEmail }}</span>
          <a-button class="logout-btn" @click="logout">Logout</a-button>
        </template>
        <template v-else>
          <router-link to="/login">
            <a-button class="logout-btn">登录</a-button>
          </router-link>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const props = withDefaults(
  defineProps<{
    showLinks?: boolean;
  }>(),
  { showLinks: false }
);

const router = useRouter();

const isLoggedIn = computed(() => !!localStorage.getItem('sga_market_token'));

const userEmail = computed(() => {
  const token = localStorage.getItem('sga_market_token');
  if (!token) return '';
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      return (payload.email as string) || (payload.sub as string) || '';
    }
  } catch {
    // not a JWT
  }
  return '';
});

function logout(): void {
  localStorage.removeItem('sga_market_token');
  void router.push('/login');
}
</script>

<style scoped>
.navbar {
  background: #0f1117;
  height: 60px;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid #1e2230;
}

.navbar-inner {
  max-width: 1280px;
  margin: 0 auto;
  height: 100%;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-text {
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  white-space: nowrap;
}

.brand-by {
  color: #8b92a5;
  font-size: 11px;
  white-space: nowrap;
  margin-left: -4px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 16px;
}

.nav-link {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  transition: color 0.2s, background 0.2s;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-email {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.logout-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 13px;
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  transition: border-color 0.2s, color 0.2s;
}

.logout-btn:hover {
  border-color: rgba(255, 255, 255, 0.6) !important;
  color: #fff !important;
  background: rgba(255, 255, 255, 0.08) !important;
}
</style>
