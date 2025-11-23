/**
 * Hero CRT Effect - WebGL implementation
 * Applies CRT filter effects (scanlines, vignette, curvature, chromatic aberration) to hero sections
 */

// Vertex shader source
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Fragment shader source with CRT effects
const fragmentShaderSource = `
  precision mediump float;
  
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_curvature;
  uniform float u_vignette;
  uniform float u_scanlineIntensity;
  uniform float u_chromaticAberration;
  uniform vec2 u_mouseOffset;
  
  varying vec2 v_texCoord;
  
  // Curvature distortion
  vec2 distort(vec2 uv) {
    vec2 center = vec2(0.5, 0.5);
    vec2 coord = uv - center;
    float dist = length(coord);
    float factor = 1.0 + u_curvature * dist * dist;
    return center + coord * factor;
  }
  
  // Chromatic aberration
  vec3 chromaticAberration(sampler2D tex, vec2 uv, float amount, vec2 offset) {
    float r = texture2D(tex, uv + vec2(amount + offset.x, offset.y)).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv - vec2(amount + offset.x, offset.y)).b;
    return vec3(r, g, b);
  }
  
  // Vignette effect
  float vignette(vec2 uv) {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(uv, center);
    return 1.0 - smoothstep(0.3, 0.8, dist) * u_vignette;
  }
  
  // Scanlines
  float scanlines(vec2 uv) {
    float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
    return mix(1.0, scanline, u_scanlineIntensity * 0.3);
  }
  
  // Flicker effect
  float flicker(float time) {
    return 1.0 + sin(time * 10.0) * 0.02;
  }
  
  void main() {
    vec2 uv = v_texCoord;
    
    // Apply curvature distortion
    vec2 distortedUV = distort(uv);
    
    // Clamp to valid range
    if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || 
        distortedUV.y < 0.0 || distortedUV.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    
    // Apply chromatic aberration that emanates from center
    // Calculate vector from center (0.5, 0.5) to current pixel
    vec2 center = vec2(0.5, 0.5);
    vec2 centerToPixel = uv - center;
    
    // Correct for aspect ratio to ensure radial effect is circular, not elliptical
    float aspect = u_resolution.x / u_resolution.y;
    vec2 centerToPixelCorrected = centerToPixel;
    centerToPixelCorrected.x *= aspect;
    float distFromCenter = length(centerToPixelCorrected);
    
    // Mouse offset: when mouse is at center (0.5, 0.5), offset is (0, 0)
    // When mouse moves, offset represents direction and distance from center
    // We want aberration to emanate from center, opposite to mouse direction
    float mouseIntensity = length(u_mouseOffset);
    
    // Calculate aberration: 
    // - Direction: opposite to mouse offset (if mouse goes right, aberration goes left from center)
    // - Intensity: proportional to distance from center (pixels further from center get more aberration)
    // - Scale: based on mouse intensity
    vec2 aberration = vec2(0.0);
    if (mouseIntensity > 0.001) {
      vec2 mouseDirection = normalize(u_mouseOffset);
      // Aberration goes opposite to mouse direction, scaled by pixel distance from center
      // Reduced multiplier for subtler effect
      aberration = -mouseDirection * distFromCenter * mouseIntensity * 1.5;
    }
    
    // Base aberration (constant) + Mouse-driven aberration
    // u_chromaticAberration provides a baseline static effect
    // We use mix() to blend based on distance from center for a smoother look
    // Removed the * 0.5 dampener to increase effect visibility as requested
    vec3 color = chromaticAberration(u_texture, distortedUV, u_chromaticAberration * 0.003, aberration);
    
    // Apply scanlines
    color *= scanlines(uv);
    
    // Apply vignette
    color *= vignette(uv);
    
    // Apply flicker
    color *= flicker(u_time);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

class HeroCRTEffect {
  constructor(sectionId) {
    this.sectionId = sectionId;
    this.canvas = document.getElementById(`hero-crt-canvas-${sectionId}`);
    this.container = document.getElementById(`hero-crt-container-${sectionId}`);
    
    if (!this.canvas || !this.container) {
      return;
    }
    
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.sourceCanvas = null;
    this.sourceContext = null;
    this.animationFrameId = null;
    this.time = 0;
    this.mouseX = 0.0;
    this.mouseY = 0.0;
    this.targetMouseX = 0.0;
    this.targetMouseY = 0.0;
    this.velocityX = 0.0;
    this.velocityY = 0.0;
    this.isHovering = false;
    
    // Effect parameters
    this.curvature = 0.12;
    this.vignette = 0.74;
    this.scanlineIntensity = 0.5;
    this.chromaticAberration = 0.5;
    this.mouseSensitivity = 0.008; // Balanced for subtle effect
    this.momentum = 0.85; // Momentum factor (0-1, higher = smoother)
    
    this.init();
  }
  
  init() {
    if (!this.canvas || !this.container) {
      return;
    }
    
    // Check WebGL support
    const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
    if (!gl) {
      console.warn('WebGL not supported, CRT effect disabled');
      return;
    }
    
    this.gl = gl;
    
    // Create source canvas for capturing container content
    this.sourceCanvas = document.createElement('canvas');
    this.sourceContext = this.sourceCanvas.getContext('2d');
    
    // Setup WebGL
    this.setupWebGL();
    
    // Setup resize handler
    this.setupResize();
    
    // Setup mouse tracking
    this.setupMouseTracking();
    
    // Initial capture
    setTimeout(() => {
      this.captureContainer().then(canvas => {
        if (canvas && this.gl) {
          this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
          this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
        }
      });
    }, 500);
    
    // Start render loop
    this.render();
  }
  
  setupWebGL() {
    const gl = this.gl;
    
    // Create shaders
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      return;
    }
    
    // Create program
    this.program = this.createProgram(vertexShader, fragmentShader);
    if (!this.program) {
      return;
    }
    
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Setup geometry
    this.setupGeometry();
    
    // Set initial size
    this.resize();
  }
  
  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  createProgram(vertexShader, fragmentShader) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    
    return program;
  }
  
  setupGeometry() {
    const gl = this.gl;
    
    // Create quad covering entire canvas
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0,
    ]);
    
    // Position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Texture coordinate buffer
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    
    const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  }
  
  setupResize() {
    let resizeTimeout;
    const resizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.resize();
        // Re-capture on resize
        this.captureContainer().then(canvas => {
          if (canvas && this.gl) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
          }
        });
      }, 100);
    };
    
    window.addEventListener('resize', resizeHandler);
    
    // Use ResizeObserver for more accurate container size tracking
    if (window.ResizeObserver && this.container) {
      const observer = new ResizeObserver(resizeHandler);
      observer.observe(this.container);
    }
  }
  
  setupMouseTracking() {
    if (!this.container) {
      return;
    }
    
    const mouseMoveHandler = (e) => {
      const wasHovering = this.isHovering;
      this.isHovering = true;
      
      // If mouse just entered, reset to center first
      if (!wasHovering) {
        this.targetMouseX = 0;
        this.targetMouseY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.velocityX = 0;
        this.velocityY = 0;
      }
      
      const rect = this.container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      
      // Normalize to -0.5 to 0.5 range (center = 0)
      // This ensures mouse at center (0.5, 0.5) gives offset (0, 0)
      this.targetMouseX = (x - 0.5) * this.mouseSensitivity;
      this.targetMouseY = (y - 0.5) * this.mouseSensitivity;
    };
    
    const mouseLeaveHandler = () => {
      this.isHovering = false;
      // Keep current targetMouseX/Y - don't reset, let idle glitches happen
    };
    
    this.container.addEventListener('mousemove', mouseMoveHandler);
    this.container.addEventListener('mouseleave', mouseLeaveHandler);
    
    // Store handlers for cleanup
    this.mouseMoveHandler = mouseMoveHandler;
    this.mouseLeaveHandler = mouseLeaveHandler;
  }
  
  resize() {
    if (!this.container || !this.canvas) {
      return;
    }
    
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Set canvas size
    this.canvas.width = width;
    this.canvas.height = height;
    
    // Set source canvas size
    this.sourceCanvas.width = width;
    this.sourceCanvas.height = height;
    
    // Update WebGL viewport
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }
  
  async captureContainer() {
    if (!this.container || !this.sourceContext) {
      return null;
    }
    
    const width = this.sourceCanvas.width;
    const height = this.sourceCanvas.height;
    
    // Clear source canvas
    this.sourceContext.clearRect(0, 0, width, height);
    
    // Fill with background color or default to black
    // We want opaque background to cover the original media
    const style = window.getComputedStyle(this.container);
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
        this.sourceContext.fillStyle = style.backgroundColor;
    } else {
        this.sourceContext.fillStyle = '#000000';
    }
    this.sourceContext.fillRect(0, 0, width, height);
    
    // Native capture of visible media elements
    // This avoids external libraries like html2canvas
    const mediaElements = this.container.querySelectorAll('img, video, canvas');
    
    if (mediaElements.length > 0) {
      const containerRect = this.container.getBoundingClientRect();
      
      Array.from(mediaElements).forEach(el => {
        // Skip capturing our own canvas
        if (el === this.canvas) return;
        
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          try {
            const rect = el.getBoundingClientRect();
            const x = rect.left - containerRect.left;
            const y = rect.top - containerRect.top;
            const w = rect.width;
            const h = rect.height;
            
            // Only draw if element is within container bounds
            if (x + w > 0 && y + h > 0 && x < width && y < height) {
              this.sourceContext.drawImage(el, x, y, w, h);
            }
          } catch (e) {
            // Ignore drawing errors (e.g. taint)
          }
        }
      });
    }
    
    return this.sourceCanvas;
  }
  
  render() {
    if (!this.gl || !this.program) {
      return;
    }
    
    const gl = this.gl;
    
    if (!this.isHovering) {
        // Idle behavior: maintain current position and add subtle random glitches
        // Don't reset to center - keep the last mouse position
        // Only apply very subtle random glitches
        
        // Occasional very subtle glitch (much less frequent and weaker)
        if (Math.random() < 0.001) { 
            this.velocityX += (Math.random() - 0.5) * 0.002;
            this.velocityY += (Math.random() - 0.5) * 0.002;
        } 
        // Rare tiny twitch
        else if (Math.random() < 0.01) { 
            this.velocityX += (Math.random() - 0.5) * 0.0005;
            this.velocityY += (Math.random() - 0.5) * 0.0005;
        }
    }
    
    // Momentum-based mouse interpolation
    const deltaX = this.targetMouseX - this.mouseX;
    const deltaY = this.targetMouseY - this.mouseY;
    
    // Apply velocity with momentum
    const attraction = this.isHovering ? 0.1 : 0.02; // Much weaker attraction when idle
    this.velocityX += deltaX * attraction;
    this.velocityY += deltaY * attraction;
    
    // Apply momentum damping
    this.velocityX *= this.momentum;
    this.velocityY *= this.momentum;
    
    // Update position
    this.mouseX += this.velocityX;
    this.mouseY += this.velocityY;
    
    // Use program
    gl.useProgram(this.program);
    
    // Set uniforms
    const resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
    gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height);
    
    const timeLocation = gl.getUniformLocation(this.program, 'u_time');
    this.time += 0.016; // ~60fps
    gl.uniform1f(timeLocation, this.time);
    
    const curvatureLocation = gl.getUniformLocation(this.program, 'u_curvature');
    gl.uniform1f(curvatureLocation, this.curvature);
    
    const vignetteLocation = gl.getUniformLocation(this.program, 'u_vignette');
    gl.uniform1f(vignetteLocation, this.vignette);
    
    const scanlineLocation = gl.getUniformLocation(this.program, 'u_scanlineIntensity');
    gl.uniform1f(scanlineLocation, this.scanlineIntensity);
    
    const chromaticLocation = gl.getUniformLocation(this.program, 'u_chromaticAberration');
    gl.uniform1f(chromaticLocation, this.chromaticAberration);
    
    // Mouse offset uniform (for RGB glitch only)
    const mouseOffsetLocation = gl.getUniformLocation(this.program, 'u_mouseOffset');
    gl.uniform2f(mouseOffsetLocation, this.mouseX, this.mouseY);
    
    // Set texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    gl.uniform1i(textureLocation, 0);
    
    // Clear and draw
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    // Continue render loop immediately (no blocking calls)
    this.animationFrameId = requestAnimationFrame(() => this.render());
  }
  
  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Remove mouse event listeners
    if (this.container && this.mouseMoveHandler) {
      this.container.removeEventListener('mousemove', this.mouseMoveHandler);
      this.container.removeEventListener('mouseleave', this.mouseLeaveHandler);
    }
    
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    
    if (this.texture && this.gl) {
      this.gl.deleteTexture(this.texture);
    }
  }
}

// Initialize CRT effects for all hero-crt sections
function initHeroCRTEffects() {
  const crtSections = document.querySelectorAll('[data-crt-enabled="true"]');
  
  crtSections.forEach((section) => {
    const sectionId = section.id.replace('Hero-CRT-', '');
    if (sectionId) {
      new HeroCRTEffect(sectionId);
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeroCRTEffects);
} else {
  initHeroCRTEffects();
}

// Re-initialize on section load (for Shopify theme editor)
if (window.Shopify && window.Shopify.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    if (event.detail.sectionId) {
      const section = document.getElementById(`Hero-CRT-${event.detail.sectionId}`);
      if (section && section.dataset.crtEnabled === 'true') {
        new HeroCRTEffect(event.detail.sectionId);
      }
    }
  });
}

export { HeroCRTEffect, initHeroCRTEffects };
