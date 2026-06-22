import { createApp } from 'vue'
import App from './App.vue'
import './index.css'

// Read theme from URL hash params and apply to <html>
const hash = location.hash.replace(/^#/, '')
const params = new URLSearchParams(hash)
const theme = params.get('theme') || 'dark'
if (theme === 'dark') {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

createApp(App).mount('#root')
