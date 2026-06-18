// jsdom doesn't implement HTMLCanvasElement.getContext.
// Provide a minimal mock so ForceGraph2D initializes without crashing.
// Partial canvas mock for jsdom — ForceGraph2D needs getContext to exist.
// TypeScript's DOM types don't match our minimal stub, so we suppress checks.
// @ts-nocheck
/* eslint-disable */
HTMLCanvasElement.prototype.getContext = () => ({
  canvas: document.createElement('canvas'),
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: [] }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {},
  setLineDash: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
})
