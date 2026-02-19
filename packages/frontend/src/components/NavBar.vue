<template>
  <header class="navbar">
    <!-- Marquee announcement bar -->
    <div class="marquee-wrapper">
      <div class="marquee-track">
        <span class="marquee-text">{{ announcementText }}</span>
      </div>
    </div>

    <!-- Brand row -->
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
          <a v-if="isSuperUser" class="nav-settings-link" @click="router.push('/settings')">⚙️ 设置</a>
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
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import http from '@/utils/http';

const DEFAULT_ANNOUNCEMENT =
  '🦞 欢迎来到 Claw MCP Market · SGA-Molt 中国社区 MCP 市场 · 工具包正在持续上新中...';

withDefaults(
  defineProps<{
    showLinks?: boolean;
  }>(),
  { showLinks: false }
);

const router = useRouter();

const announcementText = ref(DEFAULT_ANNOUNCEMENT);

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

const isSuperUser = computed(() => {
  try {
    const info = localStorage.getItem('sga_user_info');
    if (!info) return false;
    const parsed = JSON.parse(info) as { isSuperUser?: boolean };
    return parsed.isSuperUser === true;
  } catch {
    return false;
  }
});

onMounted(async () => {
  try {
    const res = await http.get<{ text?: string; announcement?: string } | string>(
      '/admin/announcement'
    );
    const data = res.data;
    let text = '';
    if (typeof data === 'string') {
      text = data;
    } else if (data && typeof data === 'object') {
      text = (data as { text?: string; announcement?: string }).text ||
             (data as { text?: string; announcement?: string }).announcement || '';
    }
    if (text.trim()) {
      announcementText.value = text.trim();
    }
  } catch {
    // keep default text on error
  }
});

function logout(): void {
  localStorage.removeItem('sga_market_token');
  localStorage.removeItem('sga_user_info');
  void router.push('/login');
}
</script>

<style scoped>
.navbar {
  background: #0f1117;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid #1e2230;
}

/* ── Marquee bar ── */
.marquee-wrapper {
  background: linear-gradient(90deg, #1a1d2e, #2d1b69, #1a1d2e);
  height: 36px;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.marquee-track {
  display: inline-flex;
  white-space: nowrap;
  animation: marquee 25s linear infinite;
}

.marquee-text {
  color: #e0d7ff;
  font-size: 13px;
  white-space: nowrap;
  padding: 0 24px;
}

@keyframes marquee {
  from {
    transform: translateX(100vw);
  }
  to {
    transform: translateX(-100%);
  }
}

/* ── Brand row ── */
.navbar-inner {
  max-width: 1280px;
  margin: 0 auto;
  height: 56px;
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

.nav-settings-link {
  color: #c4b5fd;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s, color 0.2s;
}

.nav-settings-link:hover {
  background: rgba(196, 181, 253, 0.12);
  color: #ddd6fe;
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
