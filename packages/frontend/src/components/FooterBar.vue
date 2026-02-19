<template>
  <footer class="footer-bar">
    <div class="footer-inner">
      <div class="footer-left">
        <img src="/logo.jpg" alt="MCP Claw" class="footer-logo" />
        <span>MCP Market · by SGA</span>
      </div>
      <div class="footer-center">
        Solo Genis Ai — 让 AI 工具触手可及
      </div>
      <div class="footer-right">
        © 2025 SGA · claw-mcp-market
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
// FooterBar — branded site footer
</script>

<style scoped>
.footer-bar {
  background: #0f1117;
  padding: 20px 24px;
}

.footer-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  color: #8b92a5;
  font-size: 13px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-logo {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
}

.footer-center {
  text-align: center;
  flex: 1;
}

.footer-right {
  text-align: right;
}
</style>
