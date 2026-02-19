<template>
  <div class="settings-page">
    <NavBar :show-links="true" />
    <div class="settings-body">
      <div class="settings-layout">
        <!-- Sidebar -->
        <aside class="settings-sidebar">
          <h2 class="sidebar-title">管理面板</h2>
          <nav class="sidebar-nav">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="sidebar-item"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              <span class="sidebar-icon">{{ tab.icon }}</span>
              <span class="sidebar-label">{{ tab.label }}</span>
            </button>
          </nav>
        </aside>

        <!-- Main content -->
        <main class="settings-main">
          <!-- Tab 1: User Management -->
          <div v-show="activeTab === 'users'" class="tab-panel">
            <div class="panel-header">
              <h2 class="panel-title">用户管理</h2>
              <a-button type="primary" @click="showInviteModal = true">
                + 邀请新用户
              </a-button>
            </div>

            <a-table
              :dataSource="users"
              :columns="userColumns"
              :loading="usersLoading"
              row-key="email"
              size="middle"
              :pagination="false"
              class="settings-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'avatar'">
                  <div
                    class="user-avatar"
                    :style="{ background: getAvatarColor(record.email) }"
                  >
                    {{ (record.email || 'U').charAt(0).toUpperCase() }}
                  </div>
                </template>
                <template v-if="column.key === 'email'">
                  <span class="user-email-cell">{{ record.email }}</span>
                </template>
                <template v-if="column.key === 'role'">
                  <a-tag :color="record.role === 'superadmin' ? 'purple' : 'default'">
                    {{ record.role === 'superadmin' ? '超级管理员' : '普通用户' }}
                  </a-tag>
                </template>
                <template v-if="column.key === 'createdAt'">
                  <span class="text-muted">{{ formatDate(record.createdAt) }}</span>
                </template>
                <template v-if="column.key === 'action'">
                  <a-popconfirm
                    title="确认删除该用户？"
                    ok-text="删除"
                    cancel-text="取消"
                    @confirm="deleteUser(record.email)"
                  >
                    <a-button danger size="small" type="text">删除</a-button>
                  </a-popconfirm>
                </template>
              </template>
            </a-table>

            <!-- Invite Modal -->
            <a-modal
              v-model:open="showInviteModal"
              title="邀请新用户"
              :footer="null"
              :width="440"
              centered
            >
              <div class="invite-modal-body">
                <a-input
                  v-model:value="inviteEmail"
                  placeholder="输入邮箱地址"
                  size="large"
                  @pressEnter="sendInvite"
                />
                <a-button
                  type="primary"
                  block
                  :loading="inviteLoading"
                  style="margin-top: 16px;"
                  @click="sendInvite"
                >
                  发送邀请
                </a-button>
                <div v-if="inviteResult" class="invite-success-box">
                  <p class="invite-success-label">邀请成功！临时密码（用户首次登录需修改）：</p>
                  <div class="invite-password-box">
                    临时密码: <strong>{{ inviteResult }}</strong>
                  </div>
                </div>
              </div>
            </a-modal>
          </div>

          <!-- Tab 2: Agent Settings -->
          <div v-show="activeTab === 'agent'" class="tab-panel">
            <div class="panel-header">
              <h2 class="panel-title">Agent 设置</h2>
            </div>

            <div class="agent-toggle-row">
              <div class="agent-toggle-info">
                <h3 class="agent-toggle-label">Agent 运营助手</h3>
                <p class="agent-toggle-desc">启用后，Agent 将自动审核工具包、管理公告</p>
              </div>
              <div class="agent-toggle-right">
                <a-tag :color="agentConfig.enabled ? 'green' : 'default'" class="status-tag">
                  {{ agentConfig.enabled ? '运行中' : '已停用' }}
                </a-tag>
                <a-switch v-model:checked="agentConfig.enabled" />
              </div>
            </div>

            <a-form layout="vertical" class="agent-form">
              <a-form-item label="模型">
                <a-select v-model:value="agentConfig.model" style="width: 100%;" size="large">
                  <a-select-option value="claude-sonnet-4-6">
                    Anthropic — claude-sonnet-4-6
                  </a-select-option>
                  <a-select-option value="claude-haiku-4-5">
                    Anthropic — claude-haiku-4-5
                  </a-select-option>
                  <a-select-option value="gpt-4o">
                    OpenAI — gpt-4o
                  </a-select-option>
                  <a-select-option value="gpt-4o-mini">
                    OpenAI — gpt-4o-mini
                  </a-select-option>
                </a-select>
              </a-form-item>

              <a-form-item label="API Key">
                <div class="apikey-row">
                  <a-input-password
                    v-model:value="agentConfig.apiKey"
                    placeholder="sk-..."
                    :visibilityToggle="true"
                    size="large"
                    style="flex: 1;"
                  />
                  <a-button @click="testConnection" :loading="testingConnection">
                    测试连接
                  </a-button>
                </div>
              </a-form-item>

              <a-form-item label="系统提示词">
                <textarea
                  v-model="agentConfig.systemPrompt"
                  class="code-textarea"
                  rows="8"
                  placeholder="你是 SGA-Molt MCP Market 的运营助手，负责审核包质量、撰写包描述、管理公告..."
                ></textarea>
              </a-form-item>

              <a-form-item label="企微 Webhook URL">
                <div class="apikey-row">
                  <a-input
                    v-model:value="agentConfig.webhookUrl"
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    size="large"
                    style="flex: 1;"
                  />
                  <a-button @click="testWebhook" :loading="testingWebhook">
                    发送测试消息
                  </a-button>
                </div>
              </a-form-item>

              <div class="form-actions">
                <a-button
                  type="primary"
                  size="large"
                  :loading="agentSaving"
                  @click="saveAgent"
                >
                  保存设置
                </a-button>
              </div>
            </a-form>
          </div>

          <!-- Tab 3: Announcement -->
          <div v-show="activeTab === 'announcement'" class="tab-panel">
            <div class="panel-header">
              <h2 class="panel-title">公告管理</h2>
            </div>

            <div class="announcement-preview">
              <h4 class="preview-label">当前公告预览</h4>
              <div class="marquee-preview">
                <div class="marquee-preview-track">
                  <span>{{ announcementText || '暂无公告内容' }}</span>
                </div>
              </div>
            </div>

            <div class="announcement-edit">
              <h4 class="edit-label">编辑公告</h4>
              <a-textarea
                v-model:value="announcementText"
                :rows="4"
                placeholder="输入公告内容..."
                show-count
                :maxlength="500"
              />
              <p class="announcement-note">Agent 启用时将自动更新公告内容</p>
              <a-button
                type="primary"
                :loading="announcementSaving"
                style="margin-top: 16px;"
                @click="saveAnnouncement"
              >
                更新公告
              </a-button>
            </div>
          </div>

          <!-- Tab 4: Review Queue -->
          <div v-show="activeTab === 'review'" class="tab-panel">
            <div class="panel-header">
              <h2 class="panel-title">包审核队列</h2>
            </div>

            <div class="review-filters">
              <a-radio-group v-model:value="reviewFilter" button-style="solid" size="small">
                <a-radio-button value="pending">待审核</a-radio-button>
                <a-radio-button value="approved">已通过</a-radio-button>
                <a-radio-button value="rejected">已拒绝</a-radio-button>
              </a-radio-group>
            </div>

            <a-table
              :dataSource="filteredReviewItems"
              :columns="reviewColumns"
              :loading="reviewLoading"
              row-key="id"
              size="middle"
              :pagination="false"
              class="settings-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <a-tag
                    :color="record.status === 'approved' ? 'green' : record.status === 'rejected' ? 'red' : 'orange'"
                  >
                    {{ record.status === 'approved' ? '已通过' : record.status === 'rejected' ? '已拒绝' : '待审核' }}
                  </a-tag>
                </template>
                <template v-if="column.key === 'agentScore'">
                  <span :class="getScoreClass(record.agentScore)">
                    {{ record.agentScore != null ? record.agentScore + '/10' : '-' }}
                  </span>
                </template>
                <template v-if="column.key === 'action'">
                  <div v-if="record.status === 'pending'" class="review-actions">
                    <a-button
                      type="primary"
                      size="small"
                      @click="approvePackage(record.id)"
                    >
                      通过
                    </a-button>
                    <a-button
                      danger
                      size="small"
                      @click="openRejectModal(record.id)"
                    >
                      拒绝
                    </a-button>
                  </div>
                  <span v-else class="text-muted">--</span>
                </template>
              </template>
            </a-table>

            <div v-if="!reviewLoading && reviewItems.length === 0" class="review-empty">
              暂无数据
            </div>

            <!-- Reject reason modal -->
            <a-modal
              v-model:open="showRejectModal"
              title="拒绝原因"
              @ok="confirmReject"
              ok-text="确认拒绝"
              cancel-text="取消"
              :width="440"
              centered
            >
              <a-textarea
                v-model:value="rejectReason"
                :rows="4"
                placeholder="请输入拒绝原因..."
              />
            </a-modal>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import NavBar from '@/components/NavBar.vue';
