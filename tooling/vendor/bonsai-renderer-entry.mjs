// Bonsai City voxel renderer vendor entry. This is the minimal three.js
// subset the instanced voxel scene uses; esbuild bundles it into a lazy ESM
// file that the renderer loads with a dynamic import, exactly like the CMF
// Studio renderer vendor. The MIT-clean Bonsai simulation core never imports
// this file.

export {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  PCFShadowMap,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  NearestMipmapLinearFilter,
  OrthographicCamera,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
