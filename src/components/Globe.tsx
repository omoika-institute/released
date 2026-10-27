import { useEffect, useRef } from "react";
import Globe from "globe.gl";
import * as THREE from "three";

type Dot = {
  lat: number;
  lng: number;
  size: number;
};

function makeDots(): Dot[] {
  const dots: Dot[] = [];

  for (let lat = -62; lat <= 76; lat += 2.6) {
    const latRad = (lat * Math.PI) / 180;
    const lngStep = Math.max(3.2, 4.8 / Math.max(Math.cos(latRad), 0.25));

    for (let lng = -180; lng <= 180; lng += lngStep) {
      const pattern =
        Math.sin(lng * 0.06 + lat * 0.08) +
        Math.cos(lng * 0.035 - lat * 0.12) +
        Math.sin(lat * 0.22);

      if (pattern > -0.2 && Math.random() > 0.2) {
        dots.push({
          lat,
          lng,
          size: 0.19 + Math.random() * 0.18,
        });
      }
    }
  }

  return dots;
}

export default function GlobeCard({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const el = canvasRef.current;

    const globe = new Globe(el)
      .width(el.clientWidth)
      .height(el.clientHeight)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(false)
      .pointsData(makeDots())
      .pointLat((d: object) => (d as Dot).lat)
      .pointLng((d: object) => (d as Dot).lng)
      .pointAltitude(0.01)
      .pointRadius((d: object) => (d as Dot).size)
      .pointColor(() => "rgba(192, 127, 35, 0.95)");

    globe.globeMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0,
        transparent: true,
      }),
    );

    globe.pointOfView(
      {
        lat: 17,
        lng: -34,
        altitude: 1.75,
      },
      0,
    );

    const controls = globe.controls();
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;

    const scene = globe.scene();

    const ambient = new THREE.AmbientLight(0xd89032, 1.5);
    scene.add(ambient);

    const light = new THREE.DirectionalLight(0xff9b2f, 1.2);
    light.position.set(-2, 1.5, 2.5);
    scene.add(light);

    const resize = () => {
      globe.width(el.clientWidth);
      globe.height(el.clientHeight);
    };

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      globe._destructor();
      el.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={canvasRef}
      className={className || "absolute inset-0 py-10 scale-[1.05] opacity-90"}
    />
  );
}
