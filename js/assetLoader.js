/**
 * assetLoader.js — converts SVG assets to Image objects usable on canvas.
 * Called by renderer.js before the render loop starts.
 */

export async function loadSVGAsImage(svgPath) {
  const res  = await fetch(svgPath);
  const text = await res.text();
  return svgTextToImage(text);
}

export function svgTextToImage(svgStr) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src     = url;
  });
}
