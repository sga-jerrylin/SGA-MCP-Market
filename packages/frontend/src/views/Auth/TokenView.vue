<template>
  <div class="page-wrap">
    <NavBar :show-links="true" />

    <div class="content-wrap">
      <div class="page-header">
        <h1 class="page-title">API 访问令牌</h1>
        <p class="page-sub">管理用于 CLI 和 CI/CD 的访问令牌</p>
      </div>

      <!-- Create token card -->
      <div class="section-card">
        <h3 class="card-title">创建新令牌</h3>
        <a-form layout="vertical" :model="form" @finish="createToken">
          <div class="form-row">
            <a-form-item
              label="令牌名称"
              name="name"
              :rules="[{ required: true, message: '请输入令牌名称' }]"
              class="form-item-name"
            >
              <a-input
                v-model:value="form.name"
                placeholder="例如 CI Deploy"
                size="large"
              />
            </a-form-item>

            <a-form-item label="过期时间（可选）" name="expiresAt" class="form-item-date">
              <a-input
                v-model:value="form.expiresAt"
                placeholder="2026-12-31"
                size="large"
              />
            </a-form-item>
          </div>

          <a-form-item label="权限范围">
            <div class="scope-checks">
              <label
                v-for="s in scopeOptions"
                :key="s.value"
                class="scope-check"
                :class="{ checked: form.scope.includes(s.value) }"
              >
                <input
                  type="checkbox"
                  :value="s.value"
                  :checked="form.scope.includes(s.value)"
                  @change="toggleScope(s.value)"
                />
                <span class="scope-name">{{ s.label }}</span>
                <span class="scope-desc">{{ s.desc }}</span>
              </label>
            </div>
          </a-form-item>

          <a-button
            type="primary"
            html-type="submit"
            :loading="creating"
            size="large"
            class="gen-btn"
          >
            生成令牌
          </a-button>
        </a-form>
      </div>

      <!-- New token result -->
      <div v-if="newToken" class="new-token-alert">
        <div class="alert-header">
          <span class="alert-icon">!</span>
          <span class="alert-msg">仅展示一次 — 请立即复制并妥善保存</span>
        </div>
        <div class="token-value-row">
          <code class="token-value">{{ newToken }}</code>
          <a-button type="primary" ghost @click="copyToken">复制</a-button>
        </div>
      </div>

      <!-- Token list -->
      <div class="section-card">
        <div class="card-header-row">
          <h3 class="card-title">已有令牌</h3>
          <span class="token-count">{{ tokens.length }} 个</span>
        </div>

        <a-table
          :columns="columns"
          :data-source="tokens"
          row-key="id"
          :pagination="false"
          :loading="tableLoading"
          class="token-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'scope'">
              <a-space :size="4">
                <a-tag
                  v-for="s in record.scope"
                  :key="s"
                  :color="scopeColor(s)"
                  style="border-radius: 999px; font-size: 11px"
                >
                  {{ s }}
                </a-tag>
              </a-space>
            </template>
            <template v-else-if="column.key === 'expiresAt'">
              <span :style="{ color: isExpired(record.expiresAt) ? '#ff4d4f' : 'inherit' }">
                {{ record.expiresAt ? formatDate(record.expiresAt) : '永不过期' }}
              </span>
            </template>
            <template v-else-if="column.key === 'createdAt'">
              {{ formatDate(record.createdAt) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-popconfirm title="确认撤销此令牌？此操作不可逆。" ok-text="撤销" cancel-text="取消" @confirm="revoke(record.id)">
                <a-button type="link" danger size="small">撤销</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>

        <a-empty v-if="!tableLoading && tokens.length === 0" description="暂无令牌" style="padding: 32px 0" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { TableColumnsType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import NavBar from '@/components/NavBar.vue';
import http from '@/utils/http';

interface TokenItem {
  id: string;
  name: string;
  scope: string[];
  expiresAt: string | null;
  createdAt: string;
}

interface CreateTokenResp {
  token?: string;
  accessToken?: string;
  id?: string;
}

const router = useRouter();
const creating = ref(false);
const tableLoading = ref(false);
const newToken = ref('');
const tokens = ref<TokenItem[]>([]);

const scopeOptions = [
  { value: 'publish', label: 'publish', desc: '发布工具包' },
  { value: 'read', label: 'read', desc: '读取工具包' },
  { value: 'delete', label: 'delete', desc: '删除工具包' }
];

const form = reactive({
  name: '',
  scope: ['publish', 'read'] as string[],
  expiresAt: ''
});

function toggleScope(val: string): void {
  const idx = form.scope.indexOf(val);
  if (idx === -1) {
    form.scope.push(val);
  } else {
    form.scope.splice(idx, 1);
  }
}

const columns: TableColumnsType<TokenItem> = [
  { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
  { title: 'Scope', dataIndex: 'scope', key: 'scope', width: 200 },
  { title: '到期时间', dataIndex: 'expiresAt', key: 'expiresAt', width: 140 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 140 },
  { title: '操作', key: 'actions', width: 80 }
];

function formatDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
}

function isExpired(v: string | null): boolean {
  if (!v) return false;
  return new Date(v).getTime() < Date.now();
}

function scopeColor(s: string): string {
  const map: Record<string, string> = { publish: 'blue', read: 'green', delete: 'red' };
  return map[s] || 'default';
}

async function loadTokens(): Promise<void> {
  tableLoading.value = true;
  try {
    const res = await http.get<{ code?: number; data?: TokenItem[] } | TokenItem[]>('/auth/tokens');
    const raw = res.data as { code?: number; data?: TokenItem[] } | TokenItem[];
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw && Array.isArray(raw.data)) {
      tokens.value = raw.data as TokenItem[];
    } else if (Array.isArray(raw)) {
      tokens.value = raw as TokenItem[];
    } else {
      tokens.value = [];
    }
  } catch {
    tokens.value = [];
  } finally {
    tableLoading.value = false;
  }
}

async function createToken(): Promise<void> {
  if (form.scope.length === 0) {
    void message.warning('请至少选择一个权限范围');
    return;
  }
  creating.value = true;
  try {
    const payload: { name: string; scope: string[]; expiresAt?: string } = {
      name: form.name,
      scope: form.scope
    };
    if (form.expiresAt) {
      payload.expiresAt = new Date(form.expiresAt).toISOString();
    }

    const res = await http.post<{ code?: number; data?: CreateTokenResp } | CreateTokenResp>(
      '/auth/tokens',
      payload
    );
    const raw = res.data as { code?: number; data?: CreateTokenResp } | CreateTokenResp;
    let token = '';
    if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
      token = (raw.data as CreateTokenResp).token || (raw.data as CreateTokenResp).accessToken || '';
    } else {
      token = (raw as CreateTokenResp).token || (raw as CreateTokenResp).accessToken || '';
    }
    newToken.value = token;
    void message.success('令牌创建成功');
    form.name = '';
    form.expiresAt = '';
    form.scope = ['publish', 'read'];
    await loadTokens();
  } catch {
    void message.error('令牌创建失败');
  } finally {
    creating.value = false;
  }
}

async function revoke(id: string): Promise<void> {
  try {
    await http.delete(`/auth/tokens/${id}`);
    if (newToken.value) {
      newToken.value = '';
    }
    void message.success('已撤销令牌');
    await loadTokens();
  } catch {
    void message.error('撤销失败');
  }
}

function copyToken(): void {
  void navigator.clipboard.writeText(newToken.value);
  void message.success('已复制令牌');
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
.page-wrap {
  min-height: 100vh;
  background: #f8fafc;
}

.content-wrap {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px 60px;
}

.page-header {
  margin-bottom: 28px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}

.page-sub {
  color: #888;
  font-size: 14px;
  margin: 0;
}

.section-card {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
  padding: 24px 28px;
  margin-bottom: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 20px;
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.token-count {
  font-size: 13px;
  color: #999;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 999px;
}

/* Form */
.form-row {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 16px;
}

@media (max-width: 600px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.form-item-name,
.form-item-date {
  margin-bottom: 12px;
}

/* Scope checkboxes */
.scope-checks {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.scope-check {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  user-select: none;
}

.scope-check:hover {
  border-color: #1677ff;
}

.scope-check.checked {
  border-color: #1677ff;
  background: #f0f7ff;
}

.scope-check input[type='checkbox'] {
  width: 15px;
  height: 15px;
  accent-color: #1677ff;
}

.scope-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  font-family: monospace;
}

.scope-desc {
  font-size: 12px;
  color: #999;
}

.gen-btn {
  border-radius: 8px;
  height: 42px;
  padding: 0 28px;
}

/* New token alert */
.new-token-alert {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 20px;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.alert-icon {
  width: 20px;
  height: 20px;
  background: #52c41a;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.alert-msg {
  font-size: 14px;
  font-weight: 600;
  color: #389e0d;
}

.token-value-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border: 1px solid #d9f7be;
  border-radius: 8px;
  padding: 10px 14px;
  flex-wrap: wrap;
}

.token-value {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #135200;
  word-break: break-all;
  flex: 1;
}

/* Table */
.token-table :deep(.ant-table) {
  border-radius: 0;
}
</style>
