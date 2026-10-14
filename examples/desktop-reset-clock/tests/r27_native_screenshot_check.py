#!/usr/bin/env python3
"""Check genuine 2x AppKit captures saved by the R27 acceptance operator.

Run from the repository root with a Python environment containing Pillow:
python3 examples/desktop-reset-clock/tests/r27_native_screenshot_check.py
This analyzes captured pixels; it does not launch or control the desktop app.
"""
import argparse
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
DEFAULT = ROOT / '.runtime/tests/desktop-reset-clock/r27'


def check(evidence):
    rows = []
    heights = {'three':333,'two':299,'one':265,'empty':265,'long':333,'stale':333,'withdrawn':265}
    for scene, height in heights.items():
        im = Image.open(evidence / f'native-{scene}.png').convert('RGB')
        assert im.size == (772,height*2), (scene,im.size)
        count = {'three':3,'two':2,'one':1,'long':3}.get(scene,0)
        for i in range(count):
            top=380+i*68
            bounds=[]
            for left,right,kind in [(34,132,'date'),(150,735,'title')]:
                ys=[]
                for y in range(top+5,top+63):
                    for x in range(left,right):
                        r,g,b=im.getpixel((x,y))
                        ink=(g>195 and g-r>45 and b>150) if kind=='date' else (r>220 and g>225 and b>210)
                        if ink: ys.append(y)
                assert ys, (scene,i,kind,'no visible glyphs')
                bounds.append([min(ys),max(ys),(min(ys)+max(ys))/2])
            delta=abs(bounds[0][2]-bounds[1][2])/2
            assert delta<=2, (scene,i,bounds)
            offsets=[abs(bound[2]-(top+34))/2 for bound in bounds]
            assert max(offsets)<=2, (scene,i,offsets,'text not centered in its row')
            rows.append(dict(scene=scene,row=i+1,date=bounds[0],title=bounds[1],center_difference_pt=delta,row_center_offsets_pt=offsets))
    # Compare visible opaque artwork samples against the approved bytes, excluding
    # rounded corners, the source's left/bottom mask and overlaid native controls.
    art=Image.open(ROOT/'examples/desktop-reset-clock/internal/desktop/assets/r23-c3-reference-hero.webp').convert('RGB').resize((456,344),Image.Resampling.BILINEAR)
    edges={}
    for kind,points in [('top',[(x,y) for x in range(400,700,10) for y in (2,4,6)]),('right',[(x,y) for x in (762,764,766) for y in range(100,240,10)])]:
        im=Image.open(evidence/'native-three.png').convert('RGB')
        errors=[sum(abs(a-b) for a,b in zip(im.getpixel((x,y)),art.getpixel((x-316,y))))/3 for x,y in points]
        mean=sum(errors)/len(errors)
        # AppKit color management differs slightly from Pillow RGB; the prior
        # 18pt inset measures ~38 here, the corrected real window measures ~14.
        assert mean<22, (kind,mean,'artwork missing or inset')
        edges[kind]={'mean_rgb_error':mean,'max_rgb_error':max(errors),'samples':len(points)}
    reference=Image.open(evidence/'native-three.png').convert('RGB').crop((520,90,760,260)).tobytes()
    for scene in ('one','two','empty','long','stale','withdrawn'):
        im=Image.open(evidence/f'native-{scene}.png').convert('RGB')
        assert im.crop((520,90,760,260)).tobytes()==reference, (scene,'hero shifted or stretched')
    return dict(scope='Saved genuine AppKit 2x pixels; not other display scales',rows=rows,edges=edges,heights_pt=heights,hero_geometry_invariant=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-dir',type=Path,default=DEFAULT)
    args=parser.parse_args()
    evidence=args.evidence_dir.resolve()
    evidence.relative_to(ROOT/'.runtime')
    result=check(evidence)
    (evidence/'native-pixel-check.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'rows':len(result['rows']),'max_center_difference_pt':max(row['center_difference_pt'] for row in result['rows']),'edges':result['edges'],'hero_geometry_invariant':True},indent=2))


if __name__=='__main__':
    main()