import http from '@/utils/http';

// ── Tab navigation ────────────────────────────────────
const tabs = [
  { key: 'users', icon: '👥', label: '用户管理' },
  { key: 'agent', icon: '🤖', label: 'Agent 设置' },
  { key: 'announcement', icon: '📢', label: '公告管理' },
  { key: 'review', icon: '🔍', label: '包审核队列' },
];

const activeTab = ref('users');

// ── Types ─────────────────────────────────────────────
interface UserRecord {
  id?: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AgentConfig {
  enabled: boolean;
  model: string;
  apiKey: string;
  systemPrompt: string;
  webhookUrl: string;
}

interface ReviewItem {
  id: string;
  name: string;
  version: string;
  submitter: string;
  agentScore: number | null;
  agentSuggestion: string;
  status: string; // pending | approved | rejected
}

// ── Users ─────────────────────────────────────────────
const users = ref<UserRecord[]>([]);
const usersLoading = ref(false);

const userColumns = [
  { title: '', dataIndex: 'avatar', key: 'avatar', width: 48 },
  { title: '邮箱', dataIndex: 'email', key: 'email' },
  { title: '角色', dataIndex: 'role', key: 'role', width: 130 },
  { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 80 },
];

function getAvatarColor(email: string): string {
  const code = [...(email || 'U')].reduce((s, c) => s + c.charCodeAt(0), 0);
  const hue = (code * 47) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

function formatDate(v: string): string {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleDateString('zh-CN');
  } catch {
    return v;
  }
}

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
    // graceful — keep empty
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

// ── Invite ────────────────────────────────────────────
const showInviteModal = ref(false);
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
    inviteResult.value = data.tempPassword || '(已生成)';
    inviteEmail.value = '';
    await loadUsers();
  } catch {
    void message.error('发送邀请失败');
  } finally {
    inviteLoading.value = false;
  }
}

