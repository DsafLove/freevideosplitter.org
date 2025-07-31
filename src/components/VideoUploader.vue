<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

const videoFile = ref(null)
const videoUrl = ref('')
const videoDuration = ref(0)
const currentTime = ref(0)
const videoRef = ref(null)
const thumbnails = ref([])
const isPlaying = ref(false)
const isDragging = ref(false)
const splitPoints = ref([])
const isGenerating = ref(false)
const clipStatus = ref(new Map())
const ffmpeg = ref(null)
const isFFmpegReady = ref(false)
const isFFmpegLoading = ref(false)
const THUMBNAIL_COUNT = 20
const autoTrimInterval = ref(30) // Default 30 seconds

onMounted(async () => {
    try {
        isFFmpegLoading.value = true
        ffmpeg.value = createFFmpeg({
            corePath: './ffmpeg/ffmpeg-core.js',
            log: true
        })
        await ffmpeg.value.load()
        isFFmpegReady.value = true
    } catch (error) {
        console.error('Failed to load FFmpeg:', error)
    } finally {
        isFFmpegLoading.value = false
    }
})

const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
        videoFile.value = file
        videoUrl.value = URL.createObjectURL(file)
    }
}

const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    const parts = []
    if (hrs > 0) parts.push(String(hrs).padStart(2, '0'))
    parts.push(String(mins).padStart(2, '0'))
    parts.push(String(secs).padStart(2, '0'))

    return parts.join(':')
}

const generateThumbnail = async (time) => {
    return new Promise((resolve) => {
        const video = videoRef.value
        video.currentTime = time

        video.addEventListener('seeked', function onSeeked() {
            const canvas = document.createElement('canvas')
            canvas.width = 160  // Thumbnail width
            canvas.height = 90  // 16:9 aspect ratio

            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

            const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
            video.removeEventListener('seeked', onSeeked)
            resolve(thumbnail)
        }, { once: true })
    })
}

const generateThumbnails = async () => {
    const duration = videoDuration.value
    const interval = duration / THUMBNAIL_COUNT
    const times = Array.from({ length: THUMBNAIL_COUNT }, (_, i) => i * interval)

    thumbnails.value = []
    for (const time of times) {
        const thumbnail = await generateThumbnail(time)
        thumbnails.value.push({ time, src: thumbnail })
    }

    // Reset video position to start
    if (videoRef.value) {
        videoRef.value.currentTime = 0
        currentTime.value = 0
    }
}

const handleVideoMetadata = () => {
    videoDuration.value = videoRef.value.duration
    generateThumbnails()
}

const handleTimeUpdate = () => {
    currentTime.value = videoRef.value.currentTime
}

const timelineProgress = computed(() => {
    return (currentTime.value / videoDuration.value) * 100
})

const updateTimeFromPosition = (clientX, timeline) => {
    const rect = timeline.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const newTime = percentage * videoDuration.value

    if (videoRef.value) {
        videoRef.value.currentTime = newTime
        currentTime.value = newTime
    }
}

const handleTimelineMousedown = (event) => {
    // If clicking scissors button or split point, don't update timeline position
    if (event.target.closest('.scissors-button') || event.target.closest('.split-point')) {
        return
    }

    isDragging.value = true
    const timeline = event.currentTarget
    updateTimeFromPosition(event.clientX, timeline)
}

const handleTimelineMousemove = (event) => {
    if (isDragging.value) {
        const timeline = event.currentTarget
        updateTimeFromPosition(event.clientX, timeline)
    }
}

const handleTimelineMouseup = () => {
    isDragging.value = false
}

const handleTimelineMouseleave = () => {
    if (isDragging.value) {
        isDragging.value = false
    }
}

const togglePlay = () => {
    if (videoRef.value) {
        if (isPlaying.value) {
            videoRef.value.pause()
        } else {
            videoRef.value.play()
        }
        isPlaying.value = !isPlaying.value
    }
}

const handleVideoPlay = () => {
    isPlaying.value = true
}

const handleVideoPause = () => {
    isPlaying.value = false
}

const addSplitPoint = () => {
    // Don't add duplicate split points
    if (!splitPoints.value.includes(currentTime.value)) {
        splitPoints.value.push(currentTime.value)
        // Sort split points by time
        splitPoints.value.sort((a, b) => a - b)
    }
}

