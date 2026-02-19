<template>
  <div class="login-page">
    <NavBar />
    <div class="login-body">
      <div class="login-card">
        <div class="login-logo">
          <img src="/logo.jpg" style="width:96px;height:96px;border-radius:20px;object-fit:cover;" alt="MCP Claw" />
        </div>
        <h2 class="login-title">Claw MCP Market</h2>
        <p class="login-sub">SGA-Molt中国社区MCP市场</p>

        <a-form layout="vertical" @finish="onSubmit">
          <a-form-item
            label="邮箱"
            name="email"
            :rules="[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效邮箱' }]"
          >
            <a-input
              v-model:value="form.email"
              size="large"
              placeholder="you@example.com"
              autocomplete="email"
            />
          </a-form-item>

          <a-form-item
            label="密码"
            name="password"
            :rules="[{ required: true, message: '请输入密码' }]"
          >
            <a-input-password
              v-model:value="form.password"
              size="large"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </a-form-item>

          <a-button
            type="primary"
            html-type="submit"
            :loading="loading"
            size="large"
            block
            class="login-btn"
          >
            登录
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

interface LoginResp {
  accessToken?: string;
  token?: string;
  isSuperUser?: boolean;
  email?: string;
}

const router = useRouter();
const loading = ref(false);
const form = reactive({
  email: '',
  password: ''
});

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    const res = await http.post<{ code?: number; data?: LoginResp } | LoginResp>(
      '/auth/login',
      { email: form.email, password: form.password }
    );
    const raw = res.data as { code?: number; data?: LoginResp } | LoginResp;
    let token = '';
    let isSuperUser = false;
    let email = '';
    if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
      token = (raw.data as LoginResp).accessToken || (raw.data as LoginResp).token || '';
      isSuperUser = (raw.data as LoginResp).isSuperUser ?? false;
      email = (raw.data as LoginResp).email ?? '';
    } else {
      token = (raw as LoginResp).accessToken || (raw as LoginResp).token || '';
      isSuperUser = (raw as LoginResp).isSuperUser ?? false;
      email = (raw as LoginResp).email ?? '';
    }
    if (token) {
      localStorage.setItem('sga_market_token', token);
      localStorage.setItem('sga_user_info', JSON.stringify({ isSuperUser, email }));
      void message.success('登录成功');
      await router.push(isSuperUser ? '/settings' : '/tokens');
    } else {
      void message.error('登录失败：未获取到令牌');
    }
  } catch {
    void message.error('登录失败，请检查账号密码');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.login-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.login-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  padding: 40px 36px;
  width: 100%;
  max-width: 420px;
}

.login-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.login-title {
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 6px;
}

.login-sub {
  text-align: center;
  color: #888;
  font-size: 14px;
  margin: 0 0 28px;
}

.login-btn {
  margin-top: 4px;
  border-radius: 8px;
  font-size: 15px;
  height: 44px;
}
</style>
