/**
 * shaders.js — WebGL GLSL shaders for Spider-Verse Multiverse visual effects.
 *
 * Supported Universes:
 *   - miles:   Classic Comic-book color quantization + halftone dot screen + ink outline
 *   - punk:    Spider-Punk / Earth-138 (Xerox photocopy, stepped 12fps time, risograph dither)
 *   - gwen:    Spider-Gwen / Earth-65 (Pastel watercolor bleed, mood-ring wash, wet paper)
 *   - noir:    Spider-Man Noir / Earth-90214 (1930s monochrome, film scratches, grain & vignette)
 *   - cyber:   Spider-Man 2099 / Miguel O'Hara (Cyberpunk hologram, CRT scanlines, RGB split glitch)
 *   - anime:   Peni Parker / SP//dr (Anime cel-shading, manga screentone dots, crisp black ink lines)
 */

export const VERTEX_SHADER_SRC = /* glsl */ `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    // Flip Y because WebGL origin is bottom-left but canvas/video is top-left
    v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
  }
`;

// ─── 1. Miles Morales / Classic Comic Shader ────────────────────────────────
export const COMIC_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_dotSize;

  varying vec2 v_texCoord;

  vec3 quantize(vec3 color, float levels) {
    return floor(color * levels + 0.5) / levels;
  }

  float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  float halftone(vec2 uv, float lum, float cellPx) {
    vec2 frac  = fract(uv * u_resolution / cellPx) - 0.5;
    float r    = sqrt(clamp(1.0 - lum, 0.0, 1.0)) * 0.5;
    float dist = length(frac);
    return step(dist, r);
  }

  float edge(vec2 uv) {
    vec2 px = 1.0 / u_resolution;
    float c  = luminance(texture2D(u_texture, uv).rgb);
    float n  = luminance(texture2D(u_texture, uv + vec2(0, px.y)).rgb);
    float s  = luminance(texture2D(u_texture, uv - vec2(0, px.y)).rgb);
    float e  = luminance(texture2D(u_texture, uv + vec2(px.x, 0)).rgb);
    float w  = luminance(texture2D(u_texture, uv - vec2(px.x, 0)).rgb);
    float gx = abs(e - w) * 3.0;
    float gy = abs(n - s) * 3.0;
    return clamp((gx + gy) * 4.0, 0.0, 1.0);
  }

  void main() {
    vec4 raw   = texture2D(u_texture, v_texCoord);
    vec3 color = raw.rgb;

    vec3 qColor = quantize(color, 5.0);
    float lum   = luminance(qColor);
    float dot   = halftone(v_texCoord, lum, u_dotSize);
    vec3 htColor = mix(qColor * 0.4, qColor * 1.1, dot);

    float e     = edge(v_texCoord);
    vec3 inked  = mix(htColor, vec3(0.0), e * 0.85);
    inked       = inked * vec3(1.0, 0.96, 0.88);

    vec3 final  = mix(color, inked, u_intensity);
    gl_FragColor = vec4(final, raw.a);
  }
`;

// ─── 2. Spider-Punk / Earth-138 (Hobie Brown) ──────────────────────────────
export const PUNK_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;

  varying vec2 v_texCoord;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // Stepped time — animates on 2s (12 FPS punk zine vibe)
    float steppedTime = floor(u_time * 12.0) / 12.0;

    // Cutout jitter on stepped time
    vec2 jitter = vec2(
      rand(vec2(steppedTime, 1.1)) - 0.5,
      rand(vec2(steppedTime, 3.7)) - 0.5
    ) * 0.005;

    vec2 uv = v_texCoord + jitter;
    vec4 raw = texture2D(u_texture, uv);
    float lum = dot(raw.rgb, vec3(0.299, 0.587, 0.114));

    // Heavy photocopier grain
    float grain = (rand(uv * u_resolution + fract(steppedTime)) - 0.5) * 0.35;
    float noisyLum = clamp(lum + grain, 0.0, 1.0);

    // Risograph / punk halftone dither
    vec2 dotPos = fract(uv * u_resolution / 5.0) - 0.5;
    float dotMask = step(length(dotPos), 0.52 * (1.0 - noisyLum));

    // Iconic Spider-Punk zine palette: Acid Yellow, Punk Pink, Cyan, Stark Black
    vec3 punkPink   = vec3(1.0, 0.05, 0.48);
    vec3 punkYellow = vec3(1.0, 0.92, 0.0);
    vec3 punkCyan   = vec3(0.0, 0.92, 1.0);
    vec3 punkBlack  = vec3(0.05, 0.05, 0.07);
    vec3 punkWhite  = vec3(0.96, 0.96, 0.92);

    vec3 styled;
    if (noisyLum < 0.22) {
      styled = punkBlack;
    } else if (noisyLum < 0.50) {
      styled = mix(punkPink, punkBlack, dotMask);
    } else if (noisyLum < 0.78) {
      styled = mix(punkCyan, punkYellow, dotMask);
    } else {
      styled = mix(punkYellow, punkWhite, dotMask);
    }

    // High-contrast ripped ink edges
    vec2 px = 1.0 / u_resolution;
    float c = dot(texture2D(u_texture, uv).rgb, vec3(0.333));
    float r = dot(texture2D(u_texture, uv + vec2(px.x * 2.0, 0.0)).rgb, vec3(0.333));
    float b = dot(texture2D(u_texture, uv + vec2(0.0, px.y * 2.0)).rgb, vec3(0.333));
    float edges = clamp((abs(c - r) + abs(c - b)) * 6.0, 0.0, 1.0);
    if (edges > 0.32) styled = punkBlack;

    gl_FragColor = vec4(mix(raw.rgb, styled, u_intensity), raw.a);
  }
`;

