<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header class="header">Token 管理</a-layout-header>
    <a-layout-content style="padding: 24px; max-width: 980px; margin: 0 auto; width: 100%">
      <a-card title="创建新 Token" style="margin-bottom: 16px">
        <a-form layout="vertical" @finish="createToken">
          <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入名称' }]">
            <a-input v-model:value="form.name" placeholder="例如 CI Deploy" />
          </a-form-item>
          <a-form-item label="Scope（逗号分隔）">
            <a-input v-model:value="form.scopeText" placeholder="publish,read" />
          </a-form-item>
          <a-form-item label="过期时间（可选）">
            <a-input v-model:value="form.expiresAt" placeholder="2026-12-31T23:59:59.000Z" />
          </a-form-item>
          <a-button type="primary" html-type="submit" :loading="creating">生成 Token</a-button>
          <a-button style="margin-left: 8px" @click="logout">退出登录</a-button>
        </a-form>
      </a-card>

      <a-alert v-if="newToken" type="success" show-icon style="margin-bottom: 16px">
        <template #message>新 Token（仅展示一次）</template>
        <template #description><code>{{ newToken }}</code></template>
      </a-alert>

      <a-card title="已创建 Tokens">
        <a-table :columns="columns" :data-source="tokens" row-key="id" :pagination="false">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'scope'">
              <a-space>
                <a-tag v-for="s in record.scope" :key="s">{{ s }}</a-tag>
              </a-space>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-popconfirm title="确认撤销？" @confirm="revoke(record.id)">
                <a-button type="link" danger>撤销</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </a-card>
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { TableColumnsType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import http from '@/utils/http';

interface TokenItem {
  id: string;
  name: string;
  scope: string[];
  expiresAt: string | null;
  createdAt: string;
}

const router = useRouter();
const creating = ref(false);
const newToken = ref('');
const tokens = ref<TokenItem[]>([]);

const form = reactive({
  name: '',
  scopeText: 'publish,read',
  expiresAt: ''
});

const columns: TableColumnsType<TokenItem> = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: 'Scope', dataIndex: 'scope', key: 'scope' },
  { title: '过期时间', dataIndex: 'expiresAt', key: 'expiresAt' },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  { title: '操作', key: 'actions' }
];

async function loadTokens(): Promise<void> {
  const res = await http.get<TokenItem[]>('/auth/tokens');
  tokens.value = res.data;
}

async function createToken(): Promise<void> {
  creating.value = true;
  try {
    const scope = form.scopeText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const res = await http.post<{ token: string }>('/auth/tokens', {
      name: form.name,
      scope,
      expiresAt: form.expiresAt || undefined
    });

    newToken.value = res.data.token;
    message.success('Token 创建成功');
    form.name = '';
    await loadTokens();
  } catch {
    message.error('Token 创建失败');
  } finally {
    creating.value = false;
  }
}

async function revoke(id: string): Promise<void> {
  await http.delete(`/auth/tokens/${id}`);
  message.success('已撤销');
  await loadTokens();
}

function logout(): void {
  localStorage.removeItem('sga_market_token');
  void router.push('/login');
}

onMounted(() => {
  if (!localStorage.getItem('sga_market_token')) {
    void router.push('/login');
    return;
  }
  void loadTokens();
});
</script>

<style scoped>
.header {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
</style>
