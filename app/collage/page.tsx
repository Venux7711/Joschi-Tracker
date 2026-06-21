﻿﻿useclient

import{useState,useEffect}fromreact
importImagefromnext/image
importLinkfromnext/link
importHeaderfrom@/components/Header
import{createClient}from@/lib/supabase/client

interfacePhoto{id:string;public_url:string;mood_tag:string;taken_at:string}

interfaceDayData{
date:string
label:string
photo:Photo|null
stool:string|null
feedings:number
}

constSTOOL_INFO:Record<string,{emoji:string;color:string;label:string}>={
normal:{emoji:,color:#22c55e,label:Normal},
soft:{emoji:~,color:#eab308,label:Weich},
diarrhea:{emoji:,color:#ef4444,label:Durchfall},
not_observed:{emoji:,color:#9ca3af,label:N/A},
}

constWEEKDAYS=[So,Mo,Di,Mi,Do,Fr,Sa]

exportdefaultfunctionCollagePage(){
constsupabase=createClient()
const[days,setDays]=useState<DayData[]>([])
const[loading,setLoading]=useState(true)
const[aiSummary,setAiSummary]=useState()
const[summaryLoading,setSummaryLoading]=useState(false)

useEffect(()=>{
constload=async()=>{
const{data:cats}=awaitsupabase.from(cats).select(id).limit(1)
constcatId=cats?.[0]?.id
if(!catId){setLoading(false);return}

consttoday=newDate()
constsince=newDate(today)
since.setDate(today.getDate()-6)
constsinceStr=since.toISOString().slice(0,10)
consttodayStr=today.toISOString().slice(0,10)

//3parallelbatchqueriesinsteadof21sequential
const[healthRes,feedRes,photoRes]=awaitPromise.all([
supabase.from(health_logs).select(stool_consistency,logged_at)
.eq(cat_id,catId)
.gte(logged_at,`${sinceStr}T00:00:00`)
.lte(logged_at,`${todayStr}T23:59:59`),
supabase.from(feeding_logs).select(logged_at)
.eq(cat_id,catId)
.gte(logged_at,`${sinceStr}T00:00:00`)
.lte(logged_at,`${todayStr}T23:59:59`),
fetch(`/api/photos?startDate=${sinceStr}&endDate=${todayStr}&limit=7`).then(r=>r.json()),
])

//Groupbydate
conststoolByDate:Record<string,string>={}
healthRes.data?.forEach(h=>{stoolByDate[h.logged_at.slice(0,10)]=h.stool_consistency})

constfeedsByDate:Record<string,number>={}
feedRes.data?.forEach(f=>{
constd=f.logged_at.slice(0,10)
feedsByDate[d]=(feedsByDate[d]??0)+1
})

constphotoByDate:Record<string,Photo>={}
;(photoRes.photos??[]).forEach((p:Photo)=>{
constd=p.taken_at.slice(0,10)
if(!photoByDate[d])photoByDate[d]=p
})

constresult:DayData[]=[]
for(leti=6;i>=0;i--){
constd=newDate(today)
d.setDate(today.getDate()-i)
constdateStr=d.toISOString().slice(0,10)
result.push({
date:dateStr,
label:`${WEEKDAYS[d.getDay()]}${d.getDate()}.${d.getMonth()+1}.`,
stool:stoolByDate[dateStr]??null,
feedings:feedsByDate[dateStr]??0,
photo:photoByDate[dateStr]??null,
})
}

setDays(result)
setLoading(false)
}
load()
},[])

constgenerateSummary=async()=>{
setSummaryLoading(true)
constgood=days.filter(d=>!d.stool||d.stool===normal).length
constbad=days.filter(d=>d.stool===diarrhea).length
consttotalFeedings=days.reduce((s,d)=>s+d.feedings,0)
try{
constr=awaitfetch(/api/analyze-health,{
method:POST,
headers:{Content-Type:application/json},
body:JSON.stringify({
feedings:[],
health:days.filter(d=>d.stool).map(d=>({
date:d.label,stool:d.stool,appetite:good,activity:normal,vomiting:false,furIssue:false,
})),
}),
})
constdata=awaitr.json()
consttext=(data.analysis??).replace(/\*\*/g,)
setAiSummary(text.split(\n\n)[0].slice(0,250))
}catch{
setAiSummary(`${good}guteTage,${bad}Durchfall-Tage,${totalFeedings}FütterungendieseWoche.`)
}
setSummaryLoading(false)
}

constgoodDays=days.filter(d=>!d.stool||d.stool===normal).length
constdiarrheaDays=days.filter(d=>d.stool===diarrhea).length
consttotalFeedings=days.reduce((s,d)=>s+d.feedings,0)

return(
<divclassName="min-h-screen">
<Header/>
<mainclassName="max-w-2xlmx-autopx-4py-6">
<divclassName="flexitems-centergap-3mb-6">
<Linkhref="/dashboard"className="text-gray-400hover:text-gray-600">†Zurück</Link>
<h1className="text-xlfont-boldtext-gray-800">ðŸï¸Wochenrückblick</h1>
</div>

{/*Stats*/}
<divclassName="gridgrid-cols-3gap-3mb-5">
<divclassName="cardp-3text-center">
<divclassName="text-2xlfont-blacktext-green-600">{goodDays}</div>
<divclassName="text-xstext-gray-500">GuteTage</div>
</div>
<divclassName="cardp-3text-center">
<divclassName="text-2xlfont-blacktext-red-500">{diarrheaDays}</div>
<divclassName="text-xstext-gray-500">Durchfall</div>
</div>
<divclassName="cardp-3text-center">
<divclassName="text-2xlfont-blacktext-amber-600">{totalFeedings}</div>
<divclassName="text-xstext-gray-500">Fütterungen</div>
</div>
</div>

{/*Grid*/}
{loading?(
<divclassName="gridgrid-cols-4gap-2">
{Array.from({length:7}).map((_,i)=>(
<divkey={i}className="aspect-squarebg-gray-200rounded-2xlanimate-pulse"/>
))}
</div>
):(
<divclassName="gridgrid-cols-4gap-2mb-5">
{days.map(day=>{
conststoolInfo=STOOL_INFO[day.stool??not_observed]
return(
<divkey={day.date}className="aspect-squarerelativerounded-2xloverflow-hidden">
{day.photo?(
<Imagesrc={day.photo.public_url}alt={day.label}fillclassName="object-cover"sizes="25vw"/>
):(
<divclassName="w-fullh-fullflexitems-centerjustify-center"style={{background:`${stoolInfo.color}20`}}>
<spanclassName="text-2xl"style={{color:stoolInfo.color}}>{stoolInfo.emoji}</span>
</div>
)}
<divclassName="absoluteinset-x-0bottom-0bg-gradient-to-tfrom-black/70to-transparentp-1.5">
<pclassName="text-whitetext-[10px]font-boldleading-tight">{day.label}</p>
<divclassName="flexitems-centergap-1">
<spanclassName="text-[9px]"style={{color:stoolInfo.color}}></span>
{day.feedings>0&&<spanclassName="text-white/60text-[9px]">{day.feedings}</span>}
</div>
</div>
</div>
)
})}
</div>
)}

{/*AISummary*/}
<divclassName="cardp-4mb-3">
<divclassName="flexitems-centerjustify-betweenmb-3">
<pclassName="font-semiboldtext-gray-800">KI-Zusammenfassung</p>
<button
onClick={generateSummary}
disabled={summaryLoading||loading}
className="px-3py-1.5rounded-lgtext-smfont-mediumbg-violet-100text-violet-700hover:bg-violet-200transition-colorsdisabled:opacity-50"
>
{summaryLoading?³:Erstellen}
</button>
</div>
{aiSummary?(
<pclassName="text-gray-600text-smleading-relaxed">{aiSummary}</p>
):(
<pclassName="text-gray-400text-sm">TippeaufžErstellen"füreineKI-ZusammenfassungderWoche.</p>
)}
</div>

<Linkhref="/slideshow"className="cardp-4flexitems-centerjustify-betweenhover:shadow-mdtransition-shadow">
<div>
<pclassName="font-semiboldtext-gray-800">ðŸ¬Foto-Diashow</p>
<pclassName="text-xstext-gray-500">AlleFotosalsanimiertePräsentation</p>
</div>
<spanclassName="text-gray-400">†’</span>
</Link>
</main>
</div>
)
}
