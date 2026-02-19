<template>
  <div class="settings-page">
    <NavBar :show-links="true" />
    <div class="settings-body">
      <h1 class="page-title">⚙️ 超级管理员设置</h1>

      <div class="cards-row">
        <!-- Card 1: User management -->
        <div class="card">
          <h2 class="card-title">用户邀请管理</h2>

          <a-table
            :dataSource="users"
            :columns="userColumns"
            :loading="usersLoading"
            row-key="email"
            size="small"
            :pagination="false"
            class="user-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'action'">
                <a-popconfirm
                  title="确认删除该用户？"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="deleteUser(record.email)"
                >
                  <a-button danger size="small">删除</a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>

          <div class="invite-section">
            <h3 class="section-subtitle">邀请新用户</h3>
            <div class="invite-row">
              <a-input
                v-model:value="inviteEmail"
                placeholder="输入邮箱地址"
                style="flex: 1;"
              />
              <a-button
                type="primary"
                :loading="inviteLoading"
                @click="sendInvite"
              >
                发送邀请
              </a-button>
            </div>
            <div v-if="inviteResult" class="invite-result">
              {{ inviteResult }}
            </div>
          </div>
        </div>

        <!-- Card 2: Agent settings -->
        <div class="card">
          <h2 class="card-title">Agent 运营助手设置</h2>

          <a-form layout="vertical" class="agent-form">
            <a-form-item label="启用 Agent">
              <a-switch v-model:checked="agentConfig.enabled" />
            </a-form-item>

            <a-form-item label="模型">
              <a-select v-model:value="agentConfig.model" style="width: 100%;">
                <a-select-option value="claude-sonnet-4-6">claude-sonnet-4-6</a-select-option>
                <a-select-option value="claude-haiku-4-5">claude-haiku-4-5</a-select-option>
                <a-select-option value="gpt-4o">gpt-4o</a-select-option>
                <a-select-option value="gpt-4o-mini">gpt-4o-mini</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="API Key">
              <a-input-password
                v-model:value="agentConfig.apiKey"
                placeholder="sk-..."
                :visibilityToggle="true"
              />
            </a-form-item>

            <a-form-item label="系统提示词">
              <a-textarea
                v-model:value="agentConfig.systemPrompt"
                :rows="6"
                placeholder="你是 SGA-Molt MCP Market 的运营助手，负责审核包质量、撰写包描述、管理公告..."
              />
            </a-form-item>

            <a-button
              type="primary"
              :loading="agentSaving"
              @click="saveAgent"
            >
              保存设置
            </a-button>
          </a-form>

          <div class="announcement-section">
            <h3 class="section-subtitle">走马灯公告</h3>
            <a-textarea
              v-model:value="announcementText"
              :rows="3"
              placeholder="输入公告内容..."
            />
            <a-button
              type="default"
              :loading="announcementSaving"
              style="margin-top: 10px;"
              @click="saveAnnouncement"
            >
              更新公告
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import NavBar from '@/components/NavBar.vue';
import http from '@/utils/http';

interface UserRecord {
  email: string;
  role: string;
  createdAt: string;
}

interface AgentConfig {
  enabled: boolean;
  model: string;
  apiKey: string;
  systemPrompt: string;
}

// ── Users ──────────────────────────────────────────────
const users = ref<UserRecord[]>([]);
const usersLoading = ref(false);

const userColumns = [
  { title: '邮箱', dataIndex: 'email', key: 'email' },
  { title: '角色', dataIndex: 'role', key: 'role' },
  { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt' },
  { title: '操作', key: 'action', width: 80 }
];

async function loadUsers(): Promise<void> {
  usersLoading.value = true;
  try {
    const res = await http.get<UserRecord[] | { data?: UserRecord[] }>('/admin/users');
    const raw = res.data;
    if (Array.isArray(raw)) {
      users.value = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: UserRecord[] }).data)) {
      users.value = (raw as { data: UserRecord[] }).data;
    }
  } catch {
    void message.error('加载用户列表失败');
  } finally {
    usersLoading.value = false;
  }
}

