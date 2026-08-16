// ============================================================
// DSH 桌宠 — Client 半源码（动态 Cordis 插件）
//
// 版本：pkg-9（状态优先级修复）
// 用途：作为 cordis_define 的 code.client 参数（纯函数体）
//
// 功能：
//  - shell.overlay 注册桌宠本体（<img> 立绘，按状态切图）
//      idle/celebrate -> res/pet-3.png
//      thinking       -> res/pet-2.png
//      error          -> res/pet-1.png
//  - thinking 状态优先级最高（reaction 不覆盖思考图）
//  - 拖拽（Pointer + Mouse 双事件链、像素预览兜底、抓取偏移保持）
//  - 点击互动气泡、浮动/呼吸/跳跃/抖动 CSS 动画
//  - sidebar.footer.action 注册开关按钮（🐾）
//  - 800ms 轮询 Host pet/snapshot；图片经 pet/get-image 以 data URI 加载
// ============================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const store = {
      enabled: true,
      x: 0.92,
      y: 0.86,
      status: 'idle',
      reaction: null,
      bubble: null,
      listeners: [],
      subscribe(fn) {
        this.listeners.push(fn)
        return () => {
          this.listeners = this.listeners.filter((l) => l !== fn)
        }
      },
      notify() {
        for (const fn of this.listeners) {
          try { fn() } catch (_) {}
        }
      },
      patch(p) {
        for (const k in p) this[k] = p[k]
        this.notify()
      },
    }

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

    const poll = () => {
      host.call('pet/snapshot', {}).then((s) => {
        if (!s || typeof s !== 'object') return
        store.patch({
          enabled: s.enabled === false ? false : true,
          x: typeof s.x === 'number' ? clamp01(s.x) : store.x,
          y: typeof s.y === 'number' ? clamp01(s.y) : store.y,
          status: typeof s.status === 'string' ? s.status : 'idle',
          reaction: typeof s.reaction === 'string' ? s.reaction : null,
          bubble: typeof s.bubble === 'string' ? s.bubble : null,
        })
      }).catch(() => {})
    }
    poll()
    ctx.interval(poll, 800)

    const poke = () => {
      host.call('pet/poke', {}).then((r) => {
        if (r && typeof r.bubble === 'string') store.patch({ bubble: r.bubble })
      }).catch(() => {})
    }

    const setEnabled = (enabled) => {
      store.patch({ enabled })
      host.call('pet/set-enabled', { enabled }).catch(() => {})
    }

    const measureViewport = (el, ev) => {
      let node = el ? el.parentElement : null
      while (node) {
        let r = null
        try { r = node.getBoundingClientRect() } catch (_) {}
        if (r && r.width > 150 && r.height > 100) return r
        node = node.parentElement
      }
      if (ev && ev.view) {
        try {
          const w = ev.view.innerWidth
          const h = ev.view.innerHeight
          if (w > 150 && h > 100) return { left: 0, top: 0, width: w, height: h }
        } catch (_) {}
      }
      return null
    }

    let dragState = null

    const IMG_BY_MOOD = { idle: '3', thinking: '2', celebrate: '3', error: '1' }

    function Pet() {
      const [, setTick] = React.useState(0)
      const [pos, setPos] = React.useState({ x: store.x, y: store.y })
      const [preview, setPreview] = React.useState(null)
      const [uris, setUris] = React.useState({})
      React.useEffect(() => store.subscribe(() => {
        if (!dragState) setPos({ x: store.x, y: store.y })
        setTick((t) => t + 1)
      }), [])
      React.useEffect(() => {
        let alive = true
        const ids = ['1', '2', '3']
        const load = async () => {
          const out = {}
          await Promise.all(ids.map((id) =>
            host.call('pet/get-image', { id }).then((r) => {
              if (alive && r && typeof r.uri === 'string') out[id] = r.uri
              else if (r && typeof r.error === 'string') console.error('[pet] img ' + id + ': ' + r.error)
            }).catch((e) => console.error('[pet] img ' + id + ': ', e)),
          ))
          if (alive) setUris(out)
        }
        load()
        return () => { alive = false }
      }, [])

      if (!store.enabled) return null

      const startDrag = (e, useCapture) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const el = e.currentTarget
        const rect = measureViewport(el, e)
        const d = {
          x: e.clientX,
          y: e.clientY,
          nx: store.x,
          ny: store.y,
          moved: false,
          el,
          mode: rect ? 'pos' : 'px',
          rect,
          gx: 0,
          gy: 0,
        }
        if (rect) {
          d.gx = e.clientX - (store.x * rect.width + rect.left)
          d.gy = e.clientY - (store.y * rect.height + rect.top)
        }
        dragState = d
        if (useCapture) {
          try { el.setPointerCapture(e.pointerId) } catch (_) {}
        }
        try { e.preventDefault() } catch (_) {}
        setTick((t) => t + 1)
      }

      const moveDrag = (e) => {
        const d = dragState
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (dx < -3 || dx > 3 || dy < -3 || dy > 3) d.moved = true
        if (!d.moved) return
        if (d.mode === 'pos' && d.rect) {
          d.nx = clamp01((e.clientX - d.rect.left - d.gx) / d.rect.width)
          d.ny = clamp01((e.clientY - d.rect.top - d.gy) / d.rect.height)
          setPos({ x: d.nx, y: d.ny })
        } else {
          setPreview({ dx, dy })
        }
      }

      const endDrag = (e) => {
        const d = dragState
        dragState = null
        setPreview(null)
        if (!d) return
        if (d.moved) {
          if (d.mode === 'px') {
            const rect = measureViewport(d.el, e)
            if (rect) {
              d.nx = clamp01((e.clientX - rect.left) / rect.width)
              d.ny = clamp01((e.clientY - rect.top) / rect.height)
              d.mode = 'pos'
              d.rect = rect
            }
          }
          if (d.mode === 'pos' && (d.nx !== store.x || d.ny !== store.y)) {
            store.patch({ x: d.nx, y: d.ny })
            host.call('pet/set-position', { x: d.nx, y: d.ny }).catch(() => {})
            setPos({ x: d.nx, y: d.ny })
          }
        } else {
          poke()
        }
        setTick((t) => t + 1)
      }

      // thinking always wins: while the agent is working, never show error/celebrate images
      const mood = store.status === 'thinking' ? 'thinking' : (store.reaction || store.status)
      const imgId = IMG_BY_MOOD[mood] || '3'
      const uri = uris[imgId]
      const left = (pos.x * 100).toFixed(2) + '%'
      const top = (pos.y * 100).toFixed(2) + '%'
      const transform = preview
        ? 'translate(calc(-50% + ' + preview.dx + 'px), calc(-50% + ' + preview.dy + 'px))'
        : undefined

      return React.createElement('div', {
        className: 'dsh-pet-root' + (dragState ? ' is-dragging' : ''),
        style: {
          left,
          top,
          transform,
          pointerEvents: 'auto',
          cursor: dragState ? 'grabbing' : 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none',
          zIndex: 2147483000,
        },
        onPointerDown: (e) => startDrag(e, true),
        onPointerMove: moveDrag,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onPointerLeave: endDrag,
        onMouseDown: (e) => startDrag(e, false),
        onMouseMove: moveDrag,
        onMouseUp: endDrag,
        onMouseLeave: endDrag,
      },
        mood === 'thinking' ? React.createElement('div', { className: 'dsh-pet-zzz' }, 'zZ') : null,
        mood === 'error' ? React.createElement('div', { className: 'dsh-pet-drop' }, '💧') : null,
        mood === 'celebrate' ? React.createElement('div', { className: 'dsh-pet-stars' }, '🎉✨') : null,
        store.bubble ? React.createElement('div', { className: 'dsh-pet-bubble' }, store.bubble) : null,
        uri
          ? React.createElement('img', {
              className: 'dsh-pet-img mood-' + mood,
              src: uri,
              alt: '',
              draggable: false,
              style: {
                width: 170,
                height: 170,
                objectFit: 'contain',
                pointerEvents: 'none',
                userSelect: 'none',
                display: 'block',
              },
            })
          : React.createElement('div', {
              className: 'dsh-pet-img mood-' + mood,
              style: {
                width: 170,
                height: 170,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 72,
                pointerEvents: 'none',
              },
            }, '🐟'),
      )
    }

    function ToggleButton(props) {
      const [, setTick] = React.useState(0)
      React.useEffect(() => store.subscribe(() => setTick((t) => t + 1)), [])
      const on = store.enabled
      return React.createElement('button', {
        className: 'dsh-pet-toggle' + (on ? ' is-on' : ''),
        title: on ? '关闭桌宠' : '开启桌宠',
        'aria-pressed': on,
        onClick: () => setEnabled(!on),
      },
        React.createElement('span', { className: 'dsh-pet-toggle-icon' }, '🐾'),
        props.wide ? React.createElement('span', { className: 'dsh-pet-toggle-label' }, on ? '桌宠开' : '桌宠关') : null,
      )
    }

    const CSS = `
.dsh-pet-root {
  position: fixed;
  z-index: 2147483000;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.dsh-pet-root.is-dragging { cursor: grabbing; }
.dsh-pet-img {
  animation: dshPetFloat 3.2s ease-in-out infinite;
  transform-origin: 50% 100%;
}
.dsh-pet-img.mood-thinking { animation: dshPetBreathe 2.2s ease-in-out infinite; }
.dsh-pet-img.mood-celebrate { animation: dshPetJump 0.5s ease-in-out 4; }
.dsh-pet-img.mood-error { animation: dshPetShake 0.35s linear 6; }
@keyframes dshPetFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes dshPetBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}
@keyframes dshPetJump {
  0%, 100% { transform: translateY(0) scale(1); }
  40% { transform: translateY(-14px) scale(1.06); }
}
@keyframes dshPetShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.dsh-pet-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: rgba(24, 24, 30, 0.92);
  color: #fff;
  padding: 5px 10px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  animation: dshPetBubbleIn 0.25s ease-out;
}
@keyframes dshPetBubbleIn {
  from { opacity: 0; transform: translateX(-50%) translateY(6px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.dsh-pet-zzz {
  position: absolute;
  top: -14px;
  right: -4px;
  font-size: 16px;
  font-weight: 700;
  color: #8a8f98;
  animation: dshPetZzz 1.2s ease-in-out infinite;
}
@keyframes dshPetZzz {
  0% { transform: translateY(0); opacity: 0; }
  40% { opacity: 1; }
  100% { transform: translateY(-10px); opacity: 0; }
}
.dsh-pet-drop {
  position: absolute;
  top: -6px;
  right: 6px;
  font-size: 14px;
  animation: dshPetDrop 1s ease-in-out infinite;
}
@keyframes dshPetDrop {
  0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.8; }
  50% { transform: translateY(4px) rotate(10deg); opacity: 1; }
}
.dsh-pet-stars {
  position: absolute;
  top: -10px;
  left: -6px;
  font-size: 14px;
  animation: dshPetStars 0.8s ease-in-out infinite;
}
@keyframes dshPetStars {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.25); }
}
.dsh-pet-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font: inherit;
  border-radius: 8px;
}
.dsh-pet-toggle:hover { background: rgba(128, 128, 128, 0.15); }
.dsh-pet-toggle:not(.is-on) .dsh-pet-toggle-icon {
  filter: grayscale(1);
  opacity: 0.5;
}
.dsh-pet-toggle-label { font-size: 12px; }
`

    styles.insert(CSS)

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'pet.overlay', order: 100 },
      () => React.createElement(Pet),
    ))

    slots.inject('sidebar.footer.action', () => slots.register(
      { name: 'sidebar.footer.action', id: 'pet.toggle', order: 10 },
      (props) => React.createElement(ToggleButton, { wide: !!(props && props.wide) }),
    ))
  },
}