const removeSplitPoint = (time) => {
    splitPoints.value = splitPoints.value.filter(t => t !== time)
}

const resetSplitPoints = () => {
    splitPoints.value = []
}

const refreshPage = () => {
    window.location.href = window.location.href
}

const moveTime = (delta) => {
    if (!videoRef.value) return
    let newTime = videoRef.value.currentTime + delta
    newTime = Math.max(0, Math.min(videoDuration.value, newTime))
    videoRef.value.currentTime = newTime
    currentTime.value = newTime
}

const moveVolume = (delta) => {
    if (!videoRef.value) return
    let newVolume = videoRef.value.volume + delta
    newVolume = Math.max(0, Math.min(1, newVolume))
    videoRef.value.volume = newVolume
}

const toggleMute = () => {
    if (!videoRef.value) return
    videoRef.value.muted = !videoRef.value.muted
}

const toggleFullScreen = () => {
    if (!videoRef.value) return
    if (document.fullscreenElement) {
        document.exitFullscreen()
    } else {
        videoRef.value.requestFullscreen()
    }
}

const handleKeydown = (/** @type {KeyboardEvent} */ event) => {
    if (!videoUrl.value) return
    const tag = event.target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return

    let step = 1;
    if (event.shiftKey) {
        step = 5;
    } else if (event.ctrlKey) {
        step = 0.5;
    } else if (event.altKey) {
        step = 0.1;
    }

    if (event.key === 'ArrowLeft') {
        moveTime(-step)
        event.preventDefault()
    } else if (event.key === 'ArrowRight') {
        moveTime(step)
        event.preventDefault()
    } else if (event.key === 'ArrowUp') {
        moveVolume(0.1)
        event.preventDefault()
    } else if (event.key === 'ArrowDown') {
        moveVolume(-0.1)
        event.preventDefault()
    } else if (event.key === 'm') {
        toggleMute()
        event.preventDefault()
    } else if (event.key === 'p') {
        toggleFullScreen()
        event.preventDefault()
    } else if (event.key === 'f' || event.key === 'F') {
        addSplitPoint()
        event.preventDefault()
    } else if (event.key === ' ' || event.key === 'Space') {
        togglePlay()
        event.preventDefault()
    }
}

const autoTrim = () => {
    if (!videoFile.value || !videoDuration.value) return

    // Clear existing split points
    splitPoints.value = []

    // Add split points at regular intervals
    let currentTime = autoTrimInterval.value
    while (currentTime < videoDuration.value) {
        splitPoints.value.push(currentTime)
        currentTime += autoTrimInterval.value
    }
}

const clips = computed(() => {
    // Add video end as the last split point
    const allPoints = [...splitPoints.value, videoDuration.value].sort((a, b) => a - b)
    const result = []
    let startTime = 0

    for (let i = 0; i < allPoints.length; i++) {
        const endTime = allPoints[i]
        const duration = endTime - startTime
        result.push({
            number: i + 1,
            startTime,
            endTime,
            duration,
            startTimeFormatted: formatTime(startTime),
            endTimeFormatted: formatTime(endTime),
            durationFormatted: formatTime(duration)
        })
        startTime = endTime // Update startTime for next clip
    }

    return result
})

