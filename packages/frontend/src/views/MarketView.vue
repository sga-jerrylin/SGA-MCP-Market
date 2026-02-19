<template>
  <div class="page-wrap">
    <NavBar />

    <!-- Hero -->
    <section class="hero">
      <h1 class="hero-title">企业级 MCP 工具包仓库</h1>
      <div class="search-wrap">
        <a-input
          v-model:value="q"
          size="large"
          placeholder="搜索工具包名称、分类..."
          class="search-input"
          allow-clear
          @change="onSearchChange"
        >
          <template #prefix>
            <SearchOutlined style="color: #aaa" />
          </template>
        </a-input>
      </div>
      <p class="stats-row">
        <span class="stat-num">{{ stats.packages }}</span> 个工具包 ·
        <span class="stat-num">{{ stats.tools }}</span> 个工具 ·
        <span class="stat-num">{{ stats.categories }}</span> 个分类
      </p>
    </section>

    <!-- Category tabs -->
    <div class="tabs-wrap">
      <div class="tabs-inner">
        <button
          v-for="cat in categoryList"
          :key="cat"
          class="tab-btn"
          :class="{ active: activeCategory === cat }"
          @click="activeCategory = cat"
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <!-- Card grid -->
    <div class="content-wrap">
      <a-spin :spinning="loading" tip="加载中...">
        <div v-if="!loading && filtered.length === 0" class="empty-state">
          <a-empty description="暂无符合条件的工具包" />
        </div>

        <div v-else class="card-grid">
          <div
            v-for="item in paginated"
            :key="item.id"
            class="pkg-card"
            @click="goDetail(item.id)"
          >
            <div class="card-top">
              <div class="pkg-icon" :style="{ background: getIconGradient(item.name) }">
                {{ item.name.charAt(0).toUpperCase() }}
              </div>
              <div class="pkg-title-wrap">
                <span class="pkg-name">{{ item.name }}</span>
                <span class="pkg-version">v{{ item.version }}</span>
              </div>
            </div>

            <p class="pkg-desc">{{ item.description || '暂无描述' }}</p>

            <div class="card-footer">
              <span class="cat-tag" :style="{ background: getCatColor(item.category) + '22', color: getCatColor(item.category) }">
                {{ item.category }}
              </span>
              <span class="foot-meta">{{ item.toolsCount }} 个工具</span>
              <span class="foot-meta">{{ relativeTime(item.publishedAt) }}</span>
            </div>
          </div>
        </div>
      </a-spin>

      <!-- Pagination -->
      <div v-if="filtered.length > pageSize" class="pagination-wrap">
        <a-pagination
          v-model:current="currentPage"
          :total="filtered.length"
          :page-size="pageSize"
          :show-size-changer="false"
          show-quick-jumper
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { SearchOutlined } from '@ant-design/icons-vue';
import NavBar from '@/components/NavBar.vue';
import http from '@/utils/http';

interface MarketItem {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  status: string;
  toolsCount: number;
  downloads: number;
  publishedAt: string;
}

interface ApiResponse<T> {
  code: number;
  data: T | { items: T[]; total: number };
}

const router = useRouter();
const q = ref('');
const activeCategory = ref('全部');
const items = ref<MarketItem[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = 12;

// Categories derived from data + static list
const categoryList = computed(() => {
  const fromData = [...new Set(items.value.map((i) => i.category).filter(Boolean))];
  const known = ['ERP', 'CRM', '通用', 'AI模型', '文档', '办公工具'];
  const merged = [...new Set([...known, ...fromData])];
  return ['全部', ...merged];
});

const stats = computed(() => {
  const packages = items.value.length;
  const tools = items.value.reduce((s, i) => s + (i.toolsCount || 0), 0);
  const categories = new Set(items.value.map((i) => i.category).filter(Boolean)).size;
  return { packages, tools, categories };
});

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase();
  return items.value.filter((item) => {
    const catOk = activeCategory.value === '全部' || item.category === activeCategory.value;
    const keyOk =
      keyword.length === 0 ||
      item.name.toLowerCase().includes(keyword) ||
      (item.description || '').toLowerCase().includes(keyword) ||
      (item.category || '').toLowerCase().includes(keyword);
    return catOk && keyOk;
  });
});

