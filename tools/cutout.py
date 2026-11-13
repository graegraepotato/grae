# Local-only: real-outline head cutouts (no ellipse mask), neck removed below a traced jawline.
import sys, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
SRC, DST, PREV = sys.argv[1], sys.argv[2], sys.argv[3]
# jawline traced per photo (x,y in original pixels); skin below it = neck -> removed
JAW = {
 'front': [(151,322),(160,333),(177,347),(205,363),(240,370),(277,363),(307,347),(322,333),(331,322)],
 'angle': [(147,336),(157,351),(172,363),(200,371),(230,363),(260,351),(290,336),(315,319),(335,302),(350,280)],
 'side':  [(110,345),(120,361),(150,360),(180,354),(205,343),(230,329),(255,313),(275,296),(290,278)],
 'back':  None,
}
PAD = 28
for n, jaw in JAW.items():
    im = np.array(Image.open(f'{SRC}/{n}.png').convert('RGBA')).astype(np.float32)
    h, w = im.shape[:2]
    rgb, a = im[..., :3], im[..., 3]
    mn, mx = rgb.min(-1), rgb.max(-1)
    # 1) background = white-ish region connected to the image border (follows real hair/face outline)
    whiteish = ((mn > 205) & (mx - mn < 38)) | (a < 8)
    lab, _ = ndimage.label(whiteish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    keep = (~bg).astype(np.float32)
    # 2) neck = skin-coloured pixels below the jawline
    if jaw:
        r, g, b = rgb[..., 0]/255, rgb[..., 1]/255, rgb[..., 2]/255
        v = mx/255; s = np.where(mx > 0, (mx-mn)/np.maximum(mx, 1), 0)
        skin = (r > g) & (g > b*1.25) & (s > .38) & (v > .38)
        poly = Image.new('L', (w, h), 0)
        ImageDraw.Draw(poly).polygon([(jaw[0][0], h+5)] + jaw + [(jaw[-1][0], h+5)], fill=255)
        below = np.array(poly) > 0
        neck = ndimage.binary_closing(skin & below, iterations=2) & below
        neck = ndimage.binary_dilation(neck, iterations=1) & below
        keep[neck] = 0
    # 3) drop stray specks: keep the main connected silhouette only
    lab, k = ndimage.label(keep > 0)
    if k > 1:
        sizes = ndimage.sum(keep > 0, lab, range(1, k+1))
        keep = (lab == (1 + int(np.argmax(sizes)))).astype(np.float32)
    # 4) soft anti-aliased edge, shaved 1px to remove the white fringe
    m = Image.fromarray((keep*255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
    alpha = np.minimum(a, np.array(m).astype(np.float32))
    # hair that runs off the photo's bottom edge: short feather instead of a hard straight cut
    alpha *= np.clip((h-1-np.arange(h))/24.0, 0, 1)[:, None]
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    # de-fringe: pull colour of semi-transparent edge pixels from nearest opaque pixel
    inside = ndimage.binary_erosion(keep > 0, iterations=5) & (a > 250)
    idx = ndimage.distance_transform_edt(~inside, return_distances=False, return_indices=True)
    edge = (alpha > 0) & ~inside & (ndimage.distance_transform_edt(~inside) < 9)
    out[edge, :3] = out[idx[0][edge], idx[1][edge], :3]
    img = Image.fromarray(out)
    bb = Image.fromarray((alpha > 10).astype(np.uint8)*255).getbbox()
    img = img.crop(bb)
    canvas = Image.new('RGBA', (img.width+PAD*2, img.height+PAD*2), (0, 0, 0, 0)); canvas.paste(img, (PAD, PAD))
    canvas.save(f'{DST}/{n}.png')
    sh = canvas.getchannel('A').filter(ImageFilter.GaussianBlur(9))
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); shadow.putalpha(sh)
    shadow.resize((canvas.width//2, canvas.height//2), Image.LANCZOS).save(f'{DST}/{n}-shadow.png')
    prev = Image.new('RGBA', canvas.size, (18, 150, 160, 255)); prev.alpha_composite(canvas); prev.convert('RGB').save(f'{PREV}/c-{n}.png')
    print(n, canvas.size, round(canvas.width/canvas.height, 4))
