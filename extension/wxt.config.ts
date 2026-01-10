import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Browser Agent Companion',
    description: 'Sync cookies and record macros for browser-agent server',
    permissions: ['cookies', 'activeTab', 'tabs', 'storage', 'scripting', 'contextMenus'],
    host_permissions: ['<all_urls>'],
  },
});
