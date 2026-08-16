// ============================================================
// DSH 桌宠 — Host 半源码（动态 Cordis 插件）
//
// 版本：pkg-9（状态优先级修复）
// 用途：作为 cordis_define 的 code.host 参数（纯函数体）
//
// 功能：
//  - 监听 agent/status、agent/error、workflow/start|end、agent/disposed
//    维护桌宠状态机（idle / thinking / celebrate / error）
//  - thinking 状态下不输出 reaction（思考图优先，避免工具小错误切出错图）
//  - 通过 harness.handle 暴露 RPC：
//      pet/snapshot      状态快照（Client 每 800ms 轮询）
//      pet/get-image     读取工作区透明 PNG 转 base64 data URI
//      pet/set-enabled   开关
//      pet/set-position  拖拽位置（0..1 归一化）
//      pet/poke          点击问候语
//  - 开关与位置保存在 Host 内存（刷新页面不丢；完整重启后回到默认）
// ============================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const agentStatus = new Map()
    let runningCount = 0
    let workflowActive = 0
    let enabled = true
    let pos = { x: 0.92, y: 0.86 }
    let reactionKind = null
    let bubbleText = null
    let reactSeq = 0
    let bubbleSeq = 0
    let greetIdx = 0
    let lastErrorAt = 0

    const GREETINGS = ['嗨，我在这～', '有什么要帮忙的吗？', '喵～', '今天也要加油哦！', '我在认真看着你干活呢']

    const setReaction = (kind, ms, text) => {
      reactionKind = kind
      bubbleText = text
      const rs = ++reactSeq
      const bs = ++bubbleSeq
      ctx.timeout(() => {
        if (reactSeq === rs) reactionKind = null
        if (bubbleSeq === bs) bubbleText = null
      }, ms)
    }

    const statusNow = () => {
      if (runningCount > 0 || workflowActive > 0) return 'thinking'
      return 'idle'
    }

    ctx.on('agent/status', (payload) => {
      if (!payload || !payload.agent) return
      const prev = agentStatus.get(payload.agent)
      const next = payload.status
      if (prev === next) return
      agentStatus.set(payload.agent, next)
      if (next === 'running') {
        runningCount += 1
      } else if (prev === 'running') {
        runningCount -= 1
        if (runningCount < 0) runningCount = 0
        if (runningCount === 0 && workflowActive === 0) {
          setReaction('celebrate', 4000, '搞定啦！🎉')
        }
      }
    })

    ctx.on('agent/error', () => {
      lastErrorAt = 1
      // Only show the error image once the agent is idle; while it keeps working
      // (e.g. fixing the mistake) the thinking image stays visible.
      if (runningCount === 0 && workflowActive === 0) {
        setReaction('error', 4000, '出错了…别慌，看看日志？')
      }
    })

    ctx.on('agent/disposed', (payload) => {
      if (!payload || !payload.agent) return
      const prev = agentStatus.get(payload.agent)
      if (prev === 'running') {
        runningCount -= 1
        if (runningCount < 0) runningCount = 0
      }
      agentStatus.delete(payload.agent)
    })

    ctx.on('workflow/start', () => {
      workflowActive += 1
    })

    ctx.on('workflow/end', () => {
      workflowActive -= 1
      if (workflowActive < 0) workflowActive = 0
      if (runningCount === 0 && workflowActive === 0) {
        setReaction('celebrate', 4000, '搞定啦！🎉')
      }
    })

    const agents = ctx.get('agents')
    if (agents !== undefined && typeof agents.list === 'function') {
      try {
        for (const agent of agents.list()) {
          const st = agent && agent.status
          if (st === 'running' || st === 'idle') {
            agentStatus.set(agent, st)
            if (st === 'running') runningCount += 1
          }
        }
      } catch (_) {}
    }

    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const bytesToBase64 = (bytes) => {
      let out = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined
        out += B64[b0 >> 2]
        out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
        out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
        out += b2 === undefined ? '=' : B64[b2 & 63]
      }
      return out
    }

    const IMG_FILES = {
      1: 'pet-cutout-1-small.png',
      2: 'pet-cutout-2-small.png',
      3: 'pet-cutout-3-small.png',
    }
    const imgUriCache = {}

    harness.handle('pet/get-image', async (args) => {
      const id = args && args.id
      const file = IMG_FILES[id]
      if (!file) return { uri: null, error: 'unknown id: ' + String(id) }
      if (imgUriCache[id]) return { uri: imgUriCache[id] }
      const fs = ctx.get('fs')
      if (!fs) return { uri: null, error: 'fs service unavailable' }

      const readUri = async (path, cwd) => {
        const target = cwd ? await fs.resolve(path, { cwd }) : await fs.resolve(path)
        const bytes = await fs.readBytes(target, undefined, 4 * 1024 * 1024)
        if (!bytes || !bytes.length) return null
        return 'data:image/png;base64,' + bytesToBase64(bytes)
      }

      const sp = ctx.get('sandboxPolicy')
      const root = sp && sp.workspaceRoot ? sp.workspaceRoot : null
      if (root) {
        try {
          const uri = await readUri(file, root)
          if (uri) {
            imgUriCache[id] = uri
            return { uri }
          }
        } catch (err) {
          console.error('[pet] workspaceRoot read failed:', String(err))
        }
      }

      try {
        const uri = await readUri('D:\\aiagent\\' + file, null)
        if (uri) {
          imgUriCache[id] = uri
          return { uri }
        }
      } catch (err2) {
        return { uri: null, error: 'read failed: ' + String(err2) }
      }
      return { uri: null, error: 'unknown failure' }
    })

    harness.handle('pet/snapshot', () => {
      const st = statusNow()
      return {
        enabled,
        x: pos.x,
        y: pos.y,
        status: st,
        // While thinking, never report a reaction: the thinking image must win.
        reaction: st === 'thinking' ? null : reactionKind,
        bubble: bubbleText,
      }
    })

    harness.handle('pet/set-enabled', (args) => {
      enabled = !!(args && args.enabled === true)
      return { ok: true }
    })

    harness.handle('pet/set-position', (args) => {
      if (args && typeof args.x === 'number' && typeof args.y === 'number') {
        const cx = args.x < 0 ? 0 : args.x > 1 ? 1 : args.x
        const cy = args.y < 0 ? 0 : args.y > 1 ? 1 : args.y
        pos = { x: cx, y: cy }
      }
      return { ok: true }
    })

    harness.handle('pet/poke', () => {
      const text = GREETINGS[greetIdx % GREETINGS.length]
      greetIdx += 1
      bubbleText = text
      const bs = ++bubbleSeq
      ctx.timeout(() => {
        if (bubbleSeq === bs && bubbleText === text) bubbleText = null
      }, 2500)
      return { bubble: text }
    })
  },
}