// ─── 3. Spider-Gwen / Earth-65 (Mood Watercolor) ───────────────────────────
export const GWEN_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;

  varying vec2 v_texCoord;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_texCoord;

    // Organic watercolor wet ripple distortion
    float ripple = sin(uv.y * 24.0 + u_time * 1.4) * cos(uv.x * 20.0 + u_time * 1.1) * 0.0035;
    vec2 bleedUv = uv + vec2(ripple, ripple * 1.3);

    vec4 raw = texture2D(u_texture, bleedUv);
    float lum = dot(raw.rgb, vec3(0.299, 0.587, 0.114));

    // Earth-65 pastel wash palette:
    // Shadows = Deep plum violet, Midtones = Soft magenta & mint cyan, Highlights = Warm ivory
    vec3 gwenShadow  = vec3(0.18, 0.08, 0.30);
    vec3 gwenMagenta = vec3(0.96, 0.32, 0.64);
    vec3 gwenCyan    = vec3(0.35, 0.88, 0.96);
    vec3 gwenWhite   = vec3(0.98, 0.96, 0.93);

    vec3 wash;
    if (lum < 0.28) {
      wash = mix(gwenShadow, gwenMagenta, lum / 0.28);
    } else if (lum < 0.65) {
      wash = mix(gwenMagenta, gwenCyan, (lum - 0.28) / 0.37);
    } else {
      wash = mix(gwenCyan, gwenWhite, (lum - 0.65) / 0.35);
    }

    // Wet cold-press watercolor paper grain
    float paper = 0.94 + 0.06 * rand(floor(uv * u_resolution * 0.4));
    wash *= paper;

    // Soft bleeding watercolor outlines (deep violet instead of harsh black)
    vec2 px = 2.0 / u_resolution;
    float c = dot(texture2D(u_texture, uv).rgb, vec3(0.333));
    float r = dot(texture2D(u_texture, uv + vec2(px.x, 0.0)).rgb, vec3(0.333));
    float u = dot(texture2D(u_texture, uv + vec2(0.0, px.y)).rgb, vec3(0.333));
    float edgeVal = clamp((abs(c - r) + abs(c - u)) * 4.5, 0.0, 1.0);

    wash = mix(wash, gwenShadow * 0.75, edgeVal * 0.65);

    gl_FragColor = vec4(mix(raw.rgb, wash, u_intensity), raw.a);
  }
`;

// ─── 4. Spider-Man Noir / Earth-90214 (1930s Film Noir) ─────────────────────
export const NOIR_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;

  varying vec2 v_texCoord;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_texCoord;
    vec4 raw = texture2D(u_texture, uv);

    // Grayscale luminance
    float lum = dot(raw.rgb, vec3(0.299, 0.587, 0.114));

    // Dramatic noir contrast (crushed deep blacks & crisp highlights)
    lum = smoothstep(0.14, 0.86, lum);
    lum = pow(lum, 1.3);

    // 1930s authentic film grain
    float grain = (rand(uv * u_resolution * 0.8 + fract(u_time * 16.0)) - 0.5) * 0.22;
    lum = clamp(lum + grain, 0.0, 1.0);

    // Vintage film scratches
    float scratchSeed = floor(u_time * 18.0);
    float scratchX = rand(vec2(scratchSeed, 1.34));
    float scratchDist = abs(uv.x - scratchX);
    float isScratch = step(scratchDist, 0.0016) * step(0.65, rand(vec2(scratchSeed, 2.5)));
    lum = mix(lum, 1.0, isScratch * 0.75);

    // Heavy dramatic vignette
    vec2 centered = uv - 0.5;
    float vignette = 1.0 - dot(centered, centered) * 1.65;
    vignette = clamp(vignette, 0.0, 1.0);
    lum *= vignette;

    // Warm silver-gelatin vintage print tone
    vec3 noirColor = vec3(lum * 0.98, lum * 0.95, lum * 0.90);

    gl_FragColor = vec4(mix(raw.rgb, noirColor, u_intensity), raw.a);
  }
`;

