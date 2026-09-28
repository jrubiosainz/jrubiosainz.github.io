export default {
  id: 'tv_static',
  title: 'STATIC',
  size: [640, 480],
  mount({ ctx, width, height }) {
    const meta = { vhs: 0, noise: 1, music: 'static_loop', selection: -1 };
    const sw = 160;
    const sh = 120;
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const ox = off.getContext('2d');
    const img = ox.createImageData(sw, sh);
    return {
      meta,
      frame(t) {
        let p = 0;
        for (let y = 0; y < sh; y += 1) {
          let v = (Math.random() * 255) | 0;
          for (let x = 0; x < sw; x += 1) {
            v = (v * .55 + Math.random() * 115) | 0;
            img.data[p++] = v;
            img.data[p++] = v;
            img.data[p++] = v + 8;
            img.data[p++] = 255;
          }
        }
        ox.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, width, height);
        const bar = ((t * 72) % (height + 90)) - 80;
        const g = ctx.createLinearGradient(0, bar, 0, bar + 70);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(.45, 'rgba(255,255,255,.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, bar, width, 80);
      },
      input() {},
      stop() {},
    };
  },
};
