import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type AvatarSceneProps = {
  isSpeaking: boolean;
  isThinking: boolean;
};

type AvatarParts = {
  group: any;
  headPivot: any;
  mouth: any;
  leftArm: any;
  rightArm: any;
};

export function AvatarScene({ isSpeaking, isThinking }: AvatarSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSpeakingRef = useRef(isSpeaking);
  const stateRef = useRef({
    avatar: null as AvatarParts | null,
    speakingAmplitude: 0,
    pendingAnimation: 0,
  });

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0f172a, 10, 24);

    const camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 1.85, 6.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.3, 0);
    controls.minDistance = 4.6;
    controls.maxDistance = 10.5;
    controls.maxPolarAngle = Math.PI / 1.9;

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6, 64),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.92,
        metalness: 0.1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.15;
    scene.add(ground);

    const avatar = createAvatar();
    stateRef.current.avatar = avatar;
    scene.add(avatar.group);

    const clock = new THREE.Clock();

    const onResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", onResize);

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      animateAvatar(elapsed, delta, stateRef.current, isSpeakingRef.current);
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    stateRef.current.pendingAnimation = isThinking ? 1 : 0.3;
  }, [isThinking]);

  return <div ref={containerRef} className="scene-container" />;
}

function createAvatar(): AvatarParts {
  const group = new THREE.Group();
  group.position.y = -0.15;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.62,
    metalness: 0.18,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8d2c1,
    roughness: 0.96,
  });
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.7,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.58,
    metalness: 0.2,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.6, 8, 16), bodyMaterial);
  torso.position.y = 0.4;
  group.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.85, 0);
  group.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 32, 32), skinMaterial);
  headPivot.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.61, 32, 32), hairMaterial);
  hair.scale.set(1.02, 0.92, 1.03);
  hair.position.y = 0.08;
  headPivot.add(hair);

  const face = new THREE.Group();
  face.position.z = 0.54;
  headPivot.add(face);

  const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
  const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial);
  leftEye.position.set(-0.16, 0.08, 0.02);
  face.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial);
  rightEye.position.set(0.16, 0.08, 0.02);
  face.add(rightEye);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.08, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      roughness: 0.85,
    }),
  );
  mouth.position.set(0, -0.18, 0.03);
  face.add(mouth);

  const shoulderGeometry = new THREE.CapsuleGeometry(0.14, 0.8, 8, 12);
  const leftArm = new THREE.Mesh(shoulderGeometry, bodyMaterial);
  leftArm.position.set(-0.9, 0.72, 0);
  leftArm.rotation.z = -0.28;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(shoulderGeometry, bodyMaterial);
  rightArm.position.set(0.9, 0.72, 0);
  rightArm.rotation.z = 0.28;
  group.add(rightArm);

  const legGeometry = new THREE.CapsuleGeometry(0.18, 1.2, 8, 12);
  const leftLeg = new THREE.Mesh(legGeometry, darkMaterial);
  leftLeg.position.set(-0.32, -0.95, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, darkMaterial);
  rightLeg.position.set(0.32, -0.95, 0);
  group.add(rightLeg);

  return {
    group,
    headPivot,
    mouth,
    leftArm,
    rightArm,
  };
}

function animateAvatar(
  elapsed: number,
  delta: number,
  state: {
    avatar: AvatarParts | null;
    speakingAmplitude: number;
    pendingAnimation: number;
  },
  isSpeaking: boolean,
) {
  if (!state.avatar) return;

  state.pendingAnimation = THREE.MathUtils.lerp(state.pendingAnimation, 0, delta * 2.5);
  state.avatar.group.position.y = -0.15 + Math.sin(elapsed * 1.4) * 0.04;
  state.avatar.group.rotation.y = Math.sin(elapsed * 0.5) * 0.1;

  state.avatar.leftArm.rotation.z =
    -0.28 + Math.sin(elapsed * 1.1) * 0.05 + state.pendingAnimation * 0.08;
  state.avatar.rightArm.rotation.z =
    0.28 - Math.sin(elapsed * 1.1) * 0.05 - state.pendingAnimation * 0.08;

  state.avatar.headPivot.rotation.x = Math.sin(elapsed * 0.9) * 0.04;
  state.avatar.headPivot.rotation.y =
    Math.sin(elapsed * 0.6) * 0.18 + state.pendingAnimation * 0.08;

  state.speakingAmplitude = isSpeaking
    ? 0.15 + Math.abs(Math.sin(elapsed * 18)) * 0.26
    : THREE.MathUtils.lerp(state.speakingAmplitude, 0.02, delta * 8);

  state.avatar.mouth.scale.y = 0.5 + state.speakingAmplitude;
  state.avatar.mouth.position.y = -0.18 - state.speakingAmplitude * 0.015;
}
