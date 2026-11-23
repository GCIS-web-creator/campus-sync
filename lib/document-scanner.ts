export type DocumentPoint = { x: number; y: number };
export type DocumentSize = { width: number; height: number };

function polygonArea(points: DocumentPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function isConvexQuadrilateral(points: DocumentPoint[]): boolean {
  if (points.length !== 4) return false;
  const crosses = points.map((point, index) => {
    const next = points[(index + 1) % 4];
    const after = points[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  return crosses.every(value => value > 0) || crosses.every(value => value < 0);
}

/** Returns the four corners in top-left, top-right, bottom-right, bottom-left order. */
export function orderDocumentCorners(points: readonly DocumentPoint[]): DocumentPoint[] | null {
  if (points.length !== 4 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  const ordered = [...points].sort((a, b) =>
    Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
  );
  const start = ordered.reduce((best, point, index) =>
    point.x + point.y < ordered[best].x + ordered[best].y ? index : best, 0);
  const corners = [...ordered.slice(start), ...ordered.slice(0, start)];
  if (!isConvexQuadrilateral(corners) || polygonArea(corners) < 1) return null;
  return corners;
}

export function getDocumentOutputSize(points: readonly DocumentPoint[], maxDimension = 2200): DocumentSize | null {
  const corners = orderDocumentCorners(points);
  if (!corners) return null;
  const distance = (a: DocumentPoint, b: DocumentPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2;
  const height = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)) };
}

type HoughLine = { theta: number; rho: number; votes: number };
function angleDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % Math.PI;
  return Math.min(raw, Math.PI - raw);
}
function lineIntersection(a: HoughLine, b: HoughLine): DocumentPoint | null {
  const a1 = Math.cos(a.theta), b1 = Math.sin(a.theta);
  const a2 = Math.cos(b.theta), b2 = Math.sin(b.theta);
  const determinant = a1 * b2 - a2 * b1;
  if (Math.abs(determinant) < 0.08) return null;
  return { x: (a.rho * b2 - b.rho * b1) / determinant, y: (a1 * b.rho - a2 * b.rho) / determinant };
}

/** Finds the strongest four-line document contour from a downsampled Sobel/Hough transform. */
export function detectDocumentCorners(imageData: ImageData): DocumentPoint[] | null {
  const scale = Math.max(1, Math.max(imageData.width, imageData.height) / 520);
  const width = Math.max(3, Math.round(imageData.width / scale));
  const height = Math.max(3, Math.round(imageData.height / scale));
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(imageData.height - 1, Math.round(y * scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(imageData.width - 1, Math.round(x * scale));
      const offset = (sourceY * imageData.width + sourceX) * 4;
      gray[y * width + x] = Math.round(imageData.data[offset] * 0.299 + imageData.data[offset + 1] * 0.587 + imageData.data[offset + 2] * 0.114);
    }
  }

  const magnitudes = new Float32Array(width * height);
  const gradients = new Uint8Array(width * height);
  const nonZero: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx = -gray[index - width - 1] + gray[index - width + 1] - 2 * gray[index - 1] + 2 * gray[index + 1] - gray[index + width - 1] + gray[index + width + 1];
      const gy = -gray[index - width - 1] - 2 * gray[index - width] - gray[index - width + 1] + gray[index + width - 1] + 2 * gray[index + width] + gray[index + width + 1];
      const magnitude = Math.hypot(gx, gy);
      magnitudes[index] = magnitude;
      if (magnitude > 0) {
        let angle = Math.atan2(gy, gx);
        if (angle < 0) angle += Math.PI;
        gradients[index] = Math.round(angle * 180 / Math.PI) % 180;
        nonZero.push(magnitude);
      }
    }
  }
  if (nonZero.length < Math.max(80, Math.floor(width * height * 0.008))) return null;
  nonZero.sort((a, b) => a - b);
  const edgeThreshold = Math.max(48, (nonZero[Math.floor(nonZero.length * 0.76)] || 40) * 0.62);

  const diagonal = Math.ceil(Math.hypot(width, height));
  const rhoSize = diagonal * 2 + 1;
  const accumulator = new Uint16Array(180 * rhoSize);
  const edgePoints: Array<{ x: number; y: number; theta: number }> = [];
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const index = y * width + x;
      if (magnitudes[index] >= edgeThreshold) edgePoints.push({ x, y, theta: gradients[index] });
    }
  }
  if (edgePoints.length < 60) return null;

  const cosines = new Float32Array(180), sines = new Float32Array(180);
  for (let theta = 0; theta < 180; theta += 1) {
    cosines[theta] = Math.cos(theta * Math.PI / 180);
    sines[theta] = Math.sin(theta * Math.PI / 180);
  }
  for (const point of edgePoints) {
    for (let delta = -9; delta <= 9; delta += 1) {
      const theta = (point.theta + delta + 180) % 180;
      const rho = Math.round(point.x * cosines[theta] + point.y * sines[theta]) + diagonal;
      if (rho >= 0 && rho < rhoSize) accumulator[theta * rhoSize + rho] += 1;
    }
  }

  const maxVotes = accumulator.reduce((max, value) => Math.max(max, value), 0);
  const minimumVotes = Math.max(22, Math.min(width, height) * 0.16, maxVotes * 0.20);
  const suppressed = new Uint8Array(accumulator.length);
  const candidates: HoughLine[] = [];
  for (let peak = 0; peak < 32; peak += 1) {
    let bestIndex = -1, bestVotes = 0;
    for (let theta = 0; theta < 180; theta += 1) {
      const row = theta * rhoSize;
      for (let rho = 0; rho < rhoSize; rho += 1) {
        const index = row + rho, votes = accumulator[index];
        if (!suppressed[index] && votes > bestVotes) { bestVotes = votes; bestIndex = index; }
      }
    }
    if (bestIndex < 0 || bestVotes < minimumVotes) break;
    const theta = Math.floor(bestIndex / rhoSize), rhoIndex = bestIndex % rhoSize;
    candidates.push({ theta: theta * Math.PI / 180, rho: rhoIndex - diagonal, votes: bestVotes });
    for (let dt = -5; dt <= 5; dt += 1) {
      const row = ((theta + dt + 180) % 180) * rhoSize;
      for (let dr = -14; dr <= 14; dr += 1) {
        const r = rhoIndex + dr;
        if (r >= 0 && r < rhoSize) suppressed[row + r] = 1;
      }
    }
  }
  if (candidates.length < 4) return null;

  const center = { x: width / 2, y: height / 2 };
  const pairs: Array<{ first: HoughLine; second: HoughLine; angle: number; votes: number }> = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const first = candidates[i], second = candidates[j];
      if (angleDistance(first.theta, second.theta) > 19 * Math.PI / 180) continue;
      const average = 0.5 * Math.atan2(Math.sin(2 * first.theta) + Math.sin(2 * second.theta), Math.cos(2 * first.theta) + Math.cos(2 * second.theta));
      const firstOffset = center.x * Math.cos(first.theta) + center.y * Math.sin(first.theta) - first.rho;
      const secondOffset = center.x * Math.cos(second.theta) + center.y * Math.sin(second.theta) - second.rho;
      const separation = Math.abs(firstOffset - secondOffset);
      if (separation < Math.min(width, height) * 0.19 || separation > Math.hypot(width, height) * 0.94) continue;
      pairs.push({ first, second, angle: average, votes: first.votes + second.votes });
    }
  }

  let bestCorners: DocumentPoint[] | null = null, bestScore = -Infinity;
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const a = pairs[i], b = pairs[j];
      if (angleDistance(a.angle, b.angle) < 62 * Math.PI / 180) continue;
      const used = new Set([a.first, a.second]);
      if (used.has(b.first) || used.has(b.second)) continue;
      const intersections = [lineIntersection(a.first,b.first),lineIntersection(a.first,b.second),lineIntersection(a.second,b.second),lineIntersection(a.second,b.first)];
      if (intersections.some(point => point === null)) continue;
      const corners = orderDocumentCorners(intersections as DocumentPoint[]);
      if (!corners || corners.some(point => point.x < -width*0.035 || point.x > width*1.035 || point.y < -height*0.035 || point.y > height*1.035)) continue;
      const areaRatio = polygonArea(corners) / (width * height);
      if (areaRatio < 0.18 || areaRatio > 0.98) continue;
      const distance = (p: DocumentPoint, q: DocumentPoint) => Math.hypot(p.x-q.x,p.y-q.y);
      const top = distance(corners[0],corners[1]), bottom = distance(corners[3],corners[2]);
      const left = distance(corners[0],corners[3]), right = distance(corners[1],corners[2]);
      const aspect = ((top+bottom)/2)/((left+right)/2);
      if (!Number.isFinite(aspect) || aspect < 0.28 || aspect > 2.7) continue;
      const balance = Math.min(top,bottom)/Math.max(top,bottom) + Math.min(left,right)/Math.max(left,right);
      const score = a.votes+b.votes+areaRatio*maxVotes*0.42+balance*maxVotes*0.18;
      if (score > bestScore) { bestScore=score; bestCorners=corners; }
    }
  }
  if (!bestCorners) return null;
  return bestCorners.map(point => ({ x: point.x * scale, y: point.y * scale }));
}

