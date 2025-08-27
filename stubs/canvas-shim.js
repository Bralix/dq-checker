// Minimal CommonJS shim so pdfjs doesn't try to load native 'canvas'
module.exports = {
  createCanvas(width = 0, height = 0) {
    return {
      width,
      height,
      getContext() {
        // We don't render; just return a stub context object
        return {
          measureText() { return { width: 0 }; },
          // add no-op methods if pdfjs ever calls them:
          fillRect() {}, clearRect() {}, putImageData() {}, drawImage() {},
        };
      },
    };
  },
  Image: function Image() {},
};

