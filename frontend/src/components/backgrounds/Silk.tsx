/* eslint-disable react/no-unknown-property */
/**
 * Silk — React Bits Background Studio
 * https://reactbits.dev/tools/background-studio
 *
 * Tuned for HATCH: canvas #120F17, silk #7B7481, speed 5, noise 1.5.
 * Optimized: visibility pause, reduced-motion, capped DPR, demand frameloop.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Color, type Mesh, type ShaderMaterial } from "three";

export type SilkProps = {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  className?: string;
};

function hexToNormalizedRGB(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2 r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd = noise(gl_FragCoord.xy);
  vec2 uv = rotateUvs(vUv * uScale, uRotation);
  vec2 tex = uv * uScale;
  float tOffset = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
    0.4 * sin(5.0 * (tex.x + tex.y +
      cos(3.0 * tex.x + 5.0 * tex.y) +
      0.02 * tOffset) +
      sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

type UniformBag = {
  uSpeed: { value: number };
  uScale: { value: number };
  uNoiseIntensity: { value: number };
  uColor: { value: Color };
  uRotation: { value: number };
  uTime: { value: number };
};

const SilkPlane = forwardRef<Mesh, { uniforms: UniformBag; playing: boolean }>(
  function SilkPlane({ uniforms, playing }, ref) {
    const { viewport, invalidate } = useThree();
    const meshRef = ref as MutableRefObject<Mesh | null>;

    useLayoutEffect(() => {
      if (meshRef.current) {
        meshRef.current.scale.set(viewport.width, viewport.height, 1);
      }
    }, [meshRef, viewport.width, viewport.height]);

    useFrame((_, delta) => {
      if (!meshRef.current) return;
      const material = meshRef.current.material as ShaderMaterial;
      if (playing) {
        material.uniforms.uTime.value += 0.1 * delta;
        invalidate();
      }
    });

    useLayoutEffect(() => {
      invalidate();
    }, [invalidate, playing]);

    return (
      <mesh ref={meshRef}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>
    );
  },
);
SilkPlane.displayName = "SilkPlane";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useInView(ref: MutableRefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { rootMargin: "80px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

export default function Silk({
  speed = 5,
  scale = 1,
  color = "#7B7481",
  noiseIntensity = 1.5,
  rotation = 0,
  className,
}: SilkProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<Mesh>(null);
  const reducedMotion = usePrefersReducedMotion();
  const inView = useInView(rootRef);
  const playing = inView && !reducedMotion;

  const uniforms = useMemo<UniformBag>(
    () => ({
      uSpeed: { value: speed },
      uScale: { value: scale },
      uNoiseIntensity: { value: noiseIntensity },
      uColor: { value: new Color(...hexToNormalizedRGB(color)) },
      uRotation: { value: rotation },
      uTime: { value: 0 },
    }),
    [speed, scale, noiseIntensity, color, rotation],
  );

  // Keep uniforms in sync without remounting the canvas.
  useEffect(() => {
    uniforms.uSpeed.value = speed;
    uniforms.uScale.value = scale;
    uniforms.uNoiseIntensity.value = noiseIntensity;
    uniforms.uRotation.value = rotation;
    uniforms.uColor.value.setRGB(...hexToNormalizedRGB(color));
  }, [uniforms, speed, scale, noiseIntensity, rotation, color]);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ backgroundColor: "#120F17" }}
      aria-hidden
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop={playing ? "always" : "demand"}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
          stencil: false,
          depth: false,
        }}
        camera={{ position: [0, 0, 1], fov: 75, near: 0.1, far: 10 }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <color attach="background" args={["#120F17"]} />
        <SilkPlane ref={meshRef} uniforms={uniforms} playing={playing} />
      </Canvas>
    </div>
  );
}