// ─── 5. Spider-Man 2099 / Earth-928 (Cyberpunk Hologram) ───────────────────
export const CYBER_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;

  varying vec2 v_texCoord;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_texCoord;

    // Digital slice offset glitch
    float sliceY = floor(uv.y * 36.0 + u_time * 5.0);
    float rnd = rand(vec2(sliceY, floor(u_time * 9.0)));
    float sliceOffset = step(0.86, rnd) * (rnd - 0.5) * 0.035;
    vec2 gUv = vec2(uv.x + sliceOffset, uv.y);

    // Chromatic aberration (RGB channel separation)
    float split = 0.009 + 0.003 * sin(u_time * 12.0);
    float r = texture2D(u_texture, gUv + vec2(split, 0.0)).r;
    float g = texture2D(u_texture, gUv).g;
    float b = texture2D(u_texture, gUv - vec2(split, 0.0)).b;
    vec3 color = vec3(r, g, b);

    // Hologram color grade: boosted neon electric red & cyan
    color = vec3(
      color.r * 1.35,
      color.g * 0.85 + color.b * 0.35,
      color.b * 1.45
    );

    // Interlaced CRT scanlines
    float scanline = 0.80 + 0.20 * sin(uv.y * u_resolution.y * 3.14159);
    color *= scanline;

    // Holographic digital matrix lines
    vec2 grid = fract(uv * vec2(36.0, 20.0));
    float gridLine = step(0.965, grid.x) + step(0.965, grid.y);
    color += vec3(0.0, 0.35, 0.55) * gridLine * 0.28;

    vec4 raw = texture2D(u_texture, uv);
    gl_FragColor = vec4(mix(raw.rgb, color, u_intensity), raw.a);
  }
`;

// ─── 6. Peni Parker / Earth-14512 (Anime & Manga Cel) ───────────────────────
export const ANIME_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_intensity;

  varying vec2 v_texCoord;

  void main() {
    vec2 uv = v_texCoord;
    vec4 raw = texture2D(u_texture, uv);

    // 3.5-level sharp cel-shading
    vec3 cel = floor(raw.rgb * 3.5 + 0.25) / 3.0;

    // Anime vibrancy boost
    float gray = dot(cel, vec3(0.299, 0.587, 0.114));
    cel = mix(vec3(gray), cel, 1.45);

    // Manga screentone dots in midtones
    float lum = dot(raw.rgb, vec3(0.299, 0.587, 0.114));
    vec2 dotCoord = fract(uv * u_resolution / 6.0) - 0.5;
    float dotMask = step(length(dotCoord), 0.36);
    if (lum > 0.28 && lum < 0.62) {
      cel = mix(cel * 0.82, cel * 1.15, dotMask);
    }

    // Bold manga ink contour lines
    vec2 px = 1.5 / u_resolution;
    float c = dot(raw.rgb, vec3(0.333));
    float n = dot(texture2D(u_texture, uv + vec2(0.0, px.y)).rgb, vec3(0.333));
    float e = dot(texture2D(u_texture, uv + vec2(px.x, 0.0)).rgb, vec3(0.333));
    float edge = clamp((abs(c - n) + abs(c - e)) * 5.2, 0.0, 1.0);

    vec3 inked = mix(cel, vec3(0.0), edge * 0.92);

    gl_FragColor = vec4(mix(raw.rgb, inked, u_intensity), raw.a);
  }
`;

// ─── Interdimensional Glitch Shader ─────────────────────────────────────────
export const GLITCH_FRAGMENT_SHADER_SRC = /* glsl */ `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_glitchStrength;

  varying vec2 v_texCoord;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_texCoord;

    float band  = floor(uv.y * 28.0 + u_time * 12.0);
    float rnd   = rand(vec2(band, u_time));
    float shift = (rnd - 0.5) * 0.07 * u_glitchStrength;

    float r = texture2D(u_texture, uv + vec2(shift * 1.4, 0.0)).r;
    float g = texture2D(u_texture, uv).g;
    float b = texture2D(u_texture, uv - vec2(shift * 1.0, 0.0)).b;

    float scan = 0.85 + 0.15 * sin(uv.y * u_resolution.y * 3.14159);
    gl_FragColor = vec4(vec3(r, g, b) * scan, 1.0);
  }
`;