// ── Agent config ──────────────────────────────────────
const agentConfig = reactive<AgentConfig>({
  enabled: false,
  model: 'claude-sonnet-4-6',
  apiKey: '',
  systemPrompt: '',
  webhookUrl: '',
});
const agentSaving = ref(false);
const testingConnection = ref(false);
const testingWebhook = ref(false);

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
      agentConfig.webhookUrl = cfg.webhookUrl ?? '';
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

async function testConnection(): Promise<void> {
  if (!agentConfig.apiKey) {
    void message.warning('请先输入 API Key');
    return;
  }
  testingConnection.value = true;
  try {
    await http.post('/admin/agent/test', { model: agentConfig.model, apiKey: agentConfig.apiKey });
    void message.success('连接成功');
  } catch {
    void message.error('连接测试失败');
  } finally {
    testingConnection.value = false;
  }
}

async function testWebhook(): Promise<void> {
  if (!agentConfig.webhookUrl) {
    void message.warning('请先输入 Webhook URL');
    return;
  }
  testingWebhook.value = true;
  try {
    await http.post('/admin/agent/test-webhook', { webhookUrl: agentConfig.webhookUrl });
    void message.success('测试消息已发送');
  } catch {
    void message.error('发送测试消息失败');
  } finally {
    testingWebhook.value = false;
  }
}

