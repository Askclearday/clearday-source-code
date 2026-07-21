'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// Bars now match the floor exactly: same fill color as the platform,
// with the same purple used on the platform's grid lines glowing along
// every edge of each bar instead of varying per-bar solid colors.
const BAR_FILL = '#1e1b3a'
const EDGE_GLOW = '#6d28d9'

type BarSpec = {
  x: number
  z: number
  height: number
  color: string
  phase: number
}

function useBars(): BarSpec[] {
  return useMemo(() => {
    const specs: BarSpec[] = []
    const heights = [
      [1.2, 2.6, 1.8, 3.4],
      [2.0, 3.8, 2.8, 1.5],
      [1.6, 2.2, 4.2, 2.4],
      [3.0, 1.4, 2.0, 3.6],
    ]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        specs.push({
          x: (i - 1.5) * 1.1,
          z: (j - 1.5) * 1.1,
          height: heights[i][j],
          color: BAR_FILL,
          phase: (i * 4 + j) * 0.4,
        })
      }
    }
    return specs
  }, [])
}

function Bar({ spec }: { spec: BarSpec }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, spec.height, 0.7)),
    [spec.height],
  )

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime
    const scale = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.8 + spec.phase))
    meshRef.current.scale.y = scale
    meshRef.current.position.y = (spec.height * scale) / 2
  })

  return (
    <mesh ref={meshRef} position={[spec.x, spec.height / 2, spec.z]}>
      <boxGeometry args={[0.7, spec.height, 0.7]} />
      <meshPhysicalMaterial
        color={spec.color}
        emissive={spec.color}
        emissiveIntensity={0.15}
        metalness={0.85}
        roughness={0.25}
        clearcoat={1}
        clearcoatRoughness={0.15}
      />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={EDGE_GLOW} toneMapped={false} />
      </lineSegments>
    </mesh>
  )
}

function Platform() {
  return (
    <group>
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[6, 0.3, 6]} />
        <meshPhysicalMaterial
          color="#1e1b3a"
          metalness={0.8}
          roughness={0.3}
          clearcoat={1}
        />
      </mesh>
      <gridHelper
        args={[6, 12, '#6d28d9', '#312e5e']}
        position={[0, 0.01, 0]}
      />
    </group>
  )
}

function Scene() {
  const groupRef = useRef<THREE.Group>(null)
  const bars = useBars()

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.1
  })

  return (
    <group ref={groupRef}>
      <Platform />
      {bars.map((spec, i) => (
        <Bar key={i} spec={spec} />
      ))}
    </group>
  )
}

export function DataBars() {
  return (
    <div className="h-full w-full" aria-label="Interactive 3D data visualization" role="img">
      <Canvas
        camera={{ position: [8.5, 6, 8.5], fov: 48 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[8, 10, 8]} intensity={80} color="#c084fc" />
        <pointLight position={[-8, 6, -4]} intensity={40} color="#22d3ee" />
        <Scene />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          target={[0, 1.2, 0]}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.2}
        />
        <Environment preset="night" />
      </Canvas>
    </div>
  )
}