function solveLinearSystem(matrix: number[][]): number[] | null {
  const size = matrix.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-10) return null;
    [matrix[column],matrix[pivot]]=[matrix[pivot],matrix[column]];
    const divisor=matrix[column][column];
    for(let j=column;j<=size;j+=1)matrix[column][j]/=divisor;
    for(let row=0;row<size;row+=1){
      if(row===column)continue;
      const factor=matrix[row][column];
      if(factor===0)continue;
      for(let j=column;j<=size;j+=1)matrix[row][j]-=factor*matrix[column][j];
    }
  }
  return matrix.map(row=>row[size]);
}

function getPerspectiveTransform(corners: DocumentPoint[], width: number, height: number): number[] | null {
  const destination=[{x:0,y:0},{x:width-1,y:0},{x:width-1,y:height-1},{x:0,y:height-1}];
  const equations:number[][]=[];
  for(let i=0;i<4;i+=1){
    const {x,y}=destination[i],{x:sourceX,y:sourceY}=corners[i];
    equations.push([x,y,1,0,0,0,-sourceX*x,-sourceX*y,sourceX]);
    equations.push([0,0,0,x,y,1,-sourceY*x,-sourceY*y,sourceY]);
  }
  return solveLinearSystem(equations);
}

/** Rectifies a selected quadrilateral into a perspective-corrected JPEG. */
export async function rectifyDocumentCanvas(source: HTMLCanvasElement, selectedCorners: readonly DocumentPoint[], quality = 0.94): Promise<Blob> {
  const corners=orderDocumentCorners(selectedCorners);
  if(!corners)throw new Error('四隅を正しく指定してください。');
  const size=getDocumentOutputSize(corners);
  if(!size)throw new Error('補正する枠の大きさを認識できませんでした。');
  const transform=getPerspectiveTransform(corners,size.width,size.height);
  if(!transform)throw new Error('台形補正に失敗しました。四隅を調整してください。');
  const sourceContext=source.getContext('2d',{willReadFrequently:true});
  if(!sourceContext)throw new Error('画像を読み込めませんでした。');
  const sourceData=sourceContext.getImageData(0,0,source.width,source.height).data;
  const output=document.createElement('canvas');output.width=size.width;output.height=size.height;
  const outputContext=output.getContext('2d');
  if(!outputContext)throw new Error('補正画像を作成できませんでした。');
  const outputPixels=outputContext.createImageData(size.width,size.height),data=outputPixels.data;
  const [h0,h1,h2,h3,h4,h5,h6,h7]=transform;
  for(let y=0;y<size.height;y+=1){
    for(let x=0;x<size.width;x+=1){
      const denominator=h6*x+h7*y+1;
      if(Math.abs(denominator)<1e-9)continue;
      const sx=(h0*x+h1*y+h2)/denominator,sy=(h3*x+h4*y+h5)/denominator;
      const out=(y*size.width+x)*4;
      if(sx<0||sy<0||sx>=source.width-1||sy>=source.height-1){data[out]=255;data[out+1]=255;data[out+2]=255;data[out+3]=255;continue;}
      const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
      const p=(y0*source.width+x0)*4,pr=p+4,pb=p+source.width*4,pbr=pb+4;
      for(let channel=0;channel<3;channel+=1){
        const top=sourceData[p+channel]*(1-fx)+sourceData[pr+channel]*fx;
        const bottom=sourceData[pb+channel]*(1-fx)+sourceData[pbr+channel]*fx;
        data[out+channel]=Math.round(top*(1-fy)+bottom*fy);
      }
      data[out+3]=255;
    }
  }
  outputContext.putImageData(outputPixels,0,0);
  const blob=await new Promise<Blob|null>(resolve=>output.toBlob(resolve,'image/jpeg',quality));
  if(!blob)throw new Error('補正した画像を書き出せませんでした。');
  return blob;
}

export function makeDefaultDocumentCorners(width: number,height: number): DocumentPoint[] {
  const x=width*0.06,y=height*0.06;
  return [{x,y},{x:width-x,y},{x:width-x,y:height-y},{x,y:height-y}];
}