const generateClips = async () => {
    if (!ffmpeg.value || !videoFile.value || !isFFmpegReady.value) return

    try {
        Lit.event("generate");
    } catch (error) {
        console.error('Error tracking generate event:', error);
    }

    isGenerating.value = true

    // Initialize status for each clip
    clips.value.forEach(clip => {
        clipStatus.value.set(clip.number, {
            progress: 0,
            status: 'waiting',
            error: null
        })
    })

    try {
        // Write input file to FFmpeg's virtual filesystem
        const inputData = await fetchFile(videoFile.value)
        ffmpeg.value.FS('writeFile', 'input', inputData)

        // Process clips sequentially
        for (const clip of clips.value) {
            try {
                console.log(`Processing clip ${clip.number}:`, {
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                    duration: clip.endTime - clip.startTime
                })

                // Update status to processing
                clipStatus.value.set(clip.number, {
                    progress: 0,
                    status: 'processing',
                    error: null
                })

                const outputName = `clip_${clip.number}.${videoFile.value.name.split('.').pop()}`
                const duration = clip.endTime - clip.startTime

                // Run FFmpeg command to extract clip
                await ffmpeg.value.run(
                    '-ss', clip.startTime.toString(),
                    '-i', 'input',
                    '-t', duration.toString(),
                    '-c', 'copy',
                    outputName
                )

                console.log(`FFmpeg command for clip ${clip.number}:`, [
                    '-ss', clip.startTime.toString(),
                    '-i', 'input',
                    '-t', duration.toString(),
                    '-c', 'copy',
                    outputName
                ])

                // Read the output file
                const data = ffmpeg.value.FS('readFile', outputName)
                const blob = new Blob([data.buffer], { type: videoFile.value.type })

                // Store blob for download
                clip.blob = blob

                // Mark as complete
                clipStatus.value.set(clip.number, {
                    progress: 100,
                    status: 'complete',
                    error: null
                })

                // Clean up output file
                ffmpeg.value.FS('unlink', outputName)
            } catch (error) {
                console.error('Error processing clip:', error)
                clipStatus.value.set(clip.number, {
                    progress: 0,
                    status: 'error',
                    error: error.message || 'Failed to process clip'
                })
            }
        }

        // Clean up input file
        ffmpeg.value.FS('unlink', 'input')
    } catch (error) {
        console.error('Error in generate clips:', error)
    } finally {
        isGenerating.value = false
    }
}

const retryClip = async (clipNumber) => {
    // Similar to generateClips but for a single clip
    clipStatus.value.set(clipNumber, {
        progress: 0,
        status: 'processing',
        error: null
    })

    // Simulate processing for the single clip
    for (let progress = 0; progress <= 100; progress += 10) {
        clipStatus.value.set(clipNumber, {
            progress,
            status: 'processing',
            error: null
        })
        await new Promise(resolve => setTimeout(resolve, 200))
    }

    clipStatus.value.set(clipNumber, {
        progress: 100,
        status: 'complete',
        error: null
    })
}

