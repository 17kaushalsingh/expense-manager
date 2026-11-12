import {readFile,readdir,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import sharp from "sharp";
// Render the repository's vector brand mark; no separate raster artwork or remote assets.
const root=resolve(import.meta.dirname,".."),svg=await readFile(join(root,"src/app/icon.svg"));
await sharp(svg).resize(1024,1024).flatten({background:"#4f806b"}).png().toFile(join(root,"ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
const density={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
for(const [name,size] of Object.entries(density)){const folder=join(root,`android/app/src/main/res/mipmap-${name}`);for(const icon of ["ic_launcher.png","ic_launcher_round.png"])await sharp(svg).resize(size,size).png().toFile(join(folder,icon));const transparent=svg.toString().replace('<rect width="64" height="64" rx="16" fill="#4f806b"/>',"");await sharp(Buffer.from(transparent)).resize(Math.round(size*2.25),Math.round(size*2.25)).png().toFile(join(folder,"ic_launcher_foreground.png"));}
async function splashes(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=join(folder,item.name);if(item.isDirectory())await splashes(file);else if(item.name.startsWith("splash")&&item.name.endsWith(".png")){const {width,height}=await sharp(file).metadata(),size=Math.round(Math.min(width,height)/5),x=(width-size)/2,y=(height-size)/2;const tile=svg.toString().replace('width="64" height="64"',`x="${x}" y="${y}" width="${size}" height="${size}"`);const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f4f6f2"/>${tile}</svg>`;await writeFile(file,await sharp(Buffer.from(source)).png().toBuffer());}}}
await splashes(join(root,"android/app/src/main/res"));await splashes(join(root,"ios/App/App/Assets.xcassets/Splash.imageset"));
console.log("Rendered LedgerSync app icons and launch screens from the existing SVG");
