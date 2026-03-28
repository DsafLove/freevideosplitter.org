<script setup>
import { computed } from 'vue'
import VideoUploader from './components/VideoUploader.vue'
import assets from './assets/assets.json'

const bgModules = import.meta.glob('./assets/backgrounds/*', { eager: true, query: '?url', import: 'default' })

function resolveAssetUrl(globMap, manifestUrl) {
    const filename = manifestUrl.split('/').pop()
    const match = Object.entries(globMap).find(([key]) => key.endsWith(filename))
    return match ? match[1] : ''
}

const backgrounds = assets.backgrounds
const activeBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)]

const backgroundStyle = computed(() => {
  const bg = activeBackground
  const gradientFn = bg.gradient.type === 'radial' ? 'radial-gradient' : 'linear-gradient'
  const gradientLayer = `${gradientFn}(${bg.gradient.colors.join(', ')})`
  const imageUrl = resolveAssetUrl(bgModules, bg.url)
  return {
    backgroundImage: `${gradientLayer}, url(${imageUrl})`,
    backgroundSize: bg.size,
    backgroundPosition: bg.position,
    backgroundRepeat: bg.repeat,
  }
})
</script>

<template>
  <main :style="backgroundStyle">
    <VideoUploader class="full-width" />
  </main>
</template>

<style>
:root {
  --primary-color: #3b82f6;
  --background-color: #f8fafc;
  --text-color: #1e293b;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--background-color);
  color: var(--text-color);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

#app {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  #app {
    padding: 0.5rem;
  }
  .full-width {
    padding: 0 0.5rem;
  }
}

@media (max-width: 480px) {
  #app {
    padding: 0.25rem;
  }
  .full-width {
    padding: 0 0.25rem;
  }
}

main {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.full-width {
  width: 100vw;
  padding: 0 2rem;
  box-sizing: border-box;
}

h1 {
  font-weight: 600;
  font-size: 3rem;
  margin-bottom: 2rem;
  text-align: center;
  background: linear-gradient(135deg, var(--primary-color), #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

.dot {
  color: #8b5cf6;
  -webkit-text-fill-color: #8b5cf6;
}
</style>
