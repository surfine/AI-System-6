export {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
export { OrbitControls } from "three/addons/controls/OrbitControls.js";
export { USDLoader } from "three/addons/loaders/USDLoader.js";
// A metal has no diffuse term: its colour comes from what it reflects. Without
// an environment the anodised enclosures render flat grey, so the scene needs
// one even though nothing else in the viewport is reflective.
export { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
