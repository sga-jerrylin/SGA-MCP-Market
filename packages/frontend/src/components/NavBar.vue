<template>
  <header class="navbar">
    <div
      class="marquee-wrapper"
      @mouseenter="pauseCarousel"
      @mouseleave="resumeCarousel"
    >
      <div class="marquee-shimmer"></div>
      <transition name="marquee-fade" mode="out-in">
        <span class="marquee-text" :key="currentIndex">{{ displayAnnouncement }}</span>
      </transition>
    </div>

    <div v-if="showBrand" class="navbar-inner">
      <div class="navbar-left">
        <img
          src="/logo.jpg"
          alt="MCP Claw"
          style="width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex-shrink: 0"
        />
        <span class="brand-text">MCP Market</span>
        <span class="brand-by">by SGA</span>
        <nav v-if="showLinks" class="nav-links">
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/" class="nav-link">市场</router-link>
          <a href="#" class="nav-link">文档</a>
          <a href="#" class="nav-link">支持</a>
        </nav>
      </div>

      <div class="navbar-right">
        <template v-if="isLoggedIn">
          <router-link to="/tokens" class="nav-token-link">令牌</router-link>
          <a
            v-if="isSuperUser"
            class="nav-settings-link"
            @click="router.push('/settings')"
          >
            设置
          </a>
          <span class="user-email">{{ userEmail }}</span>
          <span v-if="isSuperUser" class="role-badge super">超级管理员</span>
          <span v-else class="role-badge member">普通用户</span>
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
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import http from '@/utils/http';

const DEFAULT_ANNOUNCEMENTS = [
  '欢迎来到 Claw MCP Market · SGA 社区 MCP 市场 · 工具包持续更新中',
];

interface AnnouncementItem {
  id?: number;
  content?: string;
  source?: string;
  priority?: number;
}

interface AnnouncementResponse {
  content?: string;
  text?: string;
  announcement?: string;
  items?: AnnouncementItem[];
}

withDefaults(
  defineProps<{
    showLinks?: boolean;
    showBrand?: boolean;
  }>(),
  { showLinks: false, showBrand: true }
);

const router = useRouter();

const announcementItems = ref<string[]>([...DEFAULT_ANNOUNCEMENTS]);
const currentIndex = ref(0);
const carouselTimer = ref<number | null>(null);

const displayAnnouncement = computed(() => {
  if (!announcementItems.value.length) {
    return DEFAULT_ANNOUNCEMENTS[0];
  }
  return announcementItems.value[currentIndex.value] ?? announcementItems.value[0];
});

const isLoggedIn = computed(() => Boolean(localStorage.getItem('sga_market_token')));

const userEmail = computed(() => {
  const token = localStorage.getItem('sga_market_token');
  if (!token) return '';
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1])) as { email?: string; sub?: string };
      return payload.email ?? payload.sub ?? '';
    }
  } catch {
    return '';
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

function normalizeAnnouncements(data: AnnouncementResponse | string): string[] {
  if (typeof data === 'string') {
    return data
      .split('|')
      .map((item: string) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    const items = data.items
      .map((item: AnnouncementItem) => (item.content ?? '').trim())
      .filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }

  const fallback = data.content ?? data.text ?? data.announcement ?? '';
  return fallback
    .split('|')
    .map((item: string) => item.trim())
    .filter(Boolean);
}

function clearCarouselTimer(): void {
  if (carouselTimer.value !== null) {
    window.clearInterval(carouselTimer.value);
    carouselTimer.value = null;
  }
}

function resumeCarousel(): void {
  if (announcementItems.value.length <= 1 || carouselTimer.value !== null) {
    return;
  }
  carouselTimer.value = window.setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % announcementItems.value.length;
  }, 8000);
}

function pauseCarousel(): void {
  clearCarouselTimer();
}

async function loadAnnouncements(): Promise<void> {
  try {
    const res = await http.get<AnnouncementResponse | string>('/admin/announcement');
    const items = normalizeAnnouncements(res.data);
    if (items.length > 0) {
      announcementItems.value = items;
      currentIndex.value = 0;
    }
  } catch {
    announcementItems.value = [...DEFAULT_ANNOUNCEMENTS];
    currentIndex.value = 0;
  }
}

function logout(): void {
  localStorage.removeItem('sga_market_token');
  localStorage.removeItem('sga_user_info');
  void router.push('/login');
}

onMounted(async () => {
  await loadAnnouncements();
  resumeCarousel();
});

onUnmounted(() => {
  clearCarouselTimer();
});
</script>

<style scoped>
.navbar {
  background: #0f1117;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid #1e2230;
}

.marquee-wrapper {
  position: relative;
  height: 48px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  background: linear-gradient(90deg, #1a1d2e, #2d1b69, #1e3a5f, #1a1d2e);
  background-size: 200% 200%;
  animation: marquee-gradient 8s ease infinite;
}

.marquee-shimmer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    110deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 35%,
    transparent 70%
  );
  transform: translateX(-120%);
  animation: marquee-shimmer 3.8s linear infinite;
}

.marquee-text {
  position: relative;
  z-index: 1;
  font-size: 15px;
  font-weight: 500;
  color: #e8e0ff;
  text-align: center;
  text-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
  max-width: 1200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.marquee-fade-enter-active,
.marquee-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.marquee-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.marquee-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@keyframes marquee-gradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@keyframes marquee-shimmer {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(140%);
  }
}

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

.nav-token-link {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.2s;
}

.nav-token-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.role-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.role-badge.super {
  background: rgba(124, 58, 237, 0.3);
  color: #c4b5fd;
  border: 1px solid rgba(124, 58, 237, 0.4);
}

.role-badge.member {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
</style>
