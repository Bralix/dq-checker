// next.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const abs = (p) => path.join(__dirname, p);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
      // Turbopack MUST get RELATIVE strings (no C:\ paths)
      resolveAlias: {
        canvas: "./stubs/canvas-shim.js",
        // pdf.js worker aliases – cover all common variants:
        "pdfjs-dist/build/pdf.worker.js": "./stubs/pdf-worker-stub.js",
        "pdfjs-dist/build/pdf.worker.mjs": "./stubs/pdf-worker-stub.js",
        "pdfjs-dist/build/pdf.worker": "./stubs/pdf-worker-stub.js",
        "pdfjs-dist/legacy/build/pdf.worker.js": "./stubs/pdf-worker-stub.js",
        "./pdf.worker.js": "./stubs/pdf-worker-stub.js",
      },
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Absolute versions for webpack
      canvas: abs("stubs/canvas-shim.js"),
      "pdfjs-dist/build/pdf.worker.js": abs("stubs/pdf-worker-stub.js"),
      "pdfjs-dist/build/pdf.worker.mjs": abs("stubs/pdf-worker-stub.js"),
      "pdfjs-dist/build/pdf.worker": abs("stubs/pdf-worker-stub.js"),
      "pdfjs-dist/legacy/build/pdf.worker.js": abs("stubs/pdf-worker-stub.js"),
      "./pdf.worker.js": abs("stubs/pdf-worker-stub.js"),
    };
    return config;
  },
};

export default nextConfig;
