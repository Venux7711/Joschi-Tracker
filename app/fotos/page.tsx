﻿﻿useclient

import{useState,useEffect,useRef}fromreact
importLinkfromnext/link
importImagefromnext/image
importHeaderfrom@/components/Header
import{createClient}from@/lib/supabase/client

interfacePhoto{
id:string
public_url:string
storage_path:string
mood_tag:string
caption:string|null
taken_at:string
health_log_id:string|null
}

constMOOD_LABELS:Record<string,{label:string;color:string}>={
good:{label:GuterTag,color:bg-green-100text-green-700},
bad:{label:Durchfall,color:bg-red-100text-red-700},
normal:{label:Normal,color:bg-gray-100text-gray-600},
sick:{label:Krank,color:bg-orange-100text-orange-700},
vet:{label:Tierarzt,color:bg-blue-100text-blue-700},
}

exportdefaultfunctionFotosPage(){
constsupabase=createClient()
constfileRef=useRef<HTMLInputElement>(null)

const[photos,setPhotos]=useState<Photo[]>([])
const[loading,setLoading]=useState(true)
const[uploading,setUploading]=useState(false)
const[selected,setSelected]=useState<Photo|null>(null)
const[filter,setFilter]=useState<string>(all)
const[catId,setCatId]=useState<string|null>(null)

useEffect(()=>{
constinit=async()=>{
const{data:cats}=awaitsupabase.from(cats).select(id).limit(1)
if(cats?.length)setCatId(cats[0].id)
loadPhotos()
}
init()
},[])

constloadPhotos=async()=>{
setLoading(true)
constres=awaitfetch(/api/photos?limit=200)
constdata=awaitres.json()
setPhotos(data.photos??[])
setLoading(false)
}

consthandleUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{
constfile=e.target.files?.[0]
if(!file||!catId)return
setUploading(true)

const{data:{user}}=awaitsupabase.auth.getUser()
if(!user){setUploading(false);return}

constext=file.name.split(.).pop()??jpg
constpath=`${catId}/${Date.now()}.${ext}`

const{data:uploadData,error:uploadErr}=awaitsupabase.storage
.from(joschi-photos)
.upload(path,file,{contentType:file.type})

if(uploadErr||!uploadData){setUploading(false);return}

const{data:{publicUrl}}=supabase.storage.from(joschi-photos).getPublicUrl(uploadData.path)

awaitfetch(/api/photos,{
method:POST,
headers:{Content-Type:application/json},
body:JSON.stringify({storage_path:uploadData.path,public_url:publicUrl,mood_tag:normal,taken_at:newDate().toISOString()}),
})

awaitloadPhotos()
setUploading(false)
e.target.value=
}

consthandleDelete=async(photo:Photo)=>{
if(!confirm(Fotolöschen?))return
awaitfetch(/api/photos,{method:DELETE,headers:{Content-Type:application/json},body:JSON.stringify({id:photo.id,storage_path:photo.storage_path})})
setSelected(null)
awaitloadPhotos()
}

constfiltered=filter===all?photos:photos.filter(p=>p.mood_tag===filter)

constgrouped:Record<string,Photo[]>={}
filtered.forEach(p=>{
constmonth=p.taken_at.slice(0,7)
if(!grouped[month])grouped[month]=[]
grouped[month].push(p)
})

constmonthLabel=(m:string)=>{
const[y,mo]=m.split(-)
constmonths=[Jan,Feb,Mär,Apr,Mai,Jun,Jul,Aug,Sep,Okt,Nov,Dez]
return`${months[parseInt(mo)-1]}${y}`
}

return(
<divclassName="min-h-screen">
<Header/>

<mainclassName="max-w-2xlmx-autopx-4py-6">
<divclassName="flexitems-centerjustify-betweenmb-6">
<divclassName="flexitems-centergap-3">
<Linkhref="/dashboard"className="text-gray-400hover:text-gray-600">†Zurück</Link>
<h1className="text-xlfont-boldtext-gray-800">ðŸ¸JoscisFotoalbum</h1>
</div>
<labelclassName="btn-primarycursor-pointertext-sm">
{uploading?Lädt:+Foto}
<inputref={fileRef}type="file"accept="image/*"capture="environment"className="hidden"onChange={handleUpload}disabled={uploading}/>
</label>
</div>

{/*Filter*/}
<divclassName="flexgap-2mb-5flex-wrap">
{[all,good,normal,bad,vet].map(f=>(
<button
key={f}
onClick={()=>setFilter(f)}
className={`px-3py-1.5rounded-fulltext-smfont-mediumtransition-colors${
filter===f?bg-amber-500text-white:bg-whitetext-gray-600borderborder-gray-200hover:border-amber-300
}`}
>
{f===all?`Alle(${photos.length})`:MOOD_LABELS[f]?.label}
</button>
))}
</div>

{loading?(
<divclassName="gridgrid-cols-3gap-2">
{Array.from({length:9}).map((_,i)=>(
<divkey={i}className="aspect-squarebg-gray-200rounded-xlanimate-pulse"/>
))}
</div>
):filtered.length===0?(
<divclassName="cardp-12text-center">
<divclassName="text-5xlmb-4">ðŸ¸</div>
<pclassName="text-gray-500mb-2">NochkeineFotos</p>
<pclassName="text-smtext-gray-400">Tippeauf"+Foto"umJoschiserstesBildhinzuzufügen</p>
</div>
):(
<divclassName="space-y-6">
{Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,mphotos])=>(
<divkey={month}>
<h2className="text-smfont-semiboldtext-gray-500mb-2uppercasetracking-wide">{monthLabel(month)}</h2>
<divclassName="gridgrid-cols-3gap-2">
{mphotos.map(photo=>(
<button
key={photo.id}
onClick={()=>setSelected(photo)}
className="aspect-squarerelativerounded-xloverflow-hiddengroup"
>
<Imagesrc={photo.public_url}alt=""fillclassName="object-covertransition-transformgroup-hover:scale-105"sizes="33vw"/>
{photo.mood_tag!==normal&&(
<divclassName={`absolutetop-1right-1text-xspx-1.5py-0.5rounded-fullfont-medium${MOOD_LABELS[photo.mood_tag]?.color}`}>
{MOOD_LABELS[photo.mood_tag]?.label}
</div>
)}
</button>
))}
</div>
</div>
))}
</div>
)}
</main>

