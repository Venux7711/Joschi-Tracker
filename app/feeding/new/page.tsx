﻿﻿useclient

import{useState,useEffect,Suspense}fromreact
import{useRouter,useSearchParams}fromnext/navigation
importLinkfromnext/link
importHeaderfrom@/components/Header
import{createClient}from@/lib/supabase/client
import{toLocalISOString}from@/lib/utils

constANIFIT_SORTEN=[
PuterichsDelight(Truthahn),
Powertöpfchen(Lamm/Huhn),
D©licedeCoeur(Huhn),
FischlaMode(Lachs/Huhn/Rentier),
NautilusRagout(Hering/Lachs),
EismeerTerrine(Hering/WeiŸfisch/Lachs),
BioEnten-Energie(Ente),
BioSteakSensation(Rind),
]

constMENGE_LABELS=[Nichts,Sehrwenig,Wenig,Mittel,Viel]

constANIFIT_BRAND=Anifit

functionMengeSlider({
label,
value,
onChange,
}:{
label:string
value:number
onChange:(v:number)=>void
}){
return(
<div>
<divclassName="flexitems-centerjustify-betweenmb-2">
<spanclassName="labelmb-0">{label}</span>
<spanclassName="text-smfont-mediumtext-amber-600">{MENGE_LABELS[value]}</span>
</div>
<input
type="range"
min={0}
max={4}
value={value}
onChange={(e)=>onChange(Number(e.target.value))}
className="w-fullh-2bg-gray-200rounded-lgappearance-nonecursor-pointeraccent-amber-500"
/>
<divclassName="flexjustify-betweentext-xstext-gray-400mt-1">
<span>Nichts</span>
<span>Viel</span>
</div>
</div>
)
}

