<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header class="header">SGA MCP Market</a-layout-header>
    <a-layout-content style="padding: 24px">
      <h1 style="font-size: 30px; font-weight: 700; margin-bottom: 8px">企业级 MCP 工具包仓库</h1>
      <a-row :gutter="16" style="margin-bottom: 16px">
        <a-col :span="8"><a-statistic title="工具包" :value="24" /></a-col>
        <a-col :span="8"><a-statistic title="工具" :value="312" /></a-col>
        <a-col :span="8"><a-statistic title="分类" :value="7" /></a-col>
      </a-row>

      <a-input-search
        v-model:value="q"
        placeholder="搜索工具包、工具..."
        style="max-width: 520px; margin-bottom: 12px"
      />

      <a-tabs v-model:activeKey="category" style="margin-bottom: 16px">
        <a-tab-pane v-for="item in categories" :key="item" :tab="item" />
      </a-tabs>

      <a-list :grid="{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }" :data-source="filtered">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-card hoverable @click="goDetail(item.id)">
              <template #title>
                <a-space>
                  <span>{{ item.name }}</span>
                  <a-tag color="blue">v{{ item.version }}</a-tag>
                  <a-tag :color="item.status === 'published' ? 'green' : 'cyan'">{{ item.status }}</a-tag>
                </a-space>
              </template>
              <p style="min-height: 40px">{{ item.description || '无描述' }}</p>
              <a-tag>{{ item.category }}</a-tag>
              <div style="margin-top: 10px; color: #666; display: flex; justify-content: space-between">
                <span>工具 {{ item.toolsCount }}</span>
                <span>下载 {{ item.downloads }}</span>
                <span>{{ formatDate(item.publishedAt) }}</span>
              </div>
            </a-card>
          </a-list-item>
        </template>
      </a-list>
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
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

const router = useRouter();
const q = ref('');
const category = ref('全部');
const categories = ['全部', 'ERP', 'CRM', '通用', 'AI', '数据', '其他'];
const items = ref<MarketItem[]>([]);

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase();
  return items.value.filter((item) => {
    const catOk = category.value === '全部' || item.category === category.value;
    const keyOk =
      keyword.length === 0 ||
      item.name.toLowerCase().includes(keyword) ||
      (item.description || '').toLowerCase().includes(keyword);
    return catOk && keyOk;
  });
});

function goDetail(id: string): void {
  void router.push(`/market/${id}`);
}

function formatDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
}

async function load(): Promise<void> {
  const res = await http.get<MarketItem[]>('/packages');
  items.value = res.data;
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.header {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
</style>
