declare module 'three' {
  const three: any;
  export = three;
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export class OrbitControls {
    constructor(object: any, domElement?: any);
    object: any;
    domElement: any;
    enabled: boolean;
    target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void; copy: (v: any) => void };
    minDistance: number;
    maxDistance: number;
    enableDamping: boolean;
    dampingFactor: number;
    update(): void;
    dispose(): void;
  }
}