async function deleteUser(email: string): Promise<void> {
  try {
    await http.delete(`/admin/users/${encodeURIComponent(email)}`);
    void message.success('用户已删除');
    await loadUsers();
  } catch {
    void message.error('删除用户失败');
  }
}

// ── Invite ─────────────────────────────────────────────
const inviteEmail = ref('');
const inviteLoading = ref(false);
const inviteResult = ref('');

async function sendInvite(): Promise<void> {
  if (!inviteEmail.value.trim()) {
    void message.warning('请输入邮箱地址');
    return;
  }
  inviteLoading.value = true;
  inviteResult.value = '';
  try {
    const res = await http.post<{ email: string; tempPassword: string }>(
      '/admin/invite',
      { email: inviteEmail.value.trim() }
    );
    const data = res.data;
    inviteResult.value = `邀请已发送，临时密码: ${data.tempPassword}`;
    inviteEmail.value = '';
  } catch {
    void message.error('发送邀请失败');
  } finally {
    inviteLoading.value = false;
  }
}

// ── Agent config ───────────────────────────────────────
const agentConfig = reactive<AgentConfig>({
  enabled: false,
  model: 'claude-sonnet-4-6',
  apiKey: '',
  systemPrompt: ''
});
const agentSaving = ref(false);

async function loadAgentConfig(): Promise<void> {
  try {
    const res = await http.get<AgentConfig | { data?: AgentConfig }>('/admin/agent');
    const raw = res.data;
    const cfg: AgentConfig | undefined =
      raw && typeof raw === 'object' && 'data' in raw
        ? (raw as { data: AgentConfig }).data
        : (raw as AgentConfig);
    if (cfg) {
      agentConfig.enabled = cfg.enabled ?? false;
      agentConfig.model = cfg.model ?? 'claude-sonnet-4-6';
      agentConfig.apiKey = cfg.apiKey ?? '';
      agentConfig.systemPrompt = cfg.systemPrompt ?? '';
    }
  } catch {
    // non-fatal, keep defaults
  }
}

async function saveAgent(): Promise<void> {
  agentSaving.value = true;
  try {
    await http.put('/admin/agent', { ...agentConfig });
    void message.success('Agent 设置已保存');
  } catch {
    void message.error('保存 Agent 设置失败');
  } finally {
    agentSaving.value = false;
  }
}

// ── Announcement ───────────────────────────────────────
const announcementText = ref('');
const announcementSaving = ref(false);

async function loadAnnouncement(): Promise<void> {
  try {
    const res = await http.get<{ text?: string; announcement?: string } | string>(
      '/admin/announcement'
    );
    const data = res.data;
    if (typeof data === 'string') {
      announcementText.value = data;
    } else if (data && typeof data === 'object') {
      announcementText.value =
        (data as { text?: string; announcement?: string }).text ||
        (data as { text?: string; announcement?: string }).announcement ||
        '';
    }
  } catch {
    // non-fatal
  }
}

async function saveAnnouncement(): Promise<void> {
  announcementSaving.value = true;
  try {
    await http.put('/admin/announcement', { text: announcementText.value });
    void message.success('公告已更新');
  } catch {
    void message.error('更新公告失败');
  } finally {
    announcementSaving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadAgentConfig(), loadAnnouncement()]);
});
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #0b0d14;
  display: flex;
  flex-direction: column;
}

.settings-body {
  flex: 1;
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 24px;
  width: 100%;
}

.page-title {
  color: #e0d7ff;
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 32px;
}

.cards-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .cards-row {
    grid-template-columns: 1fr;
  }
}

.card {
  background: #13151f;
  border: 1px solid #1e2230;
  border-radius: 16px;
  padding: 28px;
}

.card-title {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 20px;
}

.user-table {
  margin-bottom: 24px;
}

.invite-section {
  border-top: 1px solid #1e2230;
  padding-top: 20px;
}

.section-subtitle {
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
}

.invite-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.invite-result {
  margin-top: 12px;
  color: #4ade80;
  font-size: 13px;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  word-break: break-all;
}

.agent-form :deep(.ant-form-item-label > label) {
  color: #a0a8c0;
}

.announcement-section {
  border-top: 1px solid #1e2230;
  padding-top: 20px;
  margin-top: 24px;
}
</style>