// ── Announcement ──────────────────────────────────────
const announcementText = ref('');
const announcementSaving = ref(false);

async function loadAnnouncement(): Promise<void> {
  try {
    const res = await http.get<{ text?: string; announcement?: string; content?: string } | string>(
      '/admin/announcement'
    );
    const data = res.data;
    if (typeof data === 'string') {
      announcementText.value = data;
    } else if (data && typeof data === 'object') {
      const obj = data as { text?: string; announcement?: string; content?: string };
      announcementText.value = obj.text || obj.announcement || obj.content || '';
    }
  } catch {
    // non-fatal
  }
}

async function saveAnnouncement(): Promise<void> {
  announcementSaving.value = true;
  try {
    await http.put('/admin/announcement', { content: announcementText.value });
    void message.success('公告已更新');
  } catch {
    void message.error('更新公告失败');
  } finally {
    announcementSaving.value = false;
  }
}

// ── Review Queue ──────────────────────────────────────
const reviewItems = ref<ReviewItem[]>([]);
const reviewLoading = ref(false);
const reviewFilter = ref('pending');
const showRejectModal = ref(false);
const rejectReason = ref('');
const rejectTargetId = ref('');

const reviewColumns = [
  { title: '包名', dataIndex: 'name', key: 'name' },
  { title: '版本', dataIndex: 'version', key: 'version', width: 90 },
  { title: '提交人', dataIndex: 'submitter', key: 'submitter', width: 140 },
  { title: 'Agent 评分', dataIndex: 'agentScore', key: 'agentScore', width: 100 },
  { title: 'Agent 建议', dataIndex: 'agentSuggestion', key: 'agentSuggestion', ellipsis: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 140 },
];

const filteredReviewItems = computed(() => {
  return reviewItems.value.filter((item) => item.status === reviewFilter.value);
});

function getScoreClass(score: number | null): string {
  if (score == null) return 'text-muted';
  if (score >= 7) return 'score-good';
  if (score >= 4) return 'score-ok';
  return 'score-bad';
}

async function loadReviewQueue(): Promise<void> {
  reviewLoading.value = true;
  try {
    const res = await http.get<ReviewItem[] | { data?: ReviewItem[] }>('/admin/review-queue');
    const raw = res.data;
    if (Array.isArray(raw)) {
      reviewItems.value = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: ReviewItem[] }).data)) {
      reviewItems.value = (raw as { data: ReviewItem[] }).data;
    }
  } catch {
    // 404 or other — graceful empty
    reviewItems.value = [];
  } finally {
    reviewLoading.value = false;
  }
}

async function approvePackage(id: string): Promise<void> {
  try {
    await http.post(`/admin/packages/${id}/review`, { action: 'approve' });
    void message.success('已通过');
    await loadReviewQueue();
  } catch {
    void message.error('操作失败');
  }
}

function openRejectModal(id: string): void {
  rejectTargetId.value = id;
  rejectReason.value = '';
  showRejectModal.value = true;
}

async function confirmReject(): Promise<void> {
  if (!rejectReason.value.trim()) {
    void message.warning('请输入拒绝原因');
    return;
  }
  try {
    await http.post(`/admin/packages/${rejectTargetId.value}/review`, {
      action: 'reject',
      reason: rejectReason.value.trim(),
    });
    void message.success('已拒绝');
    showRejectModal.value = false;
    await loadReviewQueue();
  } catch {
    void message.error('操作失败');
  }
}

// ── Init ──────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([loadUsers(), loadAgentConfig(), loadAnnouncement(), loadReviewQueue()]);
});
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #f0f2f5;
  display: flex;
  flex-direction: column;
}

