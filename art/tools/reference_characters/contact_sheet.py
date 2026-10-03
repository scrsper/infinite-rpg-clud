"""Create a labelled reference/draft contact sheet from local pixels only."""
import bpy, numpy as np, sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
def read(path,w,h):
    im=bpy.data.images.load(str(path),check_existing=False);sw,sh=im.size
    buf=np.empty(sw*sh*4,dtype=np.float32);im.pixels.foreach_get(buf);a=buf.reshape(sh,sw,4)
    return a[np.linspace(0,sh-1,h).astype(int)[:,None],np.linspace(0,sw-1,w).astype(int)[None,:]]
canvas=np.ones((1924,1536,4),dtype=np.float32)*.18;canvas[:,:,3]=1
canvas[900:1924]=read(Path('C:/Users/green/Downloads/mc-female-1'),1536,1024)
for i,name in enumerate(['front','side','back']):canvas[90:810,i*512:(i+1)*512]=read(out/(name+'.png'),512,720)
im=bpy.data.images.new('ReferenceAbove_DraftBelow_NOT_APPROVED',width=1536,height=1924,alpha=True);im.pixels.foreach_set(canvas.ravel());im.filepath_raw=str(out/'reference-and-draft.png');im.file_format='PNG';im.save()