// ─── WebGL Renderer ─────────────────────────────────────────────────────────
export class WebGLRenderer {
  /**
   * @param {HTMLCanvasElement} glCanvas  — offscreen WebGL canvas
   * @param {number} width
   * @param {number} height
   */
  constructor(glCanvas, width, height) {
    this.canvas = glCanvas;
    this.resize(width, height);
    this._isContextLost = false;

    // Listen for WebGL context loss / restore (recovers on GPU driver crashes or wake from sleep)
    glCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._isContextLost = true;
      console.warn('[WebGLRenderer] WebGL Context Lost. Awaiting recovery...');
    }, false);

    glCanvas.addEventListener('webglcontextrestored', () => {
      console.info('[WebGLRenderer] WebGL Context Restored. Re-initializing pipeline...');
      try {
        this._initGL();
        this._isContextLost = false;
      } catch (err) {
        console.error('[WebGLRenderer] Re-initialization failed:', err);
      }
    }, false);

    this._initGL();
  }

  _initGL() {
    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Build all universe programs
    this._programs = {
      miles: this._buildProgram(VERTEX_SHADER_SRC, COMIC_FRAGMENT_SHADER_SRC),
      punk:  this._buildProgram(VERTEX_SHADER_SRC, PUNK_FRAGMENT_SHADER_SRC),
      gwen:  this._buildProgram(VERTEX_SHADER_SRC, GWEN_FRAGMENT_SHADER_SRC),
      noir:  this._buildProgram(VERTEX_SHADER_SRC, NOIR_FRAGMENT_SHADER_SRC),
      cyber: this._buildProgram(VERTEX_SHADER_SRC, CYBER_FRAGMENT_SHADER_SRC),
      anime: this._buildProgram(VERTEX_SHADER_SRC, ANIME_FRAGMENT_SHADER_SRC),
    };

    this._glitchProgram = this._buildProgram(VERTEX_SHADER_SRC, GLITCH_FRAGMENT_SHADER_SRC);
    this._quad = this._createQuad();
    this._texture = this._createTexture();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
    if (this.gl) this.gl.viewport(0, 0, w, h);
  }

  _buildProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const vs = this._compile(gl.VERTEX_SHADER,   vsSrc);
    const fs = this._compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader link error: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  _compile(type, src) {
    const gl     = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _createQuad() {
    const gl  = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const verts = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    return buf;
  }

  _createTexture() {
    const gl  = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  _uploadFrame(videoEl) {
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return false;
    try {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
      return true;
    } catch (e) {
      console.warn('WebGL texImage2D video frame upload skipped:', e);
      return false;
    }
  }

  _bindQuad(program) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const uvLoc  = gl.getAttribLocation(program, 'a_texCoord');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc,  2, gl.FLOAT, false, 16, 8);
  }

  /**
   * Render any universe filter.
   * @param {string} filterName - 'miles' | 'punk' | 'gwen' | 'noir' | 'cyber' | 'anime'
   * @param {HTMLVideoElement} videoEl
   * @param {object} opts - { intensity, dotSize, time }
   */
  renderFilter(filterName, videoEl, { intensity = 1.0, dotSize = 5.0, time = 0 } = {}) {
    if (this._isContextLost || !this.gl) return;
    const gl   = this.gl;
    const progKey = (filterName === 'ham') ? 'anime' : ((filterName === 'classic') ? 'miles' : filterName);
    const prog = this._programs[progKey] || this._programs.miles;
    gl.useProgram(prog);
    this._uploadFrame(videoEl);
    this._bindQuad(prog);

    gl.uniform1i(gl.getUniformLocation(prog, 'u_texture'),    0);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'),       time);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_intensity'),  intensity);

    const dotLoc = gl.getUniformLocation(prog, 'u_dotSize');
    if (dotLoc) gl.uniform1f(dotLoc, dotSize);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Backward compatibility
  renderComic(videoEl, opts) {
    this.renderFilter('miles', videoEl, opts);
  }

  /**
   * Render glitch effect overlay.
   * @param {object} opts - { strength, time }
   */
  renderGlitch({ strength = 0.5, time = 0 } = {}) {
    if (this._isContextLost || !this.gl) return;
    const gl   = this.gl;
    const prog = this._glitchProgram;
    gl.useProgram(prog);
    this._bindQuad(prog);

    gl.uniform1i(gl.getUniformLocation(prog, 'u_texture'),        0);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'),     this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'),           time);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_glitchStrength'), strength);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  copyToCanvas(ctx) {
    ctx.drawImage(this.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

