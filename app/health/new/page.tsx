﻿﻿useclient

import{useState,useEffect,useRef,Suspense}fromreact
import{useRouter,useSearchParams}fromnext/navigation
importLinkfromnext/link
importImagefromnext/image
importHeaderfrom@/components/Header
import{createClient}from@/lib/supabase/client
import{toLocalISOString}from@/lib/utils
importtype{StoolConsistency,Appetite,Activity}from@/lib/types

interfaceToggleGroupProps<Textendsstring>{
value:T
onChange:(v:T)=>void
options:{value:T;label:string;color?:string}[]
}

functionToggleGroup<Textendsstring>({value,onChange,options}:ToggleGroupProps<T>){
return(
<divclassName="flexgap-2flex-wrap">
{options.map((opt)=>(
<button
key={opt.value}
type="button"
onClick={()=>onChange(opt.value)}
className={`flex-1min-w-[70px]py-2.5px-2rounded-xltext-smfont-mediumtransition-allborder${
value===opt.value
?opt.color??bg-amber-500border-amber-500text-white
:bg-whiteborder-gray-200text-gray-600hover:border-gray-300
}`}
>
{opt.label}
</button>
))}
</div>
)
}

functionYesNoToggle({
value,
onChange,
yesLabel=Ja,
noLabel=Nein,
yesColor=bg-red-500border-red-500text-white,
}:{
value:boolean
onChange:(v:boolean)=>void
yesLabel?:string
noLabel?:string
yesColor?:string
}){
return(
<divclassName="flexgap-2">
<button
type="button"
onClick={()=>onChange(true)}
className={`flex-1py-2.5rounded-xltext-smfont-mediumtransition-allborder${
value?yesColor:bg-whiteborder-gray-200text-gray-600hover:border-gray-300
}`}
>
{yesLabel}
</button>
<button
type="button"
onClick={()=>onChange(false)}
className={`flex-1py-2.5rounded-xltext-smfont-mediumtransition-allborder${
!value?bg-green-500border-green-500text-white:bg-whiteborder-gray-200text-gray-600hover:border-gray-300
}`}
>
{noLabel}
</button>
</div>
)
}

