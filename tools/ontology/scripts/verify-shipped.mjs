import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const records=JSON.parse(await readFile('assets/provenance/public-files.json','utf8'));
for(const r of records){
 if(r.license!=='CC0-1.0')throw Error(`Unapproved license: ${r.localPath}`);
 const bytes=await readFile(r.localPath);
 if(createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw Error(`Asset hash mismatch: ${r.localPath}`);
}
console.log(`${records.length} shipped CC0 assets verified`);
