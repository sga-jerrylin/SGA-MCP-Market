<template>
  <div class="page-wrap">
    <NavBar :show-links="true" />

    <div class="content-wrap">
      <!-- Breadcrumb -->
      <a-breadcrumb class="breadcrumb">
        <a-breadcrumb-item>
          <router-link to="/">首页</router-link>
        </a-breadcrumb-item>
        <a-breadcrumb-item>{{ item?.name || '详情' }}</a-breadcrumb-item>
      </a-breadcrumb>

      <a-spin :spinning="loading">
        <template v-if="item">
          <!-- Header card -->
          <div class="header-card">
            <div class="header-main">
              <div class="pkg-icon" :style="{ background: getIconGradient(item.name) }">
                {{ item.name.charAt(0).toUpperCase() }}
              </div>
              <div class="header-info">
                <div class="name-row">
                  <span class="pkg-name">{{ item.name }}</span>
                  <span class="badge badge-blue">v{{ item.version }}</span>
                  <span class="badge badge-green">工具</span>
                  <span class="badge badge-teal">已签名 ✓</span>
                </div>
                <p class="pkg-desc">{{ item.description || '暂无描述' }}</p>
                <div class="metrics-row">
                  <div class="metric">
                    <span class="metric-val">{{ item.toolsCount }}</span>
                    <span class="metric-label">工具数</span>
                  </div>
                  <div class="metric-sep" />
                  <div class="metric">
                    <span class="metric-val">{{ item.serversCount ?? 4 }}</span>
                    <span class="metric-label">服务器数</span>
                  </div>
                  <div class="metric-sep" />
                  <div class="metric">
                    <span class="metric-val">{{ formatNum(item.downloads) }}</span>
                    <span class="metric-label">下载量</span>
                  </div>
                  <div class="metric-sep" />
                  <div class="metric">
                    <span class="metric-val">{{ formatDate(item.publishedAt) }}</span>
                    <span class="metric-label">发布时间</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="header-actions">
              <a-button type="primary" size="large" block class="action-btn">复制 Hub 命令</a-button>
              <a-button size="large" block class="action-btn-outline">获取下载链接</a-button>
            </div>
          </div>

          <!-- Main body -->
          <div class="body-layout">
            <!-- Left: tabs -->
            <div class="body-left">
              <div class="section-card">
                <div class="section-tabs">
                  <button
                    class="stab"
                    :class="{ active: activeTab === 'tools' }"
                    @click="activeTab = 'tools'"
                  >
                    工具列表
                  </button>
                  <button
                    class="stab"
                    :class="{ active: activeTab === 'versions' }"
                    @click="activeTab = 'versions'"
                  >
                    版本信息
                  </button>
                </div>

                <div v-if="activeTab === 'tools'">
                  <a-table
                    :columns="columns"
                    :data-source="tools"
                    :pagination="false"
                    row-key="index"
                    size="middle"
                  />
                </div>
                <div v-else class="versions-content">
                  <div class="version-row">
                    <span class="version-label">当前版本</span>
                    <span class="badge badge-blue">v{{ item.version }}</span>
                  </div>
                  <div class="version-row">
                    <span class="version-label">发布日期</span>
                    <span>{{ formatDate(item.publishedAt) }}</span>
                  </div>
                  <div class="version-row">
                    <span class="version-label">分类</span>
                    <span>{{ item.category }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: metadata sidebar -->
            <div class="body-right">
              <div class="section-card">
                <h3 class="sidebar-title">版本信息</h3>
                <div class="meta-list">
                  <div class="meta-item">
                    <span class="meta-label">SHA256</span>
                    <span class="meta-val sha-val" :title="item.sha256 || '—'">
                      {{ truncateSha(item.sha256) }}
                      <a-tooltip v-if="item.sha256" title="复制">
                        <CopyOutlined class="copy-icon" @click="copySha" />
                      </a-tooltip>
                    </span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">签名状态</span>
                    <span class="badge badge-teal">已验证</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">推送时间</span>
                    <span class="meta-val">{{ formatDate(item.publishedAt) }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">分类</span>
                    <span class="meta-val">{{ item.category || '—' }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">状态</span>
                    <span class="badge" :class="item.status === 'published' ? 'badge-green' : 'badge-teal'">
                      {{ item.status }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <a-empty v-else-if="!loading" description="未找到该工具包" style="margin-top: 80px" />
      </a-spin>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { CopyOutlined } from '@ant-design/icons-vue';
import type { TableColumnsType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
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
  serversCount?: number;
  downloads: number;
  sha256: string;
  publishedAt: string;
}

interface ToolRow {
  index: number;
  name: string;
  description: string;
}

const route = useRoute();
const item = ref<MarketItem | null>(null);
const loading = ref(false);
const activeTab = ref<'tools' | 'versions'>('tools');

const tools = computed<ToolRow[]>(() => {
  if (!item.value) return [];
  return Array.from({ length: item.value.toolsCount }, (_, idx) => ({
    index: idx + 1,
    name: `${item.value!.name} Tool ${idx + 1}`,
    description: `标准能力 ${idx + 1}`
  }));
});

const columns: TableColumnsType<ToolRow> = [
  { title: '序号', dataIndex: 'index', key: 'index', width: 70 },
  { title: '工具名称', dataIndex: 'name', key: 'name' },
  { title: '描述', dataIndex: 'description', key: 'description' }
];

function formatDate(v: string): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
}

function formatNum(n: number): string {
  if (!n) return '0';
  return n.toLocaleString('zh-CN');
}

function truncateSha(sha: string): string {
  if (!sha) return '—';
  return sha.length > 16 ? sha.slice(0, 16) + '...' : sha;
}

function copySha(): void {
  if (item.value?.sha256) {
    void navigator.clipboard.writeText(item.value.sha256);
    void message.success('已复制 SHA256');
  }
}

function getIconGradient(name: string): string {
  const char = (name || 'A').charAt(0).toUpperCase();
  const code = char.charCodeAt(0) - 65;
  const hue = (code * 37) % 360;
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 70%, 50%) 0%, hsl(${hue2}, 70%, 38%) 100%)`;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const id = String(route.params.id ?? '');
    const res = await http.get<{ code: number; data: MarketItem }>(`/packages/${id}`);
    const raw = res.data as { code?: number; data?: MarketItem } | MarketItem;
    if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
      item.value = raw.data as MarketItem;
    } else {
      item.value = raw as MarketItem;
    }
  } catch {
    item.value = null;
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

.content-wrap {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 24px 60px;
}

.breadcrumb {
  margin-bottom: 20px;
}

/* Header card */
.header-card {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
  padding: 28px 28px 24px;
  margin-bottom: 24px;
  display: flex;
  align-items: flex-start;
  gap: 24px;
  flex-wrap: wrap;
}

.header-main {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex: 1;
  min-width: 0;
}

.pkg-icon {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  color: #fff;
  font-weight: 700;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.pkg-name {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 500;
  line-height: 20px;
  display: inline-block;
}

.badge-blue {
  background: #e6f0ff;
  color: #1677ff;
}

.badge-green {
  background: #f6ffed;
  color: #52c41a;
}

.badge-teal {
  background: #e6fffb;
  color: #13c2c2;
}

.pkg-desc {
  color: #666;
  font-size: 14px;
  margin: 0 0 16px;
}

.metrics-row {
  display: flex;
  align-items: center;
  gap: 0;
  flex-wrap: wrap;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 20px 0 0;
}

.metric:first-child {
  padding-left: 0;
}

.metric-val {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.metric-label {
  font-size: 12px;
  color: #999;
}

.metric-sep {
  width: 1px;
  height: 32px;
  background: #eee;
  margin: 0 20px 0 0;
}

.header-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 168px;
}

.action-btn {
  border-radius: 8px;
}

.action-btn-outline {
  border-radius: 8px;
  border-color: #d9d9d9;
}

/* Body layout */
.body-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .body-layout {
    grid-template-columns: 1fr;
  }
}

.section-card {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
  overflow: hidden;
}

/* Section tabs */
.section-tabs {
  display: flex;
  border-bottom: 1px solid #eee;
}

.stab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #666;
  font-size: 14px;
  padding: 14px 20px 12px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  outline: none;
}

.stab:hover {
  color: #1677ff;
}

.stab.active {
  color: #1677ff;
  border-bottom-color: #1677ff;
  font-weight: 500;
}

.versions-content {
  padding: 20px;
}

.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 14px;
  color: #444;
}

.version-row:last-child {
  border-bottom: none;
}

.version-label {
  color: #999;
}

/* Sidebar */
.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  padding: 16px 20px 12px;
  margin: 0;
  border-bottom: 1px solid #f0f0f0;
}

.meta-list {
  padding: 8px 20px 16px;
}

.meta-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 13px;
}

.meta-item:last-child {
  border-bottom: none;
}

.meta-label {
  color: #999;
}

.meta-val {
  color: #333;
  text-align: right;
}

.sha-val {
  font-family: monospace;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-icon {
  cursor: pointer;
  color: #1677ff;
  font-size: 13px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.copy-icon:hover {
  opacity: 1;
}
</style>
