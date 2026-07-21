'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Float } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);

    float angle = atan(n.z, n.x);
    float hue = fract(angle / 6.28318 + uTime * 0.04);
    vec3 rainbow = hsl2rgb(vec3(hue, 0.85, 0.6));

    vec3 base = vec3(0.02, 0.03, 0.07);
    vec3 color = mix(base, rainbow, fresnel);

    gl_FragColor = vec4(color, 1.0);
  }
`

function Disc({
  desktopX,
  xFraction,
  y,
  z = 0,
  speed,
  scale = 1,
}: {
  desktopX: number // the original fixed world-unit x position, used as a ceiling on large screens
  xFraction: number // -1 to 1, used to shrink position proportionally on small screens
  y: number
  z?: number
  speed: number
  scale?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const rimUniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const viewport = useThree((state) => state.viewport)

  const proportionalX = (viewport.width / 2) * xFraction
  const sign = Math.sign(desktopX)
  const x = sign * Math.min(Math.abs(proportionalX), Math.abs(desktopX))

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime
    meshRef.current.rotation.x = Math.PI / 2.4 + Math.sin(t * speed) * 0.2
    meshRef.current.rotation.z = t * speed * 0.5
    rimUniforms.uTime.value = t
  })

  const materials = useMemo(() => {
    const rim = new THREE.ShaderMaterial({
      uniforms: rimUniforms,
      vertexShader,
      fragmentShader,
    })
    const face = new THREE.MeshPhysicalMaterial({
      color: '#0a1226',
      metalness: 1,
      roughness: 0.15,
      iridescence: 1,
      iridescenceIOR: 2.333,
      iridescenceThicknessRange: [200, 800],
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.4,
    })
    return [rim, face, face]
  }, [rimUniforms])

  return (
    <Float speed={speed * 2} rotationIntensity={0.3} floatIntensity={1}>
      <mesh ref={meshRef} position={[x, y, z]} scale={scale} material={materials}>
        <cylinderGeometry args={[1.4, 1.4, 0.18, 64]} />
      </mesh>
    </Float>
  )
}

export function CtaDiscs() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.08} />
        <pointLight position={[6, 3, 4]} intensity={12} color="#a855f7" />
        <pointLight position={[-6, -1, 3]} intensity={10} color="#22d3ee" />
        <pointLight position={[2, -4, 5]} intensity={8} color="#f472b6" />
        <pointLight position={[-3, 4, 2]} intensity={6} color="#facc15" />
        <Disc desktopX={-3.6} xFraction={-0.65} y={-0.6} z={0} speed={0.5} />
        <Disc desktopX={3.8} xFraction={0.68} y={1.2} z={-1} speed={0.35} scale={0.7} />
        <Environment preset="night" />
      </Canvas>
    </div>
  )
}