import RotatingText from '../components/RotatingText/RotatingText'
import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, useStore } from '../store'
import ProductCard from '../components/ProductCard'
import * as THREE from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing'

// ── Hyperspeed component (inline) ─────────────────────────────────────────────
const HYPERSPEED_OPTIONS = {
  distortion: 'turbulentDistortion',
  length: 400, roadWidth: 10, islandWidth: 2, lanesPerRoad: 3,
  fov: 90, fovSpeedUp: 150, speedUp: 2, carLightsFade: 0.4,
  totalSideLightSticks: 20, lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05, brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5], lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80], movingCloserSpeed: [-120, -160],
  carLightsLength: [12, 80], carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5], carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808, islandColor: 0x0a0a0a, background: 0x000000,
    shoulderLines: 0x131318, brokenLines: 0x131318,
    leftCars:  [0xf5c842, 0xe8b820, 0xffd700],
    rightCars: [0x7c6aff, 0x5a4fcf, 0x9d8fff],
    sticks: 0xf5c842
  }
}

function HyperspeedCanvas({ options = HYPERSPEED_OPTIONS }) {
  const containerRef = useRef(null)
  const appRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const nsin = val => Math.sin(val) * 0.5 + 0.5
    const random = base => Array.isArray(base) ? Math.random() * (base[1] - base[0]) + base[0] : Math.random() * base
    const pickRandom = arr => Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : arr
    const lerp = (current, target, speed = 0.1, limit = 0.001) => {
      let change = (target - current) * speed
      if (Math.abs(change) < limit) change = target - current
      return change
    }

    const turbulentUniforms = {
      uFreq: { value: new THREE.Vector4(4, 8, 8, 1) },
      uAmp:  { value: new THREE.Vector4(25, 5, 10, 10) }
    }

    const distortions = {
      turbulentDistortion: {
        uniforms: turbulentUniforms,
        getDistortion: `
          uniform vec4 uFreq; uniform vec4 uAmp;
          float nsin(float val){ return sin(val) * 0.5 + 0.5; }
          #define PI 3.14159265358979
          float getDistortionX(float progress){
            return (cos(PI * progress * uFreq.r + uTime) * uAmp.r + pow(cos(PI * progress * uFreq.g + uTime * (uFreq.g / uFreq.r)), 2.) * uAmp.g);
          }
          float getDistortionY(float progress){
            return (-nsin(PI * progress * uFreq.b + uTime) * uAmp.b + -pow(nsin(PI * progress * uFreq.a + uTime / (uFreq.b / uFreq.a)), 5.) * uAmp.a);
          }
          vec3 getDistortion(float progress){
            return vec3(getDistortionX(progress) - getDistortionX(0.0125), getDistortionY(progress) - getDistortionY(0.0125), 0.);
          }
        `,
        getJS: (progress, time) => {
          const uFreq = turbulentUniforms.uFreq.value
          const uAmp  = turbulentUniforms.uAmp.value
          const getX = p => Math.cos(Math.PI * p * uFreq.x + time) * uAmp.x + Math.pow(Math.cos(Math.PI * p * uFreq.y + time * (uFreq.y / uFreq.x)), 2) * uAmp.y
          const getY = p => -nsin(Math.PI * p * uFreq.z + time) * uAmp.z - Math.pow(nsin(Math.PI * p * uFreq.w + time / (uFreq.z / uFreq.w)), 5) * uAmp.w
          let d = new THREE.Vector3(getX(progress) - getX(progress + 0.007), getY(progress) - getY(progress + 0.007), 0)
          return d.multiply(new THREE.Vector3(-2, -5, 0)).add(new THREE.Vector3(0, 0, -10))
        }
      }
    }

    const carLightsFragment = `
      #define USE_FOG;
      ${THREE.ShaderChunk['fog_pars_fragment']}
      varying vec3 vColor; varying vec2 vUv; uniform vec2 uFade;
      void main() {
        vec3 color = vec3(vColor);
        float alpha = smoothstep(uFade.x, uFade.y, vUv.x);
        gl_FragColor = vec4(color, alpha);
        if (gl_FragColor.a < 0.0001) discard;
        ${THREE.ShaderChunk['fog_fragment']}
      }
    `
    const carLightsVertex = `
      #define USE_FOG;
      ${THREE.ShaderChunk['fog_pars_vertex']}
      attribute vec3 aOffset; attribute vec3 aMetrics; attribute vec3 aColor;
      uniform float uTravelLength; uniform float uTime;
      varying vec2 vUv; varying vec3 vColor;
      #include <getDistortion_vertex>
      void main() {
        vec3 transformed = position.xyz;
        float radius = aMetrics.r; float myLength = aMetrics.g; float speed = aMetrics.b;
        transformed.xy *= radius; transformed.z *= myLength;
        transformed.z += myLength - mod(uTime * speed + aOffset.z, uTravelLength);
        transformed.xy += aOffset.xy;
        float progress = abs(transformed.z / uTravelLength);
        transformed.xyz += getDistortion(progress);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
        gl_Position = projectionMatrix * mvPosition;
        vUv = uv; vColor = aColor;
        ${THREE.ShaderChunk['fog_vertex']}
      }
    `
    const sideSticksVertex = `
      #define USE_FOG;
      ${THREE.ShaderChunk['fog_pars_vertex']}
      attribute float aOffset; attribute vec3 aColor; attribute vec2 aMetrics;
      uniform float uTravelLength; uniform float uTime;
      varying vec3 vColor;
      mat4 rotationY(in float angle){ return mat4(cos(angle),0,sin(angle),0, 0,1,0,0, -sin(angle),0,cos(angle),0, 0,0,0,1); }
      #include <getDistortion_vertex>
      void main(){
        vec3 transformed = position.xyz;
        float width = aMetrics.x; float height = aMetrics.y;
        transformed.xy *= vec2(width, height);
        float time = mod(uTime * 60. * 2. + aOffset, uTravelLength);
        transformed = (rotationY(3.14/2.) * vec4(transformed,1.)).xyz;
        transformed.z += -uTravelLength + time;
        float progress = abs(transformed.z / uTravelLength);
        transformed.xyz += getDistortion(progress);
        transformed.y += height / 2.; transformed.x += -width / 2.;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
        gl_Position = projectionMatrix * mvPosition;
        vColor = aColor;
        ${THREE.ShaderChunk['fog_vertex']}
      }
    `
    const sideSticksFragment = `
      #define USE_FOG;
      ${THREE.ShaderChunk['fog_pars_fragment']}
      varying vec3 vColor;
      void main(){ gl_FragColor = vec4(vColor,1.); ${THREE.ShaderChunk['fog_fragment']} }
    `
    const roadVertex = `
      #define USE_FOG;
      uniform float uTime;
      ${THREE.ShaderChunk['fog_pars_vertex']}
      uniform float uTravelLength; varying vec2 vUv;
      #include <getDistortion_vertex>
      void main() {
        vec3 transformed = position.xyz;
        vec3 distortion = getDistortion((transformed.y + uTravelLength / 2.) / uTravelLength);
        transformed.x += distortion.x; transformed.z += distortion.y; transformed.y += -1. * distortion.z;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
        gl_Position = projectionMatrix * mvPosition; vUv = uv;
        ${THREE.ShaderChunk['fog_vertex']}
      }
    `
    const roadBaseFragment = `
      #define USE_FOG;
      varying vec2 vUv; uniform vec3 uColor; uniform float uTime;
      #include <roadMarkings_vars>
      ${THREE.ShaderChunk['fog_pars_fragment']}
      void main() {
        vec2 uv = vUv; vec3 color = vec3(uColor);
        #include <roadMarkings_fragment>
        gl_FragColor = vec4(color, 1.);
        ${THREE.ShaderChunk['fog_fragment']}
      }
    `
    const islandFragment = roadBaseFragment.replace('#include <roadMarkings_fragment>','').replace('#include <roadMarkings_vars>','')
    const roadMarkings_vars = `
      uniform float uLanes; uniform vec3 uBrokenLinesColor; uniform vec3 uShoulderLinesColor;
      uniform float uShoulderLinesWidthPercentage; uniform float uBrokenLinesLengthPercentage; uniform float uBrokenLinesWidthPercentage;
    `
    const roadMarkings_fragment = `
      uv.y = mod(uv.y + uTime * 0.05, 1.);
      float laneWidth = 1.0 / uLanes;
      float brokenLineWidth = laneWidth * uBrokenLinesWidthPercentage;
      float laneEmptySpace = 1. - uBrokenLinesLengthPercentage;
      float brokenLines = step(1.0 - brokenLineWidth, fract(uv.x * 2.0)) * step(laneEmptySpace, fract(uv.y * 10.0));
      float sideLines = step(1.0 - brokenLineWidth, fract((uv.x - laneWidth * (uLanes - 1.0)) * 2.0)) + step(brokenLineWidth, uv.x);
      brokenLines = mix(brokenLines, sideLines, uv.x);
    `
    const roadFragment = roadBaseFragment.replace('#include <roadMarkings_fragment>', roadMarkings_fragment).replace('#include <roadMarkings_vars>', roadMarkings_vars)

    function resizeRendererToDisplaySize(renderer, setSize) {
      const canvas = renderer.domElement
      const width = canvas.clientWidth, height = canvas.clientHeight
      const needResize = canvas.width !== width || canvas.height !== height
      if (needResize) setSize(width, height, false)
      return needResize
    }

    class App {
      constructor(container, opts) {
        this.options = { ...opts, distortion: distortions[opts.distortion] }
        this.container = container
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
        this.renderer.setSize(container.offsetWidth, container.offsetHeight, false)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.composer = new EffectComposer(this.renderer)
        container.append(this.renderer.domElement)
        this.camera = new THREE.PerspectiveCamera(opts.fov, container.offsetWidth / container.offsetHeight, 0.1, 10000)
        this.camera.position.z = -5; this.camera.position.y = 8; this.camera.position.x = 0
        this.scene = new THREE.Scene()
        this.scene.background = null
        const fog = new THREE.Fog(opts.colors.background, opts.length * 0.2, opts.length * 500)
        this.scene.fog = fog
        this.fogUniforms = { fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far } }
        this.clock = new THREE.Clock()
        this.disposed = false
        this.road = new Road(this, this.options)
        this.leftCarLights  = new CarLights(this, this.options, this.options.colors.leftCars,  this.options.movingAwaySpeed,   new THREE.Vector2(0, 1 - this.options.carLightsFade))
        this.rightCarLights = new CarLights(this, this.options, this.options.colors.rightCars, this.options.movingCloserSpeed, new THREE.Vector2(1, 0 + this.options.carLightsFade))
        this.leftSticks = new LightsSticks(this, this.options)
        this.fovTarget = opts.fov; this.speedUpTarget = 0; this.speedUp = 0; this.timeOffset = 0
        this.tick = this.tick.bind(this); this.init = this.init.bind(this); this.setSize = this.setSize.bind(this)
        this._onResize = this.onWindowResize.bind(this)
        window.addEventListener('resize', this._onResize)
      }
      onWindowResize() {
        const w = this.container.offsetWidth, h = this.container.offsetHeight
        this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h)
      }
      initPasses() {
        this.renderPass = new RenderPass(this.scene, this.camera)
        this.bloomPass = new EffectPass(this.camera, new BloomEffect({ luminanceThreshold: 0.2, luminanceSmoothing: 0, resolutionScale: 1 }))
        const smaaPass = new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM, searchImage: SMAAEffect.searchImageDataURL, areaImage: SMAAEffect.areaImageDataURL }))
        this.renderPass.renderToScreen = false; this.bloomPass.renderToScreen = false; smaaPass.renderToScreen = true
        this.composer.addPass(this.renderPass); this.composer.addPass(this.bloomPass); this.composer.addPass(smaaPass)
      }
      loadAssets() { return Promise.resolve() }
      init() {
        this.initPasses(); const o = this.options
        this.road.init(); this.leftCarLights.init()
        this.leftCarLights.mesh.position.setX(-o.roadWidth / 2 - o.islandWidth / 2)
        this.rightCarLights.init(); this.rightCarLights.mesh.position.setX(o.roadWidth / 2 + o.islandWidth / 2)
        this.leftSticks.init(); this.leftSticks.mesh.position.setX(-(o.roadWidth + o.islandWidth / 2))
        this.tick()
      }
      update(delta) {
        const lerpP = Math.exp(-(-60 * Math.log2(1 - 0.1)) * delta)
        this.speedUp += lerp(this.speedUp, this.speedUpTarget, lerpP, 0.00001)
        this.timeOffset += this.speedUp * delta
        const time = this.clock.elapsedTime + this.timeOffset
        this.rightCarLights.update(time); this.leftCarLights.update(time); this.leftSticks.update(time); this.road.update(time)
        let updateCamera = false
        const fovChange = lerp(this.camera.fov, this.fovTarget, lerpP)
        if (fovChange !== 0) { this.camera.fov += fovChange * delta * 6; updateCamera = true }
        if (this.options.distortion.getJS) {
          const d = this.options.distortion.getJS(0.025, time)
          this.camera.lookAt(new THREE.Vector3(this.camera.position.x + d.x, this.camera.position.y + d.y, this.camera.position.z + d.z))
          updateCamera = true
        }
        if (updateCamera) this.camera.updateProjectionMatrix()
      }
      render(delta) { this.composer.render(delta) }
      dispose() {
        this.disposed = true
        if (this.renderer) this.renderer.dispose()
        if (this.composer) this.composer.dispose()
        if (this.scene) this.scene.clear()
        window.removeEventListener('resize', this._onResize)
      }
      setSize(w, h, s) { this.composer.setSize(w, h, s) }
      tick() {
        if (this.disposed) return
        if (resizeRendererToDisplaySize(this.renderer, this.setSize)) {
          const canvas = this.renderer.domElement
          this.camera.aspect = canvas.clientWidth / canvas.clientHeight
          this.camera.updateProjectionMatrix()
        }
        const delta = this.clock.getDelta()
        this.render(delta); this.update(delta)
        requestAnimationFrame(this.tick)
      }
    }

    class CarLights {
      constructor(webgl, options, colors, speed, fade) { this.webgl = webgl; this.options = options; this.colors = colors; this.speed = speed; this.fade = fade }
      init() {
        const o = this.options
        let curve = new THREE.LineCurve3(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1))
        let geometry = new THREE.TubeGeometry(curve, 40, 1, 8, false)
        let instanced = new THREE.InstancedBufferGeometry().copy(geometry)
        instanced.instanceCount = o.lightPairsPerRoadWay * 2
        const laneWidth = o.roadWidth / o.lanesPerRoad
        const aOffset = [], aMetrics = [], aColor = []
        let colors = Array.isArray(this.colors) ? this.colors.map(c => new THREE.Color(c)) : new THREE.Color(this.colors)
        for (let i = 0; i < o.lightPairsPerRoadWay; i++) {
          const radius = random(o.carLightsRadius), length = random(o.carLightsLength), speed = random(this.speed)
          const carLane = i % o.lanesPerRoad
          let laneX = carLane * laneWidth - o.roadWidth / 2 + laneWidth / 2
          const carWidth = random(o.carWidthPercentage) * laneWidth
          laneX += random(o.carShiftX) * laneWidth
          const offsetY = random(o.carFloorSeparation) + radius * 1.3
          const offsetZ = -random(o.length)
          aOffset.push(laneX - carWidth/2, offsetY, offsetZ, laneX + carWidth/2, offsetY, offsetZ)
          aMetrics.push(radius, length, speed, radius, length, speed)
          const color = pickRandom(colors)
          aColor.push(color.r, color.g, color.b, color.r, color.g, color.b)
        }
        instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 3, false))
        instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 3, false))
        instanced.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false))
        const material = new THREE.ShaderMaterial({
          fragmentShader: carLightsFragment, vertexShader: carLightsVertex, transparent: true,
          uniforms: Object.assign({ uTime: { value: 0 }, uTravelLength: { value: o.length }, uFade: { value: this.fade } }, this.webgl.fogUniforms, o.distortion.uniforms)
        })
        material.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <getDistortion_vertex>', o.distortion.getDistortion) }
        const mesh = new THREE.Mesh(instanced, material)
        mesh.frustumCulled = false; this.webgl.scene.add(mesh); this.mesh = mesh
      }
      update(time) { this.mesh.material.uniforms.uTime.value = time }
    }

    class LightsSticks {
      constructor(webgl, options) { this.webgl = webgl; this.options = options }
      init() {
        const o = this.options
        const geometry = new THREE.PlaneGeometry(1, 1)
        let instanced = new THREE.InstancedBufferGeometry().copy(geometry)
        instanced.instanceCount = o.totalSideLightSticks
        const stickoffset = o.length / (o.totalSideLightSticks - 1)
        const aOffset = [], aColor = [], aMetrics = []
        let colors = Array.isArray(o.colors.sticks) ? o.colors.sticks.map(c => new THREE.Color(c)) : new THREE.Color(o.colors.sticks)
        for (let i = 0; i < o.totalSideLightSticks; i++) {
          aOffset.push((i - 1) * stickoffset * 2 + stickoffset * Math.random())
          const color = pickRandom(colors); aColor.push(color.r, color.g, color.b)
          aMetrics.push(random(o.lightStickWidth), random(o.lightStickHeight))
        }
        instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 1, false))
        instanced.setAttribute('aColor',  new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false))
        instanced.setAttribute('aMetrics',new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 2, false))
        const material = new THREE.ShaderMaterial({
          fragmentShader: sideSticksFragment, vertexShader: sideSticksVertex, side: THREE.DoubleSide,
          uniforms: Object.assign({ uTravelLength: { value: o.length }, uTime: { value: 0 } }, this.webgl.fogUniforms, o.distortion.uniforms)
        })
        material.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <getDistortion_vertex>', o.distortion.getDistortion) }
        const mesh = new THREE.Mesh(instanced, material)
        mesh.frustumCulled = false; this.webgl.scene.add(mesh); this.mesh = mesh
      }
      update(time) { this.mesh.material.uniforms.uTime.value = time }
    }

    class Road {
      constructor(webgl, options) { this.webgl = webgl; this.options = options; this.uTime = { value: 0 } }
      createPlane(side, width, isRoad) {
        const o = this.options
        const geometry = new THREE.PlaneGeometry(isRoad ? o.roadWidth : o.islandWidth, o.length, 20, 100)
        let uniforms = { uTravelLength: { value: o.length }, uColor: { value: new THREE.Color(isRoad ? o.colors.roadColor : o.colors.islandColor) }, uTime: this.uTime }
        if (isRoad) uniforms = Object.assign(uniforms, { uLanes: { value: o.lanesPerRoad }, uBrokenLinesColor: { value: new THREE.Color(o.colors.brokenLines) }, uShoulderLinesColor: { value: new THREE.Color(o.colors.shoulderLines) }, uShoulderLinesWidthPercentage: { value: o.shoulderLinesWidthPercentage }, uBrokenLinesLengthPercentage: { value: o.brokenLinesLengthPercentage }, uBrokenLinesWidthPercentage: { value: o.brokenLinesWidthPercentage } })
        const material = new THREE.ShaderMaterial({ fragmentShader: isRoad ? roadFragment : islandFragment, vertexShader: roadVertex, side: THREE.DoubleSide, uniforms: Object.assign(uniforms, this.webgl.fogUniforms, o.distortion.uniforms) })
        material.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <getDistortion_vertex>', o.distortion.getDistortion) }
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2; mesh.position.z = -o.length / 2
        mesh.position.x += (this.options.islandWidth / 2 + o.roadWidth / 2) * side
        this.webgl.scene.add(mesh); return mesh
      }
      init() { this.leftRoadWay = this.createPlane(-1, this.options.roadWidth, true); this.rightRoadWay = this.createPlane(1, this.options.roadWidth, true); this.island = this.createPlane(0, this.options.islandWidth, false) }
      update(time) { this.uTime.value = time }
    }

    const myApp = new App(container, options)
    appRef.current = myApp
    myApp.loadAssets().then(myApp.init)

    return () => { if (appRef.current) appRef.current.dispose() }
  }, [])

  return (
    <div ref={containerRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}/>
  )
}