functionNewFeedingForm(){
constrouter=useRouter()
constsearchParams=useSearchParams()
constdateParam=searchParams.get(date)
constsupabase=createClient()

const[catId,setCatId]=useState<string|null>(null)
const[foodBrand,setFoodBrand]=useState(Anifit)
const[foodType,setFoodType]=useState()
const[amountGrams,setAmountGrams]=useState()
const[loggedAt,setLoggedAt]=useState()
const[notes,setNotes]=useState()
const[treatAmount,setTreatAmount]=useState(0)
const[dryFoodAmount,setDryFoodAmount]=useState(0)
const[extras,setExtras]=useState()
const[loading,setLoading]=useState(false)
const[scanning,setScanning]=useState(false)
const[scanSuccess,setScanSuccess]=useState(false)
const[error,setError]=useState<string|null>(null)
const[prevBrands,setPrevBrands]=useState<string[]>([])
const[prevTypes,setPrevTypes]=useState<string[]>([])
const[pantry,setPantry]=useState<{id:string;brand:string;type:string;quantity:number}[]>([])

constisAnifit=foodBrand.trim().toLowerCase()===anifit

useEffect(()=>{
setLoggedAt(dateParam?`${dateParam}T12:00`:toLocalISOString())

constinit=async()=>{
const{data:{user}}=awaitsupabase.auth.getUser()
if(!user)return

const{data:cats}=awaitsupabase
.from(cats)
.select(id)
.limit(1)

if(cats&&cats.length>0)setCatId(cats[0].id)

const{data:logs}=awaitsupabase
.from(feeding_logs)
.select(food_brand,food_type)
.eq(user_id,user.id)
.order(logged_at,{ascending:false})
.limit(100)

if(logs){
constbrands=Array.from(newSet(logs.map((l)=>l.food_brand))).filter(Boolean)
consttypes=Array.from(newSet(logs.map((l)=>l.food_type))).filter(Boolean)
setPrevBrands(brands)
setPrevTypes(types)
}

constpantryRes=awaitfetch(/api/pantry)
constpantryData=awaitpantryRes.json()
if(pantryData.items)setPantry(pantryData.items)
}

init()
},[])

//SortezurücksetzenwennMarkewechselt
useEffect(()=>{
setFoodType()
},[foodBrand])

consthandleScanImage=async(e:React.ChangeEvent<HTMLInputElement>)=>{
constfile=e.target.files?.[0]
if(!file)return
setScanning(true)
setScanSuccess(false)
setError(null)

constformData=newFormData()
formData.append(image,file)

try{
constres=awaitfetch(/api/analyze-can,{method:POST,body:formData})
constdata=awaitres.json()

if(data.brand)setFoodBrand(data.brand)
if(data.type)setFoodType(data.type)
if(data.amount_grams)setAmountGrams(String(data.amount_grams))
setScanSuccess(true)
}catch{
setError(Dosenscanfehlgeschlagen.Bittemanuelleingeben.)
}finally{
setScanning(false)
e.target.value=
}
}

consthandleSubmit=async(e:React.FormEvent)=>{
e.preventDefault()
if(!catId){
setError(Katzenichtgefunden.BittezuerstdasDashboardöffnen.)
return
}
setLoading(true)
setError(null)

const{data:{user}}=awaitsupabase.auth.getUser()
if(!user)return

const{error:insertError}=awaitsupabase.from(feeding_logs).insert({
cat_id:catId,
user_id:user.id,
logged_at:newDate(loggedAt).toISOString(),
food_brand:foodBrand.trim(),
food_type:foodType.trim(),
amount_grams:amountGrams?parseInt(amountGrams,10):null,
notes:notes.trim()||null,
treat_amount:treatAmount>0?treatAmount:null,
dry_food_amount:dryFoodAmount>0?dryFoodAmount:null,
extras:extras.trim()||null,
})

if(insertError){
setError(FehlerbeimSpeichern.Bitteerneutversuchen.)
setLoading(false)
return
}

//VorratautomatischreduzierenwennSortewechselt
const{data:lastLogs}=awaitsupabase
.from(feeding_logs)
.select(food_brand,food_type)
.eq(cat_id,catId)
.order(logged_at,{ascending:false})
.limit(10)

if(lastLogs&&lastLogs.length>=2){
//LetzterEintragvordemgeradegespeicherten
constprev=lastLogs[1]
constnewBrand=foodBrand.trim().toLowerCase()
constprevBrand=prev.food_brand?.toLowerCase()
constnewType=foodType.trim()
constprevType=prev.food_type

//Sortehatgewechselt†’alteDoseistleer
if(prevBrand===newBrand&&prevType&&prevType!==newType){
constprevPantryItem=pantry.find(
p=>p.brand.toLowerCase()===prevBrand&&p.type===prevType&&p.quantity>0
)
if(prevPantryItem){
awaitfetch(/api/pantry,{
method:PATCH,
headers:{Content-Type:application/json},
body:JSON.stringify({id:prevPantryItem.id,quantity:prevPantryItem.quantity-1}),
})
}
}
}

router.push(/dashboard)
}

//Marken-Liste:Anifitimmerzuerst,dannandere
constbrandOptions=[
Anifit,
...prevBrands.filter((b)=>b.toLowerCase()!==anifit),
]

//Sorten-Liste:Vorrats-SortenderjeweiligenMarke,sonstfrühereEingaben
constpantryForBrand=pantry.filter(
(p)=>p.brand.toLowerCase()===foodBrand.trim().toLowerCase()&&p.quantity>0
)
consttypeOptions=pantryForBrand.length>0
?pantryForBrand.map((p)=>p.type)
:isAnifit
?ANIFIT_SORTEN
:prevTypes

return(
<divclassName="min-h-screen">
<Header/>

<mainclassName="max-w-2xlmx-autopx-4py-6">
<divclassName="flexitems-centergap-3mb-6">
<Linkhref="/dashboard"className="text-gray-400hover:text-gray-600transition-colors">
†Zurück
</Link>
<h1className="text-xlfont-boldtext-gray-800">ðŸ½ï¸Futtereintragen</h1>
</div>

{/*Dosenscan*/}
<divclassName="cardp-4mb-4">
<labelclassName="flexflex-colitems-centergap-2cursor-pointer">
<input
type="file"
accept="image/*"
capture="environment"
className="hidden"
onChange={handleScanImage}
disabled={scanning}
/>
<divclassName={`w-14h-14rounded-fullflexitems-centerjustify-centertext-2xltransition-colors${
scanning?bg-amber-100:scanSuccess?bg-green-100:bg-amber-50hover:bg-amber-100
}`}>
{scanning?³:scanSuccess?:ðŸ·}
</div>
<spanclassName="text-smfont-mediumtext-gray-700">
{scanning?Dosewirdanalysiert:scanSuccess?Felderausgefüllt!:Dosefotografieren}
</span>
<spanclassName="text-xstext-gray-400">
Kameraöffnen†’Formularwirdautomatischausgefüllt
</span>
</label>
</div>

<divclassName="cardp-5">
<formonSubmit={handleSubmit}className="space-y-5">

{/*Marke*/}
<div>
<labelhtmlFor="foodBrand"className="label">Marke*</label>
<select
id="foodBrand"
value={foodBrand}
onChange={(e)=>setFoodBrand(e.target.value)}
className="input-field"
required
>
{brandOptions.map((b)=>(
<optionkey={b}value={b}>{b}</option>
))}
{!brandOptions.some((b)=>b.toLowerCase()===foodBrand.toLowerCase())&&foodBrand&&(
<optionvalue={foodBrand}>{foodBrand}</option>
)}
</select>
</div>

{/*Sorte*/}
<div>
<labelhtmlFor="foodType"className="label">Sorte*</label>
{typeOptions.length>0?(
<select
id="foodType"
value={foodType}
onChange={(e)=>setFoodType(e.target.value)}
className="input-field"
required
>
<optionvalue="">Sortewählen</option>
{typeOptions.map((t)=>{
conststock=pantry.find(p=>p.type===t)
return(
<optionkey={t}value={t}>
{t}{stock?`(${stock.quantity}Dose${stock.quantity!==1?n:})`:}
</option>
)
})}
</select>
):(
<input
id="foodType"
type="text"
value={foodType}
onChange={(e)=>setFoodType(e.target.value)}
className="input-field"
placeholder="z.B.NassfutterHuhn"
required
/>
)}
</div>

{/*Menge*/}
<div>
<labelhtmlFor="amountGrams"className="label">
MengeinGramm<spanclassName="text-gray-400font-normal">(optional)</span>
</label>
<input
id="amountGrams"
type="number"
min="1"
max="999"
value={amountGrams}
onChange={(e)=>setAmountGrams(e.target.value)}
className="input-field"
placeholder="z.B.800"
/>
</div>

{/*Uhrzeit*/}
<div>
<labelhtmlFor="loggedAt"className="label">Uhrzeit*</label>
<input
id="loggedAt"
type="datetime-local"
value={loggedAt}
onChange={(e)=>setLoggedAt(e.target.value)}
className="input-field"
required
/>
</div>

<hrclassName="border-gray-100"/>

{/*Leckerli*/}
<MengeSlider
label="ðŸLeckerli"
value={treatAmount}
onChange={setTreatAmount}
/>

{/*Trockenfutter*/}
<MengeSlider
label="ðŸ¥£Trockenfutter"
value={dryFoodAmount}
onChange={setDryFoodAmount}
/>

{/*Sonstiges*/}
<div>
<labelhtmlFor="extras"className="label">
Sonstigesbekommen<spanclassName="text-gray-400font-normal">(optional)</span>
</label>
<input
id="extras"
type="text"
value={extras}
onChange={(e)=>setExtras(e.target.value)}
className="input-field"
placeholder="z.B.Thunfisch,Hühnchengekocht"
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
rows={2}
placeholder="z.B.hatallesaufgefressen"
/>
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

exportdefaultfunctionNewFeedingPage(){
return(
<Suspense>
<NewFeedingForm/>
</Suspense>
)
}
