import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Plata",
    short_name: "Mi Plata",
    description: "Registra lo que ganas y gastas en segundos y sabe cuánto puedes gastar hoy.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f9d6b",
    lang: "es-CL",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Agregar movimiento", url: "/agregar" }],
  };
}
