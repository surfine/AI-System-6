export {
  ACESFilmicToneMapping,
  Box3,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
export { OrbitControls } from "three/addons/controls/OrbitControls.js";
export { USDLoader } from "three/addons/loaders/USDLoader.js";
export { unzipSync, zipSync } from "three/examples/jsm/libs/fflate.module.js";
// A metal has no diffuse term: its colour comes from what it reflects. Without
// an environment the anodised enclosures render flat grey, so the scene needs
// one even though nothing else in the viewport is reflective.
//
// The environment is Apple's own, read from the EXR their product scene names
// in its one `Environment` script. RoomEnvironment stays as the fallback for a
// browser that cannot decode it: a synthetic room is wrong, but grey is worse.
export { EXRLoader } from "three/addons/loaders/EXRLoader.js";
export { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
