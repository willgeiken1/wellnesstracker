/**
 * The hero's globe, sky and limb gauge in one Skia runtime shader (SkSL), drawn over the hero's whole rectangle. Each pixel casts
 * a ray at the globe: on it, a night surface with a faint graticule and a wash of pillar colour; off it, the airglow that hugs
 * the limb; along the limb, three arcs filled to each pillar's progress with quarter ticks and an end cap that lights when met.
 * Edges are anti-aliased to one device pixel from screen-space slopes measured by casting the neighbouring pixels' rays.
 *
 * Uniforms are set in this order (see uniforms() in aurora-scene.ts).
 */
export const SKY_SKSL = `
uniform float2 uSize; uniform float uDpr;
uniform float3 uCamPos; uniform float3 uRight; uniform float3 uUp; uniform float3 uFwd; uniform float2 uTan;
uniform float3 uC; uniform float uR;
uniform float uDark; uniform float uRim; uniform float uGlobe; uniform float uGrow;
uniform float3 uCol0; uniform float3 uCol1; uniform float3 uCol2;
uniform float3 uVal; uniform float3 uSeed;
uniform float3 uBase; uniform float3 uLimb; uniform float3 uAir; uniform float3 uAir2; uniform float3 uGrid;
uniform float3 uS0; uniform float3 uS1; uniform float3 uGF; uniform float3 uGM; uniform float3 uGR;
uniform float3 uGC0; uniform float3 uGC1; uniform float3 uGC2;
uniform float uGA; uniform float uGW; uniform float3 uGD; uniform float uJ; uniform float uJG;
uniform float3 uAirK; uniform float uGlow;

float bar(float d, float hw) { return 1.0 - smoothstep(hw - 0.55, hw + 0.55, abs(d)); }
float3 col3(int i) { return i == 0 ? uCol0 : (i == 1 ? uCol1 : uCol2); }
float3 gcol(int i) { return i == 0 ? uGC0 : (i == 1 ? uGC1 : uGC2); }
float2 hillAt(int i) { return i == 0 ? float2(0.30, 0.40) : (i == 1 ? float2(0.70, 0.36) : float2(0.52, 0.72)); }

// The ray through hero point p: closest approach to the globe (dmin), the hit point's normal N and the view cosine mu.
float3 rayDir(float2 p) {
  float2 nd = float2(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0);
  return normalize(uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y);
}
float rayDmin(float3 dir) { float3 oc = uCamPos - uC; float b = dot(oc, dir); return length(oc + dir * max(-b, 0.0)); }
float3 rayN(float3 dir) {
  float3 oc = uCamPos - uC; float b = dot(oc, dir); float cc = dot(oc, oc) - uR * uR; float disc = b * b - cc;
  float t = -b - sqrt(max(disc, 0.0)); return normalize(uCamPos + t * dir - uC);
}
float2 mapXY(float3 N) { return float2(0.5 + uR * N.x / max(N.y, 0.05) * 0.5, 0.5 + uR * N.z / max(N.y, 0.05)); }
float2 latLon(float3 N) {
  float3 pole = normalize(float3(0.3, 0.5, -0.82)); float3 e1 = normalize(cross(pole, float3(0.0, 1.0, 0.0))); float3 e2 = cross(pole, e1);
  return float2(asin(clamp(dot(N, pole), -1.0, 1.0)) * 57.2958, atan(dot(N, e2), dot(N, e1)) * 57.2958);
}
// a grid line every stp of a, w device pixels wide; fw = the slope of a per device pixel
float gline(float a, float fw, float stp, float w) { float d = abs(fract(a / stp + 0.5) - 0.5) * stp; float px = d / max(fw, 0.0001); return 1.0 - smoothstep(w * uDpr, w * uDpr + 1.0, px); }
float wrapD(float d) { return d - 360.0 * floor(d / 360.0 + 0.5); }

half4 main(float2 p) {
  float2 nd = float2(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0);
  float3 dir = rayDir(p), dx = rayDir(p + float2(1.0, 0.0)), dy = rayDir(p + float2(0.0, 1.0));
  float dmin = rayDmin(dir);
  // slopes per device pixel (the hero is drawn in points; one point is uDpr device pixels)
  float fwD = (abs(rayDmin(dx) - dmin) + abs(rayDmin(dy) - dmin)) / uDpr;
  float alt = dmin - uR;
  float cov = 1.0 - smoothstep(-0.7, 0.7, alt / max(fwD, 0.00001));
  float reveal = 1.0 - smoothstep(uRim * 1.6 - 0.35, uRim * 1.6, abs(nd.x));
  float fb = smoothstep(-1.0, -0.5, nd.y);
  bool dk = uDark > 0.5;
  float3 gc = float3(0.0); float ga = 0.0;
  if (cov > 0.0) {
    float3 N = rayN(dir), Nx = rayN(dx), Ny = rayN(dy);
    float mu = clamp(dot(N, -dir), 0.0, 1.0); float fr = pow(1.0 - mu, 2.5);
    float2 ll = latLon(N), llx = latLon(Nx), lly = latLon(Ny);
    float fwLat = (abs(llx.x - ll.x) + abs(lly.x - ll.x)) / uDpr, fwLon = (abs(wrapD(llx.y - ll.y)) + abs(wrapD(lly.y - ll.y))) / uDpr;
    float grid = max(gline(ll.x, fwLat, 5.0, 0.32), gline(ll.y, fwLon, 10.0, 0.32) * 0.7) * smoothstep(0.04, 0.4, mu);
    float2 mxy = mapXY(N), mxx = mapXY(Nx), mxyy = mapXY(Ny);
    float3 pool = float3(0.0); float seed = 0.0; float3 seedC = float3(0.0);
    for (int i = 0; i < 3; i++) {
      float2 hp = hillAt(i);
      float2 dv = float2((mxy.x - hp.x) * 2.0, mxy.y - hp.y); float r = length(dv);
      float rx = length(float2((mxx.x - hp.x) * 2.0, mxx.y - hp.y)), ry = length(float2((mxyy.x - hp.x) * 2.0, mxyy.y - hp.y));
      float fw = max((abs(rx - r) + abs(ry - r)) / uDpr, 0.00001);
      float vi = uVal[i] * uGrow; float si = uSeed[i];
      pool += col3(i) * exp(-r * r / 0.06) * min(vi, 1.05);
      float dash = step(0.45, fract(atan(dv.y, dv.x) / 6.28318 * 28.0));
      float m = ((1.0 - smoothstep(0.5 * uDpr, 0.5 * uDpr + 1.1, abs(r - 0.11) / fw)) * dash + (1.0 - smoothstep(1.3 * uDpr, 1.3 * uDpr + 1.1, r / fw))) * si;
      seed += m; seedC += col3(i) * m;
    }
    if (dk) {
      gc = mix(uBase, uLimb, fr) + pool * 0.06 * reveal;
      gc = mix(gc, uGrid, grid * 0.09);
      gc += uAir * pow(1.0 - mu, 7.0) * 0.5 * reveal;
    } else {
      gc = mix(uBase, uLimb, pow(1.0 - mu, 1.6) * 0.9);
      gc = mix(gc, pool / max(length(pool) * 0.75, 0.0001) * 0.55 + gc * 0.45, clamp(length(pool), 0.0, 1.0) * 0.12 * reveal);
      gc = mix(gc, uGrid, grid * 0.11);
    }
    gc = mix(gc, seedC / max(seed, 0.001), clamp(seed, 0.0, 1.0) * (dk ? 0.85 : 0.8) * reveal);
    ga = cov * uGlobe * fb;
  }
  // sky: airglow hugging the limb
  float a0 = max(alt, 0.0);
  float air = exp(-a0 / 0.010) * uAirK.x + exp(-a0 / 0.06) * uAirK.y + exp(-a0 / 0.32) * uAirK.z;
  float3 airC = mix(uAir, uAir2, smoothstep(0.005, 0.12, a0));
  float3 sc = airC * air * reveal; float sa = air * reveal;
  if (dk) { sa = clamp(sa * 0.7, 0.0, 1.0); }
  else { sc = mix(float3(1.0), airC, 0.5) * air * reveal; sa = clamp(air * 0.55 * reveal, 0.0, 1.0); sc *= 0.55; }
  float ft = 1.0 - smoothstep(0.5, 1.0, nd.y); sc *= fb * ft; sa *= fb * ft;
  float skyW = (1.0 - cov) * (1.0 - ga); float3 rgb = gc * ga + sc * skyW; float a = ga + sa * skyW;
  // the limb gauge: pc = points above the limb (negative inside the globe), xp = points along the arc from a segment start
  float pc = alt / max(fwD, 0.00001) / uDpr; float uu = nd.x * 0.5 + 0.5; float inSeg = 0.0, inFill = 0.0;
  float3 gRgb = float3(0.0); float gA = 0.0; float y0 = 0.4;
  for (int i = 0; i < 3; i++) {
    float s0 = uS0[i], s1 = uS1[i], f = uGF[i], m = uGM[i], rs = uGR[i], gd = uGD[i]; float3 col = gcol(i);
    float L = (s1 - s0) * uGW, xp = (uu - s0) * uGW, fx = clamp(f, 0.0, 1.0) * L;
    float ins = smoothstep(-0.5, 0.5, xp) * (1.0 - smoothstep(L - 0.5, L + 0.5, xp)); inSeg += ins;
    float dyy = pc - y0;
    float trk = bar(dyy, 0.45) * ins * mix(1.0, step(0.5, fract(xp / 6.0)), rs);
    float fin = smoothstep(-0.5, 0.5, xp) * (1.0 - smoothstep(fx - 0.7, fx + 0.7, xp)) * step(0.0005, f) * (1.0 - rs);
    float ramp = 0.5 + 0.5 * clamp(xp / max(fx, 1.0), 0.0, 1.0);
    float band = bar(dyy, 1.3) * fin, core = bar(dyy, 0.4) * fin, halo = exp(-abs(dyy) / 3.0) * fin; inFill += fin;
    float dtp = length(float2(xp - fx, dyy)); float tip = exp(-dtp * dtp / 7.0) * step(0.0005, f) * (1.0 - rs);
    float tkOn = 0.0, tkOff = 0.0;
    for (int q = 1; q <= 3; q++) { float tx = L * float(q) * 0.25; float tk = bar(xp - tx, 0.5) * bar(pc + 5.2, 1.7) * (1.0 - rs); float o = step(tx, fx + 0.01); tkOn += tk * o; tkOff += tk * (1.0 - o); }
    float dc = length(float2(xp - L, dyy)); float ring = bar(dc - 3.3, 0.6) * (1.0 - rs); float capC = (1.0 - smoothstep(1.5, 2.5, dc)) * m; float capH = exp(-dc * dc / 40.0) * m;
    if (dk) {
      halo *= uGlow; capH *= uGlow; tip *= mix(0.45, 1.0, uGlow);
      float3 add = col * band * ramp * 0.95 + float3(1.0) * core * ramp * 0.28 + col * halo * ramp * 0.4 + float3(1.0) * tip * 0.8 + col * tip * 0.5
        + mix(uAir, col, 0.55) * trk * 0.32 + col * tkOn * 1.2 + uGrid * tkOff * 0.5
        + mix(uAir, col, 0.6) * ring * mix(0.45, 1.25, m) + float3(1.0) * capC + col * capH * 0.9;
      float aa = band * ramp * 0.9 + halo * 0.18 + tip * 0.8 + trk * 0.25 + tkOn * 0.8 + tkOff * 0.35 + ring * mix(0.4, 0.9, m) + capC + capH * 0.4;
      gRgb += add * gd; gA += aa * gd;
    } else {
      float lOn = clamp(band * (0.6 + 0.4 * ramp) + tip * 0.45 + tkOn * 0.9 + ring * m + capC, 0.0, 1.0);
      float lOff = clamp(trk * 0.55 + tkOff * 0.4 + ring * (1.0 - m) * 0.6, 0.0, 1.0) * (1.0 - lOn);
      float ha = clamp(halo * 0.2 + capH * 0.35, 0.0, 1.0) * gd; float3 off = mix(uGrid, col, 0.4); lOn *= gd; lOff *= gd;
      gRgb = gRgb * (1.0 - ha) + col * ha; gA = gA + ha * (1.0 - gA);
      gRgb = gRgb * (1.0 - lOff) + off * lOff; gA = gA + lOff * (1.0 - gA);
      gRgb = gRgb * (1.0 - lOn) + col * lOn; gA = gA + lOn * (1.0 - gA);
    }
  }
  // all three met: the gaps between the arcs light up behind a travelling glint, closing the arcs into one ring
  float xpx = uu * uGW; float span0 = smoothstep(-0.5, 0.5, xpx - uS0.x * uGW) * (1.0 - smoothstep(-0.5, 0.5, xpx - uS1.z * uGW));
  float front = 1.0 - smoothstep(uJ - 8.0, uJ + 2.0, xpx); float gap = span0 * (1.0 - clamp(inSeg, 0.0, 1.0));
  float bcore = bar(pc - y0, 0.5) * gap * front, bhalo = exp(-abs(pc - y0) / 3.2) * span0 * front;
  float jg = exp(-pow((xpx - uJ) / 16.0, 2.0)) * exp(-abs(pc - y0) / 2.4) * uJG * span0;
  bhalo *= uGlow; jg *= mix(0.5, 1.0, uGlow);
  if (dk) { gRgb += mix(uAir, float3(1.0), 0.5) * bcore * 0.95 + uAir * bhalo * 0.18 + float3(1.0) * jg * 1.2; gA += bcore * 0.85 + bhalo * 0.12 + jg; }
  else { float lb = clamp(bcore * 0.95 + jg * 0.85, 0.0, 1.0); gRgb = gRgb * (1.0 - lb) + uAir * lb; gA = gA + lb * (1.0 - gA); }
  // the plain airglow line dims under the gauge so the fills read, and drops further in the gaps between arcs
  float lim = (1.0 - smoothstep(0.0, 5.0, abs(pc - 0.3))) * uGA * reveal; float dim = lim * mix(mix(0.82, 0.55, clamp(inSeg, 0.0, 1.0)), 0.92, clamp(inFill, 0.0, 1.0));
  rgb *= 1.0 - dim; a *= 1.0 - dim * 0.6;
  gRgb *= uGA * fb; gA = clamp(gA * uGA * fb, 0.0, 1.0);
  if (dk) { rgb += gRgb; a = clamp(a + gA * 0.85, 0.0, 1.0); } else { rgb = rgb * (1.0 - gA) + gRgb; a = a + gA * (1.0 - a); }
  return half4(half3(rgb), half(a));
}`;