.settings-body {
  flex: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
  width: 100%;
}

/* ── Layout ── */
.settings-layout {
  display: flex;
  min-height: 640px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}

/* ── Sidebar ── */
.settings-sidebar {
  width: 200px;
  background: #1a1d2e;
  padding: 28px 0;
  flex-shrink: 0;
}

.sidebar-title {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 0 20px;
  margin: 0 0 16px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.sidebar-item.active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border-left-color: #1677ff;
}

.sidebar-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.sidebar-label {
  font-weight: 500;
}

/* ── Main content ── */
.settings-main {
  flex: 1;
  background: #f8fafc;
  padding: 32px;
  overflow-y: auto;
}

.tab-panel {
  /* shown/hidden via v-show */
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.panel-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

/* ── Tables ── */
.settings-table {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.settings-table :deep(.ant-table) {
  background: #fff;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-email-cell {
  font-weight: 500;
  color: #1f2937;
}

.text-muted {
  color: #9ca3af;
}

/* ── Invite modal ── */
.invite-modal-body {
  padding: 8px 0;
}

.invite-success-box {
  margin-top: 20px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 16px;
}

.invite-success-label {
  font-size: 13px;
  color: #15803d;
  margin: 0 0 8px;
}

.invite-password-box {
  font-size: 15px;
  color: #166534;
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  background: #dcfce7;
  border-radius: 6px;
  padding: 10px 14px;
  word-break: break-all;
}

/* ── Agent settings ── */
.agent-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
}

.agent-toggle-label {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.agent-toggle-desc {
  font-size: 13px;
  color: #9ca3af;
  margin: 4px 0 0;
}

.agent-toggle-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-tag {
  font-size: 12px;
}

.agent-form {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e5e7eb;
}

.agent-form :deep(.ant-form-item-label > label) {
  font-weight: 500;
  color: #374151;
}

.apikey-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.code-textarea {
  width: 100%;
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  background: #1e1e2e;
  color: #cdd6f4;
  border: 1px solid #313244;
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.code-textarea:focus {
  border-color: #585b70;
}

.code-textarea::placeholder {
  color: #585b70;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

/* ── Announcement ── */
.announcement-preview {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
}

.preview-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px;
}

.marquee-preview {
  background: linear-gradient(90deg, #1a1d2e, #2d1b69, #1a1d2e);
  border-radius: 8px;
  height: 36px;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.marquee-preview-track {
  display: inline-flex;
  white-space: nowrap;
  animation: marquee-preview 20s linear infinite;
  color: #e0d7ff;
  font-size: 13px;
  padding: 0 24px;
}

@keyframes marquee-preview {
  from { transform: translateX(100%); }
  to { transform: translateX(-100%); }
}

.announcement-edit {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  border: 1px solid #e5e7eb;
}

.edit-label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px;
}

.announcement-note {
  font-size: 12px;
  color: #9ca3af;
  margin: 8px 0 0;
  font-style: italic;
}

/* ── Review Queue ── */
.review-filters {
  margin-bottom: 16px;
}

.review-actions {
  display: flex;
  gap: 6px;
}

.review-empty {
  text-align: center;
  color: #9ca3af;
  padding: 48px 0;
  font-size: 14px;
}

.score-good {
  color: #16a34a;
  font-weight: 600;
}

.score-ok {
  color: #d97706;
  font-weight: 600;
}

.score-bad {
  color: #dc2626;
  font-weight: 600;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .settings-layout {
    flex-direction: column;
  }
  .settings-sidebar {
    width: 100%;
    padding: 16px 0;
  }
  .sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 0 12px;
    gap: 4px;
  }
  .sidebar-item {
    border-left: none;
    border-bottom: 3px solid transparent;
    padding: 8px 14px;
    white-space: nowrap;
    font-size: 13px;
  }
  .sidebar-item.active {
    border-left-color: transparent;
    border-bottom-color: #1677ff;
  }
  .settings-main {
    padding: 20px 16px;
  }
  .agent-toggle-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
