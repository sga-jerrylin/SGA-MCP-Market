<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header class="header">SGA MCP Market</a-layout-header>
    <a-layout-content style="padding: 24px">
      <a-breadcrumb style="margin-bottom: 12px">
        <a-breadcrumb-item><router-link to="/">首页</router-link></a-breadcrumb-item>
        <a-breadcrumb-item>{{ item?.name || '详情' }}</a-breadcrumb-item>
      </a-breadcrumb>

      <a-card v-if="item">
        <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap">
          <div>
            <h2 style="margin: 0 0 8px">{{ item.name }}</h2>
            <a-space>
              <a-tag color="blue">v{{ item.version }}</a-tag>
              <a-tag :color="item.status === 'published' ? 'green' : 'cyan'">{{ item.status }}</a-tag>
            </a-space>
          </div>
          <a-space>
            <a-button type="primary">安装 Hub 仓库</a-button>
            <a-button>软件下载包</a-button>
          </a-space>
        </div>

        <a-row :gutter="16" style="margin: 16px 0">
          <a-col :span="6"><a-statistic title="工具数量" :value="item.toolsCount" /></a-col>
          <a-col :span="6"><a-statistic title="下载次数" :value="item.downloads" /></a-col>
          <a-col :span="6"><a-statistic title="总调用次数" :value="85432" /></a-col>
          <a-col :span="6"><a-statistic title="发布日期" :value="formatDate(item.publishedAt)" /></a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="14">
            <a-card title="工具清单">
              <a-table :columns="columns" :data-source="tools" :pagination="false" row-key="index" />
            </a-card>
          </a-col>
          <a-col :span="10">
            <a-card title="标准信息">
              <a-descriptions layout="vertical" :column="1" size="small">
                <a-descriptions-item label="SHA256">{{ item.sha256 }}</a-descriptions-item>
                <a-descriptions-item label="更新日期">{{ formatDate(item.publishedAt) }}</a-descriptions-item>
              </a-descriptions>
            </a-card>
          </a-col>
        </a-row>
      </a-card>

      <a-empty v-else description="未找到该工具包" />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { TableColumnsType } from 'ant-design-vue';
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

const tools = computed<ToolRow[]>(() => {
  if (!item.value) return [];
  return Array.from({ length: item.value.toolsCount }, (_, idx) => ({
    index: idx + 1,
    name: `${item.value!.name} Tool ${idx + 1}`,
    description: `标准能力 ${idx + 1}`
  }));
});

const columns: TableColumnsType<ToolRow> = [
  { title: '序号', dataIndex: 'index', key: 'index', width: 80 },
  { title: '工具名称', dataIndex: 'name', key: 'name' },
  { title: '描述', dataIndex: 'description', key: 'description' }
];

function formatDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
}

async function load(): Promise<void> {
  const id = String(route.params.id ?? '');
  const res = await http.get<MarketItem>(`/packages/${id}`);
  item.value = res.data;
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