const paginated = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filtered.value.slice(start, start + pageSize);
});

function onSearchChange(): void {
  currentPage.value = 1;
}

function goDetail(id: string): void {
  void router.push(`/market/${id}`);
}

function relativeTime(v: string): string {
  if (!v) return '';
  const diff = Date.now() - new Date(v).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return '今天';
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

// Generate a consistent gradient background based on first letter
function getIconGradient(name: string): string {
  const char = (name || 'A').charAt(0).toUpperCase();
  const code = char.charCodeAt(0) - 65; // 0-25
  const hue = (code * 37) % 360;
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 70%, 50%) 0%, hsl(${hue2}, 70%, 38%) 100%)`;
}

const catColorMap: Record<string, string> = {
  ERP: '#1677ff',
  CRM: '#52c41a',
  通用: '#fa8c16',
  'AI模型': '#722ed1',
  文档: '#eb2f96',
  办公工具: '#13c2c2',
};

function getCatColor(cat: string): string {
  if (catColorMap[cat]) return catColorMap[cat];
  const code = [...(cat || 'A')].reduce((s, c) => s + c.charCodeAt(0), 0);
  const hue = (code * 47) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await http.get<ApiResponse<MarketItem>>('/packages');
    const data = (res.data as { code: number; data: unknown }).data;
    if (data && typeof data === 'object' && 'items' in data) {
      items.value = (data as { items: MarketItem[] }).items;
    } else if (Array.isArray(data)) {
      items.value = data as MarketItem[];
    } else {
      items.value = [];
    }
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.page-wrap {
  min-height: 100vh;
  background: #f8fafc;
}

/* Hero */
.hero {
  background: linear-gradient(180deg, #e8f4ff 0%, #f5f9ff 100%);
  padding: 56px 24px 40px;
  text-align: center;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 24px;
  line-height: 1.2;
}

.search-wrap {
  max-width: 520px;
  margin: 0 auto 20px;
}

.search-input :deep(.ant-input) {
  border-radius: 999px;
  padding-left: 12px;
}

.search-input :deep(.ant-input-affix-wrapper) {
  border-radius: 999px;
  border-color: #d9e8ff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.08);
}

.stats-row {
  color: #666;
  font-size: 15px;
  margin: 0;
}

.stat-num {
  color: #1677ff;
  font-weight: 700;
}

/* Tabs */
.tabs-wrap {
  background: #fff;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 60px;
  z-index: 50;
}

.tabs-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  gap: 0;
  overflow-x: auto;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #666;
  font-size: 14px;
  padding: 14px 18px 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, border-color 0.2s;
  outline: none;
}

.tab-btn:hover {
  color: #1677ff;
}

.tab-btn.active {
  color: #1677ff;
  border-bottom-color: #1677ff;
  font-weight: 500;
}

/* Content */
.content-wrap {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}

/* Card grid */
.card-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

@media (max-width: 1200px) {
  .card-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 860px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 540px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}

.pkg-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07), 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 20px;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pkg-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pkg-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  color: #fff;
  font-weight: 700;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pkg-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pkg-name {
  font-weight: 600;
  font-size: 15px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pkg-version {
  display: inline-block;
  font-size: 11px;
  color: #888;
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 0 7px;
  line-height: 18px;
  width: fit-content;
}

.pkg-desc {
  font-size: 13px;
  color: #666;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  min-height: 39px;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.cat-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.foot-meta {
  font-size: 12px;
  color: #999;
  margin-left: auto;
}

.foot-meta:last-child {
  margin-left: 0;
}

/* Pagination */
.pagination-wrap {
  margin-top: 36px;
  display: flex;
  justify-content: center;
}
</style>
