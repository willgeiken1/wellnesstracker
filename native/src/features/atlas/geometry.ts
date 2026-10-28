import source from '../../../assets/atlas/geometry.json';
export type BodyType = 'male' | 'female';
export type Side = 'front' | 'back';
export const atlasGeometry = source;
/** The rendered straight-edge SVG paths and hit regions share the same vertices.
 * Boundary points count as hits. Reverse paint order resolves any shared edge. */
function contains(points: number[][], x: number, y: number) {
 let inside = false;
 for (let i=0,j=points.length-1;i<points.length;j=i++) {
  const [ax,ay]=points[j], [bx,by]=points[i];
  const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
  if (Math.abs(cross)<1e-8 && x>=Math.min(ax,bx) && x<=Math.max(ax,bx) && y>=Math.min(ay,by) && y<=Math.max(ay,by)) return true;
  if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
 }
 return inside;
}
export function hitTest(body: BodyType, side: Side, x: number, y: number): string | null {
 if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
 return [...atlasGeometry[body][side].muscles].reverse().find(m=>m.polygons.some(p=>contains(p,x,y)))?.id ?? null;
}
