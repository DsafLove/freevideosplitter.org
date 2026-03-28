import { ref, onUnmounted } from 'vue'
import assets from '../assets/assets.json'

const STICKER_SIZE = 80
const BASE_SPEED = 1.5

const stickerModules = import.meta.glob('../assets/stickers/*.png', { eager: true, query: '?url', import: 'default' })
const soundModules = import.meta.glob('../assets/sounds/*.wav', { eager: true, query: '?url', import: 'default' })

function resolveAssetUrl(globMap, manifestUrl) {
    const filename = manifestUrl.split('/').pop()
    const match = Object.entries(globMap).find(([key]) => key.endsWith(filename))
    return match ? match[1] : ''
}

const stickerData = assets.stickers.map(s => ({
    url: resolveAssetUrl(stickerModules, s.url),
    scale: s.scale,
}))

const soundData = assets.sounds.map(s => ({
    url: resolveAssetUrl(soundModules, s.url),
    volume: s.volume,
    loop: s.loop,
    playbackRate: s.playbackRate,
}))

function playRandomSound() {
    const sound = soundData[Math.floor(Math.random() * soundData.length)]
    const audio = new Audio(sound.url)
    audio.volume = sound.volume
    audio.playbackRate = sound.playbackRate
    audio.loop = sound.loop
    audio.play().catch(() => {})
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min)
}

export function useEasterEgg() {
    const stickers = ref([])
    let animationId = null

    function spawnSticker() {
        const sticker = stickerData[Math.floor(Math.random() * stickerData.length)]
        const size = Math.round(STICKER_SIZE * sticker.scale)
        const angle = Math.random() * Math.PI * 2
        const speed = randomBetween(BASE_SPEED * 0.8, BASE_SPEED * 1.4)

        stickers.value.push({
            id: Date.now() + Math.random(),
            url: sticker.url,
            x: randomBetween(0, window.innerWidth - size),
            y: randomBetween(0, window.innerHeight - size),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size,
        })

        if (!animationId) startLoop()
    }

    function tick() {
        const w = window.innerWidth
        const h = window.innerHeight

        for (const s of stickers.value) {
            s.x += s.vx
            s.y += s.vy

            let bounced = false

            if (s.x <= 0) {
                s.x = 0
                s.vx = Math.abs(s.vx)
                bounced = true
            } else if (s.x + s.size >= w) {
                s.x = w - s.size
                s.vx = -Math.abs(s.vx)
                bounced = true
            }

            if (s.y <= 0) {
                s.y = 0
                s.vy = Math.abs(s.vy)
                bounced = true
            } else if (s.y + s.size >= h) {
                s.y = h - s.size
                s.vy = -Math.abs(s.vy)
                bounced = true
            }

            if (bounced) playRandomSound()
        }

        animationId = requestAnimationFrame(tick)
    }

    function startLoop() {
        if (animationId) return
        animationId = requestAnimationFrame(tick)
    }

    onUnmounted(() => {
        if (animationId) {
            cancelAnimationFrame(animationId)
            animationId = null
        }
    })

    return { stickers, spawnSticker }
}
