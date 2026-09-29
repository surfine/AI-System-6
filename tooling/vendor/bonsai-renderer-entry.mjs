// Bonsai City voxel renderer vendor entry. This is the minimal three.js
// subset the instanced voxel scene uses; esbuild bundles it into a lazy ESM
// file that the renderer loads with a dynamic import, exactly like the CMF
// Studio renderer vendor. The MIT-clean Bonsai simulation core never imports
// this file.

export {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  CanvasTexture,
  Color,
  DirectionalLight,
  PCFShadowMap,
  Group,
  HalfFloatType,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  NoColorSpace,
  NearestMipmapLinearFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
