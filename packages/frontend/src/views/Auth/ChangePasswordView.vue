<template>
  <div class="change-pw-page">
    <NavBar :show-brand="false" />
    <div class="change-pw-body">
      <div class="change-pw-card">
        <div class="card-icon">🔐</div>
        <h2 class="card-title">修改初始密码</h2>
        <p class="card-sub">为保证账号安全，请设置你自己的密码</p>

        <a-form layout="vertical" :model="form" @finish="onSubmit">
          <a-form-item
            label="新密码"
            name="newPassword"
            :rules="[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]"
          >
            <a-input-password
              v-model:value="form.newPassword"
              size="large"
              placeholder="至少6位"
              autocomplete="new-password"
            />
          </a-form-item>

          <a-form-item
            label="确认新密码"
            name="confirmPassword"
            :rules="[{ required: true, message: '请确认密码' }, { validator: checkConfirm }]"
          >
            <a-input-password
              v-model:value="form.confirmPassword"
              size="large"
              placeholder="再次输入新密码"
              autocomplete="new-password"
            />
          </a-form-item>

          <a-button
            type="primary"
            html-type="submit"
            :loading="loading"
            size="large"
            block
            class="submit-btn"
          >
            确认修改
          </a-button>
        </a-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import NavBar from '@/components/NavBar.vue';
import http from '@/utils/http';

const router = useRouter();
const loading = ref(false);
const form = reactive({ newPassword: '', confirmPassword: '' });

function checkConfirm(_: unknown, value: string): Promise<void> {
  if (value && value !== form.newPassword) {
    return Promise.reject(new Error('两次密码不一致'));
  }
  return Promise.resolve();
}

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    await http.post('/auth/change-password', { newPassword: form.newPassword });
    // Clear forcePasswordChange flag from localStorage
    try {
      const info = localStorage.getItem('sga_user_info');
      if (info) {
        const parsed = JSON.parse(info) as { isSuperUser?: boolean; email?: string; forcePasswordChange?: boolean };
        parsed.forcePasswordChange = false;
        localStorage.setItem('sga_user_info', JSON.stringify(parsed));
      }
    } catch { /* ignore */ }
    void message.success('密码修改成功');
    const info = localStorage.getItem('sga_user_info');
    const isSuperUser = info ? (JSON.parse(info) as { isSuperUser?: boolean }).isSuperUser : false;
    await router.push(isSuperUser ? '/settings' : '/tokens');
  } catch {
    void message.error('修改失败，请重试');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.change-pw-page {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}
.change-pw-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}
.change-pw-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 40px 36px;
  width: 100%;
  max-width: 420px;
  text-align: center;
}
.card-icon {
  font-size: 48px;
  margin-bottom: 16px;
}
.card-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px;
}
.card-sub {
  color: #888;
  font-size: 14px;
  margin: 0 0 28px;
}
.submit-btn {
  margin-top: 4px;
  border-radius: 8px;
  font-size: 15px;
  height: 44px;
}
</style>