/**
 * A lit point: the end cap of a met arc and its hill's summit. A white core and a ring in the pillar colour, and while it
 * ignites, a star flare (two rays). Drawn in a box of side uBox centred on the point; local coordinates are relative to the box.
 */
export const SPRITE_SKSL = `
uniform float uBox; uniform float uDark; uniform float uGlow; uniform float uLit; uniform float uIgn; uniform float3 uCol;
half4 main(float2 p) {
  float2 q = p / uBox * 2.0 - 1.0; float r = length(q);
  float fall = 1.0 - smoothstep(0.7, 1.0, r);
  float core = 1.0 - smoothstep(0.04, 0.07, r);
  float ring = 1.0 - smoothstep(0.012, 0.03, abs(r - 0.15));
  float halo = exp(-r * r * 30.0);
  float rays = (exp(-abs(q.y) * 50.0) * exp(-abs(q.x) * 2.4) + exp(-abs(q.x) * 50.0) * exp(-abs(q.y) * 3.2)) * uIgn * mix(0.3, 1.0, uGlow);
  float flare = exp(-r * r * 6.0) * uIgn * mix(0.4, 1.0, uGlow);
  float3 rgb; float a;
  if (uDark > 0.5) {
    rgb = (float3(1.0) * core + mix(uCol, float3(1.0), 0.4) * ring * 0.8 + mix(uCol, float3(1.0), 0.3) * halo * 0.5) * uLit + mix(uCol, float3(1.0), 0.6) * (rays * 1.1 + flare * 0.55);
    rgb *= fall; a = clamp((core + ring * 0.6) * uLit, 0.0, 1.0) * fall;
  } else {
    float d = core * uLit; float rg = ring * uLit; float gl = clamp(rays * 0.8 + flare * 0.3, 0.0, 1.0) * fall;
    a = clamp(d + rg * 0.9, 0.0, 1.0); rgb = mix(float3(1.0), uCol, clamp(rg, 0.0, 1.0)) * a;
    rgb = rgb * (1.0 - gl) + float3(1.0, 0.98, 0.94) * gl; a = a + gl * (1.0 - a);
  }
  return half4(half3(rgb), half(a));
}`;