// ── Page data ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon:'🔒', title:'Гарантия сделки', desc:'Деньги замораживаются до подтверждения получения товара' },
  { icon:'⚡', title:'Быстрая оплата', desc:'CryptoCloud, RuKassa (карта РФ, СБП) и CryptoBot' },
  { icon:'🤝', title:'Арбитраж споров', desc:'Команда администраторов решит любой спор за 24 часа' },
  { icon:'🟡', title:'Тысячи товаров', desc:'Аккаунты, скины, валюта, ключи и многое другое' },
]

const CATEGORIES = [
  { icon:'🎮', name:'Аккаунты', slug:'game-accounts', count:'1.2k+' },
  { icon:'💰', name:'Валюта', slug:'game-currency', count:'800+' },
  { icon:'⚔️', name:'Предметы', slug:'items', count:'500+' },
  { icon:'🎨', name:'Скины', slug:'skins', count:'2.1k+' },
  { icon:'🔑', name:'Ключи', slug:'keys', count:'300+' },
  { icon:'⭐', name:'Подписки', slug:'subscriptions', count:'150+' },
  { icon:'🚀', name:'Буст', slug:'boost', count:'200+' },
  { icon:'📦', name:'Прочее', slug:'other', count:'400+' },
]

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const { user } = useStore()

  useEffect(() => {
    api.get('/products?limit=8&sort=newest')
      .then(r => setProducts(r.data.products || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* ── Hero with Hyperspeed ─────────────────────────────────────────── */}
      <section style={{ position:'relative', height:'100vh', minHeight:600, maxHeight:900, overflow:'hidden' }}>

        {/* Hyperspeed background */}
        <HyperspeedCanvas />

        {/* Dark overlay gradient */}
        <div style={{
          position:'absolute', inset:0, zIndex:1,
          background:'linear-gradient(to bottom, rgba(13,13,20,0.3) 0%, rgba(13,13,20,0.5) 60%, rgba(13,13,20,1) 100%)'
        }}/>

        {/* Content */}
        <div style={{
          position:'relative', zIndex:2,
          height:'100%', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          textAlign:'center', padding:'20px',
        }}>
          <div className="badge badge-yellow anim-in" style={{ marginBottom:20, display:'inline-flex' }}>
            🟡 Маркетплейс цифровых товаров
          </div>

          <h1 className="anim-up" style={{
            fontFamily:'var(--font-h)', fontWeight:800,
            fontSize:'clamp(36px, 6vw, 80px)',
            lineHeight:1.05, letterSpacing:'-0.03em',
            marginBottom:20, textShadow:'0 4px 40px rgba(0,0,0,0.8)',
            animationDelay:'0.1s',
            display:'flex', flexDirection:'column', alignItems:'center', gap:12
          }}>
            <span>Покупай и продавай</span>
            <RotatingText
              texts={['безопасно', 'быстро', 'выгодно', 'с гарантией']}
              mainClassName="text-rotate-highlight"
              staggerFrom="last"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-120%' }}
              staggerDuration={0.025}
              splitLevelClassName="overflow-hidden"
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              rotationInterval={2500}
            />
          </h1>

          <p className="anim-up" style={{
            color:'rgba(255,255,255,0.8)', fontSize:18, lineHeight:1.6,
            maxWidth:520, margin:'0 auto 36px',
            textShadow:'0 2px 20px rgba(0,0,0,0.9)',
            animationDelay:'0.2s'
          }}>
            Тысячи цифровых товаров с защитой сделки. Деньги переводятся продавцу только после вашего подтверждения.
          </p>

          <div className="anim-up" style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', animationDelay:'0.3s' }}>
            <Link to="/catalog" className="btn btn-primary" style={{ padding:'14px 32px', fontSize:16, boxShadow:'0 8px 32px rgba(245,200,66,0.4)' }}>
              Смотреть каталог →
            </Link>
            {!user && (
              <Link to="/auth?mode=register" className="btn btn-secondary" style={{ padding:'14px 32px', fontSize:16, backdropFilter:'blur(10px)' }}>
                Зарегистрироваться
              </Link>
            )}
          </div>

          <div className="anim-up" style={{ display:'flex', gap:32, justifyContent:'center', marginTop:48, flexWrap:'wrap', animationDelay:'0.4s' }}>
            {[['5000+','Товаров'],['12k+','Пользователей'],['98%','Успешных сделок'],['24/7','Поддержка']].map(([n,l]) => (
              <div key={l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, color:'var(--accent)', textShadow:'0 0 20px rgba(245,200,66,0.4)' }}>{n}</div>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:13 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:120, background:'linear-gradient(transparent, var(--bg))', zIndex:3, pointerEvents:'none' }}/>
      </section>

      {/* ── Categories ──────────────────────────────────────────────────── */}
      <section style={{ padding:'60px 20px', maxWidth:1200, margin:'0 auto' }}>
        <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, marginBottom:24 }}>Категории</h2>
        <div className="grid-4">
          {CATEGORIES.map(cat => (
            <Link key={cat.slug} to={`/catalog?category=${cat.slug}`} style={{ textDecoration:'none' }}>
              <div style={{
                background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r2)',
                padding:'20px', display:'flex', alignItems:'center', gap:14, transition:'all 0.2s', cursor:'pointer'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(245,200,66,0.3)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none' }}>
                <div style={{ fontSize:28, width:44, height:44, borderRadius:12, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{cat.icon}</div>
                <div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14 }}>{cat.name}</div>
                  <div style={{ color:'var(--t3)', fontSize:12 }}>{cat.count} товаров</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── New products ─────────────────────────────────────────────────── */}
      <section style={{ padding:'0 20px 60px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28 }}>Новые товары</h2>
          <Link to="/catalog" className="btn btn-ghost btn-sm">Все товары →</Link>
        </div>
        {loading ? (
          <div className="grid-4">{Array(8).fill(0).map((_,i) => <div key={i} className="skel" style={{ height:280 }}/>)}</div>
        ) : products.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Товаров пока нет</div>
            <p style={{ color:'var(--t4)', marginTop:8 }}>Будьте первым продавцом!</p>
            <Link to="/sell" className="btn btn-primary" style={{ marginTop:20, display:'inline-flex' }}>Разместить товар</Link>
          </div>
        ) : (
          <div className="grid-4">
            {products.map((p,i) => <ProductCard key={p._id||p.id} product={p} style={{ animationDelay:`${i*50}ms` }}/>)}
          </div>
        )}
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section style={{ padding:'60px 20px', background:'var(--bg2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, textAlign:'center', marginBottom:40 }}>Почему выбирают нас</h2>
          <div className="grid-4">
            {FEATURES.map(f => (
              <div key={f.title} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'28px 24px', textAlign:'center' }}>
                <div style={{ fontSize:36, marginBottom:14 }}>{f.icon}</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:16, marginBottom:8 }}>{f.title}</div>
                <div style={{ color:'var(--t3)', fontSize:13, lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      {!user && (
        <section style={{ padding:'80px 20px', textAlign:'center', maxWidth:600, margin:'0 auto' }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:36, marginBottom:16 }}>Готов начать?</h2>
          <p style={{ color:'var(--t2)', marginBottom:28, lineHeight:1.7 }}>Зарегистрируйся за 30 секунд через Telegram бот и начни торговать прямо сейчас.</p>
          <Link to="/auth?mode=register" className="btn btn-primary" style={{ padding:'16px 40px', fontSize:16 }}>Создать аккаунт →</Link>
        </section>
      )}
    </div>
  )
}