{/*Lightbox*/}
{selected&&(
<div
className="fixedinset-0bg-black/90z-50flexflex-colitems-centerjustify-centerp-4"
onClick={()=>setSelected(null)}
>
<divclassName="relativew-fullmax-w-lg"onClick={e=>e.stopPropagation()}>
<divclassName="relativeaspect-squarew-fullrounded-2xloverflow-hidden">
<Imagesrc={selected.public_url}alt=""fillclassName="object-contain"sizes="100vw"/>
</div>
<divclassName="flexitems-centerjustify-betweenmt-3">
<div>
<spanclassName={`text-xspx-2py-1rounded-full${MOOD_LABELS[selected.mood_tag]?.color??bg-gray-100text-gray-600}`}>
{MOOD_LABELS[selected.mood_tag]?.label??selected.mood_tag}
</span>
<pclassName="text-gray-400text-smmt-1">
{newDate(selected.taken_at).toLocaleDateString(de-DE,{day:numeric,month:long,year:numeric})}
</p>
</div>
<button
onClick={()=>handleDelete(selected)}
className="text-red-400hover:text-red-300text-smpx-3py-1.5rounded-lgborderborder-red-400/30hover:border-red-400"
>
Löschen
</button>
</div>
<button
onClick={()=>setSelected(null)}
className="absolutetop-2right-2bg-black/50text-whiterounded-fullw-8h-8flexitems-centerjustify-centertext-lg"
>

</button>
</div>
</div>
)}
</div>
)
}