const downloadClip = (clip) => {
    if (!clip.blob) return

    const url = URL.createObjectURL(clip.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clip_${clip.number}_${clip.startTimeFormatted}-${clip.endTimeFormatted}.${videoFile.value.name.split('.').pop()}`
    document.body.appendChild(a)
    a.click()

    // Cleanup
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

videoRef.value?.addEventListener('play', handleVideoPlay)
videoRef.value?.addEventListener('pause', handleVideoPause)

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div class="video-splitter-container">
        <h1 class="app-title">Dsaf Video Splitter</h1>
        <p class="app-subtitle">Split Video 100% In Your Device (No uploads). No Ads. 100% Free.</p>
        <div class="video-uploader">
            <div class="upload-section" v-if="!videoUrl">
                <input type="file" accept="video/*" @change="handleFileUpload" class="file-input" id="video-upload" />
                <label for="video-upload" class="upload-label">
                    <svg xmlns="http://www.w3.org/2000/svg" class="upload-icon" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Choose a video file
                </label>
            </div>

            <div v-if="videoUrl" class="video-container">
                <div class="video-player">
                    <video ref="videoRef" :src="videoUrl" class="video-element" @loadedmetadata="handleVideoMetadata"
                        @timeupdate="handleTimeUpdate"></video>
                </div>
            </div>
        </div>

        <div v-if="videoUrl" class="timeline-container">
            <div class="timeline-header">
                <span class="time-label">{{ formatTime(currentTime) }}</span>
                <span class="time-label total-duration">{{ formatTime(videoDuration) }}</span>
            </div>
            <div class="timeline" @mousedown="handleTimelineMousedown" @mousemove="handleTimelineMousemove"
                @mouseup="handleTimelineMouseup" @mouseleave="handleTimelineMouseleave">
                <div class="thumbnails-track">
                    <div v-for="(thumb, index) in thumbnails" :key="index" class="thumbnail" :style="{
                        backgroundImage: `url(${thumb.src})`,
                        left: ((thumb.time / videoDuration) * 100) + '%'
                    }"></div>
                </div>
                <div class="timeline-track">
                    <div class="timeline-progress" :style="{ width: timelineProgress + '%' }"></div>
                </div>
                <!-- Split points -->
                <div v-for="(time, index) in splitPoints" :key="'split-' + index" class="split-point"
                    :style="{ left: ((time / videoDuration) * 100) + '%' }" @click.stop="removeSplitPoint(time)"></div>
                <!-- Playhead and scissors -->
                <div class="playhead" :style="{ left: timelineProgress + '%' }">
                    <button class="scissors-button" @click.stop="addSplitPoint">
                        <svg class="scissors-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <line x1="20" y1="4" x2="8.12" y2="15.88" />
                            <line x1="14.47" y1="14.48" x2="20" y2="20" />
                            <line x1="8.12" y1="8.12" x2="12" y2="12" />
                        </svg>
                    </button>
                </div>
                <div class="time-markers">
                    <div class="marker" v-for="i in 5" :key="i" :style="{ left: ((i - 1) * 25) + '%' }">
                        {{ formatTime((i - 1) * (videoDuration / 4)) }}
                    </div>
                </div>
            </div>
            <div class="controls">
                <div class="controls-row">
                    <div class="buttons-group">
                        <button class="play-button" @click="togglePlay">
                            <svg v-if="!isPlaying" class="play-icon" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
                            </svg>
                            <svg v-else class="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
                                <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
                            </svg>
                        </button>
                        <button class="reset-button" @click="resetSplitPoints" :disabled="!splitPoints.length"
                            title="Reset all split points">
                            <img src="/delete.svg" alt="Reset" class="reset-icon">
                        </button>
                        <button class="delete-button" @click="refreshPage" title="Clear all and refresh">
                            <img src="/reset.svg" alt="Clear all" class="delete-icon">
                        </button>
                    </div>
                    <div class="auto-trim-container">
                        <span class="auto-trim-label">Auto Trim Every:</span>
                        <input type="number" v-model="autoTrimInterval" class="auto-trim-input" min="1" max="3600">
                        <span class="auto-trim-unit">seconds</span>
                        <button class="auto-trim-button" @click="autoTrim" :disabled="!videoFile || !videoDuration">
                            Auto Add Split Points
                        </button>
                        <p class="manual-split-note">
                            You can add split points manually by clicking on the timeline too.
                        </p>
                    </div>
                </div>
                <div class="controls-row">
                    <button class="generate-clips-button" @click="generateClips"
                        :disabled="clips.length <= 1 || isGenerating || !isFFmpegReady || isFFmpegLoading">
                        <template v-if="isFFmpegLoading">Loading FFmpeg...</template>
                        <template v-else-if="isGenerating">Generating Clips...</template>
                        <template v-else>Generate Clips</template>
                    </button>
                </div>
            </div>

            <!-- FFmpeg Status -->
            <div class="ffmpeg-status" :class="{ 'loading': isFFmpegLoading, 'ready': isFFmpegReady }">
                <div class="status-dot"></div>
                <span v-if="isFFmpegLoading">Downloading an essential file to split your video (you only have to do this
                    once)</span>
                <span v-else-if="isFFmpegReady">Essential Files Are Downloaded. Ready to Split Your Video.</span>
                <span v-else>FFmpeg not loaded</span>
            </div>

            <!-- Clips Table -->
            <div class="clips-table" v-if="clips.length > 0">
                <table>
                    <thead>
                        <tr>
                            <th>Clip</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Duration</th>
                            <th>Download</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="clip in clips" :key="clip.number">
                            <td>#{{ clip.number }}</td>
                            <td>{{ clip.startTimeFormatted }}</td>
                            <td>{{ clip.endTimeFormatted }}</td>
                            <td>{{ clip.durationFormatted }}</td>
                            <td class="status-cell">
                                <template v-if="clipStatus.get(clip.number)">
                                    <!-- Show progress during processing -->
                                    <div v-if="clipStatus.get(clip.number).status === 'processing'"
                                        class="progress-container">
                                        <div class="progress-bar"
                                            :style="{ width: clipStatus.get(clip.number).progress + '%' }"></div>
                                        <span class="progress-text">{{ clipStatus.get(clip.number).progress }}%</span>
                                    </div>

                                    <!-- Show waiting status -->
                                    <div v-else-if="clipStatus.get(clip.number).status === 'waiting'"
                                        class="status-text">
                                        Waiting...
                                    </div>

                                    <!-- Show download button when complete -->
                                    <button v-else-if="clipStatus.get(clip.number).status === 'complete'"
                                        class="download-button" @click="downloadClip(clip)">
                                        Download
                                    </button>

                                    <!-- Show retry button on error -->
                                    <div v-else-if="clipStatus.get(clip.number).status === 'error'"
                                        class="error-container">
                                        <span class="error-text">Error</span>
                                        <button class="retry-button" @click="retryClip(clip.number)">
                                            Retry
                                        </button>
                                    </div>
                                </template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <footer class="footer">
        This is an open source project. <a href="https://github.com/abyabraham93/freevideosplitter.org"
            target="_blank">Get
            access to 100% Free Source code here</a>
    </footer>
</template>

<style scoped>
.video-splitter-container {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}

.app-title {
    text-align: center;
    font-size: 2rem;
    font-weight: 600;
    color: var(--primary-color);
    margin-bottom: 0.5rem;
    font-family: monospace;
}

.app-subtitle {
    text-align: center;
    color: var(--text-color);
    font-size: 1.1rem;
    margin-bottom: 2rem;
    opacity: 0.8;
}

.video-uploader {
    width: 100%;
    max-width: 1200px;
    background: rgb(255 255 255 / 15%);
    border-radius: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
}

.upload-section {
    border: 2px dashed rgb(226 232 240 / 25%);
    border-radius: 12px;
    padding: 3rem;
    text-align: center;
    margin: 2rem;
    background: rgb(248 250 252 / 20%);
    transition: all 0.3s ease;
}

.upload-section:hover {
    border-color: rgb(226 232 240 / 35%);
    background: rgb(240 247 255 / 35%);
}

.file-input {
    display: none;
}

.upload-label {
    background-color: rgb(59 130 246 / 35%);
    color: white;
    padding: 1rem 2rem;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    transition: all 0.2s ease;
}

.upload-icon {
    width: 1.5rem;
    height: 1.5rem;
}

.upload-label:hover {
    background-color: rgb(37 99 235 / 45%);
    transform: translateY(-1px);
}

.video-container {
    padding: 2rem;
}

.video-player {
    display: flex;
    justify-content: center;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
}

.video-element {
    max-height: 40vh;
    width: auto;
    display: block;
}

.timeline-container {
    width: 100%;
    padding: 2rem;
    background: white;
    border-radius: 0;
    min-height: 120px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    margin-top: 3rem;
}

.timeline {
    width: 100%;
    max-width: 1920px;
    margin: 0 auto;
    position: relative;
    padding: 1rem 0;
    cursor: pointer;
    user-select: none;
}

.timeline-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    max-width: 1920px;
    margin: 0 auto 1rem;
    padding: 0 1rem;
}

.time-label {
    font-family: monospace;
    font-size: 1.1rem;
    color: #64748b;
    font-weight: 500;
}

.total-duration {
    color: #94a3b8;
}

.thumbnails-track {
    width: 100%;
    height: 60px;
    background: #0f172a;
    border-radius: 4px;
    position: relative;
    overflow: hidden;
    margin-bottom: 4px;
}

.thumbnail {
    position: absolute;
    width: 106px;
    /* 16:9 aspect ratio of our thumbnails */
    height: 60px;
    background-size: cover;
    background-position: center;
    transform: translateX(-53px);
    /* Half the width to center */
    border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.timeline-track {
    width: 100%;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    position: relative;
    overflow: hidden;
}

.timeline-progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--primary-color);
    transition: width 0.1s linear;
}

.playhead {
    position: absolute;
    width: 4px;
    height: calc(80% - 20px);
    background: var(--primary-color);
    top: 10%;
    transform: translateX(-50%);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
    pointer-events: none;
    z-index: 10;
}

.scissors-button {
    position: absolute;
    right: -24px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    background: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    padding: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    pointer-events: auto;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.scissors-button:hover {
    transform: translateY(-50%) scale(1.1);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.scissors-icon {
    width: 16px;
    height: 16px;
    color: #64748b;
}

.split-point {
    position: absolute;
    width: 4px;
    height: calc(100% - 20px);
    background: #ef4444;
    top: 0;
    transform: translateX(-50%);
    z-index: 5;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.2);
}

.split-point::after {
    content: '×';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 14px;
    font-weight: bold;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    background: #ef4444;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.split-point:hover {
    width: 6px;
    background: #dc2626;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

.split-point:hover::after {
    background: #dc2626;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.time-markers {
    position: relative;
    margin-top: 0.5rem;
    height: 20px;
}

.marker {
    position: absolute;
    transform: translateX(-50%);
    font-family: monospace;
    font-size: 0.8rem;
    color: #64748b;
    white-space: nowrap;
}

.marker::before {
    content: '';
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    height: 6px;
    background: #cbd5e1;
}

.controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 1rem 0;
}

.controls-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
}

.buttons-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-bottom: 0.5rem;
}

.controls-row .play-button,
.controls-row .reset-button {
    flex-shrink: 0;
}

.auto-trim-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: #ffffff;
    padding: 1.25rem 1.5rem;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.auto-trim-label {
    color: #1e293b;
    font-size: 0.95rem;
    font-weight: 500;
    white-space: nowrap;
}

.auto-trim-input {
    width: 70px;
    padding: 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.95rem;
    text-align: center;
    background: #f8fafc;
    transition: all 0.2s ease;
}

.auto-trim-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.auto-trim-unit {
    color: #64748b;
    font-size: 0.95rem;
}

.auto-trim-button {
    background-color: #3b82f6;
    color: white;
    border: none;
    padding: 0.5rem 1.25rem;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.auto-trim-button:hover {
    background-color: #2563eb;
    transform: translateY(-1px);
}

.auto-trim-button:disabled {
    background-color: #94a3b8;
    cursor: not-allowed;
    transform: none;
}

.manual-split-note {
    color: #64748b;
    font-size: 0.9rem;
    font-style: italic;
    margin: 0.5rem 0 0;
    text-align: center;
    width: 100%;
}

@media (max-width: 768px) {
    .auto-trim-container {
        padding: 1rem;
        gap: 0.75rem;
        border-radius: 8px;
    }

    .auto-trim-button {
        width: 100%;
        padding: 0.75rem;
    }

    .generate-clips-button {
        width: 100%;
        padding: 1rem;
        font-size: 1.1rem;
        margin: 0.5rem 0;
        min-height: 56px;
    }

    .controls-row:last-child {
        width: 100%;
        padding: 0 1rem;
    }
}

.play-button,
.reset-button,
.delete-button {
    background-color: var(--primary-color);
    color: white;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
}

.play-button:hover,
.reset-button:hover,
.delete-button:hover {
    background-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
}

.delete-button {
    background-color: #ef4444;
}

.delete-button:hover {
    background-color: #dc2626;
}

.reset-button {
    background-color: #475569;
}

.reset-button:hover {
    background-color: #334155;
}

.reset-button:disabled {
    background-color: #94a3b8;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.generate-clips-button {
    background-color: var(--primary-color);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 200px;
}

.generate-clips-button:hover {
    background-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
}

.generate-clips-button:disabled {
    background-color: #94a3b8;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.clips-table {
    margin-top: 2rem;
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

th,
td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
}

th {
    background: #f8fafc;
    font-weight: 600;
    color: #64748b;
}

td {
    color: #334155;
}

tr:last-child td {
    border-bottom: none;
}

tr:hover td {
    background: #f8fafc;
}

.status-cell {
    width: 150px;
    min-width: 150px;
}

.progress-container {
    position: relative;
    width: 100%;
    height: 24px;
    background: #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
}

.progress-bar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--primary-color);
    transition: width 0.2s ease;
}

.progress-text {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 12px;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    z-index: 1;
}

.status-text {
    color: #64748b;
    font-size: 14px;
}

.download-button {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.download-button:hover {
    background: #2563eb;
}

.error-container {
    display: flex;
    align-items: center;
    gap: 8px;
}

.error-text {
    color: #ef4444;
    font-size: 14px;
}

.retry-button {
    background: #ef4444;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.retry-button:hover {
    background: #dc2626;
}

.footer {
    text-align: center;
    padding: 1rem;
    margin-top: 2rem;
    color: #666;
    font-size: 0.9rem;
}

.manual-split-note {
    width: 100%;
    text-align: center;
    color: #64748b;
    font-size: 0.85rem;
    margin: 0.5rem 0 0 0;
    font-style: italic;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
    .auto-trim-container {
        border-radius: 8px;
    }

    .video-splitter-container {
        padding: 1rem 0.5rem;
    }

    .app-title {
        font-size: 1.5rem;
    }

    .app-subtitle {
        font-size: 1rem;
        padding: 0 0.5rem;
    }

    .upload-section {
        padding: 1.5rem;
        margin: 0.5rem;
    }

    .video-container {
        padding: 0.5rem;
    }

    .video-element {
        width: 100%;
        max-height: none;
    }

    .timeline-container {
        padding: 1rem;
        margin-top: 2rem;
    }

    .timeline {
        padding: 1rem 0;
    }

    .timeline-header {
        padding: 0;
    }

    .time-label {
        font-size: 0.9rem;
    }

    .thumbnails-track {
        height: 40px;
    }

    .thumbnail {
        height: 40px;
        width: 71px;
        /* Maintaining 16:9 ratio */
        transform: translateX(-35.5px);
    }

    .playhead {
        height: calc(90% - 10px);
        top: 5%;
    }

    .scissors-button {
        width: 20px;
        height: 20px;
        right: -20px;
    }

    .scissors-icon {
        width: 14px;
        height: 14px;
    }

    .split-point {
        width: 3px;
    }

    .markers {
        display: none;
        /* Hide time markers on mobile for cleaner look */
    }

    /* Table Responsive */
    .clips-table {
        margin: 1rem 0;
        overflow-x: auto;
    }

    table {
        min-width: 100%;
        font-size: 0.9rem;
    }

    th,
    td {
        padding: 8px 12px;
    }

    .progress-container {
        min-width: 120px;
    }

    .controls {
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .play-button,
    .generate-clips-button {
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
    }

    .play-icon {
        width: 1.2rem;
        height: 1.2rem;
    }
}

/* Small phones */
@media (max-width: 480px) {
    .video-splitter-container {
        padding: 1rem 0.25rem;
    }

    .app-title {
        font-size: 1.2rem;
    }

    .app-subtitle {
        font-size: 0.9rem;
        padding: 0 0.25rem;
    }

    .upload-section {
        padding: 1rem;
        margin: 0.25rem;
    }

    .timeline-container {
        padding: 0.5rem;
    }

    .time-label {
        font-size: 0.8rem;
    }

    table {
        font-size: 0.8rem;
    }

    th,
    td {
        padding: 6px 8px;
    }
}

.controls-row {
    flex-direction: column;
    align-items: stretch;
}

.auto-trim-container {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
}

.play-button {
    align-self: center;
}

.play-icon,
.reset-icon,
.delete-icon {
    width: 24px;
    height: 24px;
}

.clips-table {
    margin-top: 2rem;
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

th,
td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
}

th {
    background: #f8fafc;
    font-weight: 600;
    color: #64748b;
}

td {
    color: #334155;
}

tr:last-child td {
    border-bottom: none;
}

tr:hover td {
    background: #f8fafc;
}

.status-cell {
    width: 150px;
    min-width: 150px;
}

.progress-container {
    position: relative;
    width: 100%;
    height: 24px;
    background: #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
}

.progress-bar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--primary-color);
    transition: width 0.2s ease;
}

.progress-text {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 12px;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    z-index: 1;
}

.status-text {
    color: #64748b;
    font-size: 14px;
}

.download-button {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.download-button:hover {
    background: #2563eb;
}

.error-container {
    display: flex;
    align-items: center;
    gap: 8px;
}

.error-text {
    color: #ef4444;
    font-size: 14px;
}

.retry-button {
    background: #ef4444;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.retry-button:hover {
    background: #dc2626;
}

.footer {
    text-align: center;
    padding: 1rem;
    margin-top: 2rem;
    color: #666;
    font-size: 0.9rem;
}

.manual-split-note {
    width: 100%;
    text-align: center;
    color: #64748b;
    font-size: 0.85rem;
    margin: 0.5rem 0 0 0;
    font-style: italic;
}

.ffmpeg-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    margin: -1rem auto 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #64748b;
    max-width: fit-content;
}

.ffmpeg-status .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #cbd5e1;
    transition: background-color 0.3s ease;
}

.ffmpeg-status.loading .status-dot {
    background-color: #f59e0b;
    animation: pulse 1.5s infinite;
}

.ffmpeg-status.ready .status-dot {
    background-color: #22c55e;
}

@keyframes pulse {
    0% {
        transform: scale(1);
        opacity: 1;
    }

    50% {
        transform: scale(1.2);
        opacity: 0.7;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}
</style>
