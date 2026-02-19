<template>
  <a-layout style="min-height: 100vh; align-items: center; justify-content: center">
    <a-card title="登录 SGA MCP Market" style="width: 420px">
      <a-form layout="vertical" @finish="onSubmit">
        <a-form-item label="Email" name="email" :rules="[{ required: true, message: '请输入邮箱' }]">
          <a-input v-model:value="form.email" />
        </a-form-item>
        <a-form-item label="Password" name="password" :rules="[{ required: true, message: '请输入密码' }]">
          <a-input-password v-model:value="form.password" />
        </a-form-item>
        <a-button type="primary" html-type="submit" :loading="loading" block>登录</a-button>
      </a-form>
    </a-card>
  </a-layout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import http from '@/utils/http';

const router = useRouter();
const loading = ref(false);
const form = reactive({
  email: '',
  password: ''
});

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    const res = await http.post<{ accessToken: string }>('/auth/login', {
      email: form.email,
      password: form.password
    });
    localStorage.setItem('sga_market_token', res.data.accessToken);
    message.success('登录成功');
    await router.push('/tokens');
  } catch {
    message.error('登录失败，请检查账号密码');
  } finally {
    loading.value = false;
  }
}
</script>