functionNewHealthForm(){
constrouter=useRouter()
constsearchParams=useSearchParams()
constdateParam=searchParams.get(date)
constsupabase=createClient()
constphotoRef=useRef<HTMLInputElement>(null)

const[catId,setCatId]=useState<string|null>(null)
const[loggedAt,setLoggedAt]=useState()
const[stool,setStool]=useState<StoolConsistency>(not_observed)
const[vomiting,setVomiting]=useState(false)
const[appetite,setAppetite]=useState<Appetite>(good)
const[activity,setActivity]=useState<Activity>(normal)
const[furIssue,setFurIssue]=useState(false)
const[notes,setNotes]=useState()
const[loading,setLoading]=useState(false)
const[error,setError]=useState<string|null>(null)
const[photoFile,setPhotoFile]=useState<File|null>(null)
const[photoPreview,setPhotoPreview]=useState<string|null>(null)

useEffect(()=>{
setLoggedAt(dateParam?`${dateParam}T12:00`:toLocalISOString())

constinit=async()=>{
const{
data:{user},
}=awaitsupabase.auth.getUser()
if(!user)return

const{data:cats}=awaitsupabase
.from(cats)
.select(id)
.limit(1)

if(cats&&cats.length>0)setCatId(cats[0].id)
}

init()
},[])

consthandleSubmit=async(e:React.FormEvent)=>{
e.preventDefault()
if(!catId){
setError(Katzenichtgefunden.BittezuerstdasDashboardöffnen.)
return
}
setLoading(true)
setError(null)

const{
data:{user},
}=awaitsupabase.auth.getUser()
if(!user)return

const{data:insertData,error:insertError}=awaitsupabase.from(health_logs).insert({
cat_id:catId,
user_id:user.id,
logged_at:newDate(loggedAt).toISOString(),
stool_consistency:stool,
vomiting,
appetite,
activity,
fur_issue:furIssue,
notes:notes.trim()||null,
}).select(id).single()

if(insertError){
setError(FehlerbeimSpeichern.Bitteerneutversuchen.)
setLoading(false)
return
}

//Fotohochladenfallsausgewählt
if(photoFile&&catId&&insertData?.id){
constext=photoFile.name.split(.).pop()??jpg
constpath=`${catId}/${Date.now()}.${ext}`
const{data:uploadData}=awaitsupabase.storage.from(joschi-photos).upload(path,photoFile,{contentType:photoFile.type})
if(uploadData){
const{data:{publicUrl}}=supabase.storage.from(joschi-photos).getPublicUrl(uploadData.path)
constmoodTag=stool===diarrhea?bad:stool===normal?good:normal
awaitfetch(/api/photos,{method:POST,headers:{Content-Type:application/json},body:JSON.stringify({storage_path:uploadData.path,public_url:publicUrl,mood_tag:moodTag,health_log_id:insertData.id,taken_at:newDate(loggedAt).toISOString()})})
}
}

router.push(/dashboard)
}

conststoolOptions:{value:StoolConsistency;label:string;color?:string}[]=[
{value:normal,label:Normal,color:bg-green-500border-green-500text-white},
{value:soft,label:~Weich,color:bg-yellow-400border-yellow-400text-white},
{value:diarrhea,label:Durchfall,color:bg-red-500border-red-500text-white},
{value:not_observed,label:Nichtgesehen,color:bg-gray-400border-gray-400text-white},
]

constappetiteOptions:{value:Appetite;label:string}[]=[
{value:good,label:ðŸ‹Gut},
{value:reduced,label:ðŸWenig},
{value:none,label:ðŸžGarnicht},
]

constactivityOptions:{value:Activity;label:string}[]=[
{value:normal,label:ðŸ¾Normal},
{value:tired,label:ðŸ´Müde},
{value:very_active,label:ðŸƒSehraktiv},
]

return(
<divclassName="min-h-screen">
<Header/>

<mainclassName="max-w-2xlmx-autopx-4py-6">
<divclassName="flexitems-centergap-3mb-6">
<Link
href="/dashboard"
className="text-gray-400hover:text-gray-600transition-colors"
>
†Zurück
</Link>
<h1className="text-xlfont-boldtext-gray-800">ðŸ’ŠBefindeneintragen</h1>
</div>

<divclassName="cardp-5">
<formonSubmit={handleSubmit}className="space-y-6">
{/*Uhrzeit*/}
<div>
<labelhtmlFor="loggedAt"className="label">
Uhrzeit
</label>
<input
id="loggedAt"
type="datetime-local"
value={loggedAt}
onChange={(e)=>setLoggedAt(e.target.value)}
className="input-field"
required
/>
</div>

{/*Stuhlgang*/}
<div>
<labelclassName="label">Stuhlgang</label>
<ToggleGroup
value={stool}
onChange={setStool}
options={stoolOptions}
/>
</div>

{/*Erbrochen*/}
<div>
<labelclassName="label">Erbrochen?</label>
<YesNoTogglevalue={vomiting}onChange={setVomiting}/>
</div>

{/*Appetit*/}
<div>
<labelclassName="label">Appetit</label>
<ToggleGroup
value={appetite}
onChange={setAppetite}
options={appetiteOptions}
/>
</div>

{/*Aktivität*/}
<div>
<labelclassName="label">Aktivität</label>
<ToggleGroup
value={activity}
onChange={setActivity}
options={activityOptions}
/>
</div>

{/*Fell-Problem*/}
<div>
<labelclassName="label">
KotimFell?{}
<spanclassName="text-gray-400font-normaltext-xs">(wichtigbeiLanghaar)</span>
</label>
<YesNoToggle
value={furIssue}
onChange={setFurIssue}
yesLabel="Ja,KotimFell"
noLabel="Nein"
yesColor="bg-orange-500border-orange-500text-white"
/>
</div>

{/*Notiz*/}
<div>
<labelhtmlFor="notes"className="label">
Notiz<spanclassName="text-gray-400font-normal">(optional)</span>
</label>
<textarea
id="notes"
value={notes}
onChange={(e)=>setNotes(e.target.value)}
className="input-fieldresize-none"
rows={3}
placeholder="z.B.hatvielgetrunkenheute"
/>
</div>

{/*Foto*/}
<div>
<labelclassName="label">FotovonJoschi<spanclassName="text-gray-400font-normal">(optional)</span></label>
{photoPreview?(
<divclassName="relative">
<divclassName="relativeh-40rounded-xloverflow-hidden">
<Imagesrc={photoPreview}alt="Vorschau"fillclassName="object-cover"sizes="100vw"/>
</div>
<buttontype="button"onClick={()=>{setPhotoFile(null);setPhotoPreview(null)}}className="absolutetop-2right-2bg-black/50text-whiterounded-fullw-7h-7flexitems-centerjustify-center"></button>
</div>
):(
<labelclassName="flexitems-centergap-3p-4border-2border-dashedborder-gray-200rounded-xlcursor-pointerhover:border-amber-300transition-colors">
<inputref={photoRef}type="file"accept="image/*"capture="environment"className="hidden"onChange={e=>{
constf=e.target.files?.[0]
if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f))}
}}/>
<spanclassName="text-2xl">ðŸ·</span>
<spanclassName="text-smtext-gray-500">Fotoaufnehmenoderauswählen</span>
</label>
)}
</div>

{error&&(
<divclassName="bg-red-50borderborder-red-200text-red-700px-4py-3rounded-xltext-sm">
{error}
</div>
)}

<divclassName="flexgap-3pt-1">
<Linkhref="/dashboard"className="btn-secondarytext-center">
Abbrechen
</Link>
<buttontype="submit"disabled={loading}className="btn-primary">
{loading?Speichern...:Speichern}
</button>
</div>
</form>
</div>
</main>
</div>
)
}

exportdefaultfunctionNewHealthPage(){
return(
<Suspense>
<NewHealthForm/>
</Suspense>
)
}
